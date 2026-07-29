/**
 * ChatCapability — Interactive chat with tool use.
 *
 * The default conversational mode. Wires together:
 * - Tool composition (which tools are available)
 * - Prompt assembly (system prompt from blocks)
 * - Context window guard (prevent overflow)
 * - Agent loop (LLM <-> tool cycle via LangGraph)
 * - Think filter (strip reasoning tags from output)
 *
 * Migrated from DeepTutor Python: deeptutor/capabilities/chat.py
 */

import {
  LoopCapability,
  createCapabilityManifest,
  DEFAULT_LOOP_CONFIG,
} from '@/lib/deeptutor/core/capability-protocol';
import type { StreamBus } from '@/lib/deeptutor/core/capability-protocol';
import type { UnifiedContext } from '@/lib/deeptutor/core/types';
import {
  runAgentLoop,
  toAISDKTools,
} from '@/lib/deeptutor/core/agent-loop';
import type { AgentLoopConfig, AgentLoopResult } from '@/lib/deeptutor/core/agent-loop';
import { ToolRegistry } from '@/lib/deeptutor/tools/registry';
import { ToolComposition } from '@/lib/deeptutor/tools/composition';
import { StreamBusImpl } from '@/lib/deeptutor/core/stream-bus';
import { assembleSystemPrompt } from './prompt-assembler';
import { guardContextWindow, truncateHistory } from './context-guard';
import { cleanThinkingTags } from './think-filter';
import { buildUserMessage } from '../shared/vision-helper';

import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';

import type { ProviderId } from '@/lib/types/provider';

// ---------------------------------------------------------------------------
// ChatCapability
// ---------------------------------------------------------------------------

export class ChatCapability extends LoopCapability {
  readonly manifest = createCapabilityManifest({
    name: 'chat',
    description: '交互式对话与工具调用 — 默认对话模式',
    stages: ['thinking', 'acting', 'observing', 'responding'],
    toolsUsed: ['brainstorm', 'reason', 'web_fetch', 'ask_user', 'web_search'],
    cliAliases: ['chat', 'default'],
  });

  private toolRegistry: ToolRegistry;
  private composition: ToolComposition;

  constructor(toolRegistry: ToolRegistry) {
    super();
    this.toolRegistry = toolRegistry;
    this.composition = new ToolComposition(toolRegistry);
  }

  override get ownedTools(): string[] {
    return this.manifest.toolsUsed;
  }

  /**
   * Execute the chat capability pipeline.
   *
   * Steps:
   * 1. Build tool set via composition
   * 2. Assemble system prompt
   * 3. Convert conversation history to BaseMessage[]
   * 4. Prepend system prompt, append user message
   * 5. Apply context window guard
   * 6. Resolve language model
   * 7. Run agent loop (LangGraph)
   * 8. Clean thinking tags from final response
   * 9. Emit result via stream
   */
  async run(context: UnifiedContext, stream: StreamBus): Promise<void> {
    // Cast to StreamBusImpl for convenience methods — the orchestrator
    // always passes a StreamBusImpl instance.
    const bus = stream as StreamBusImpl;
    const config = { ...DEFAULT_LOOP_CONFIG, ...context.configOverrides };

    // ------------------------------------------------------------------
    // Stage: thinking
    // ------------------------------------------------------------------
    const endThinking = bus.enterStage('thinking', 'chat');

    // 1. Build tool set using composition
    const toolInstances = this.composition.buildToolSet({
      userEnabledTools: context.enabledTools ?? undefined,
    });

    // 2. Assemble system prompt
    const systemPrompt = assembleSystemPrompt({
      language: context.language || 'en',
      enabledTools: toolInstances.map((t) => t.name),
      knowledgeBases: context.knowledgeBases,
      memoryContext: context.memoryContext,
      skillsContext: context.skillsContext,
      sourceManifest: context.sourceManifest,
    });

    // 3. Convert conversation history to BaseMessage[]
    let messages = this.convertHistoryToMessages(context.conversationHistory);

    // 4. Prepend system prompt and append user message (image handling via shared helper)
    const userMessage = await buildUserMessage(context);

    messages = [
      new SystemMessage({ content: systemPrompt }),
      ...messages,
      userMessage,
    ];

    // 5. Apply context window guard
    const contextWindowTokens =
      typeof config.contextWindowTokens === 'number'
        ? config.contextWindowTokens
        : DEFAULT_LOOP_CONFIG.contextWindowTokens;

    messages = guardContextWindow(messages, contextWindowTokens);
    messages = truncateHistory(messages, contextWindowTokens);

    endThinking();

    // ------------------------------------------------------------------
    // Stage: responding (agent loop encompasses acting + observing)
    // ------------------------------------------------------------------
    const endResponding = bus.enterStage('responding', 'chat');

    // 6. Resolve language model from context metadata
    const model = await this.resolveModel(context);

    // Convert tool definitions to AI SDK ToolSet format
    const toolDefinitions = toolInstances.map((t) => t.getDefinition());
    const aiTools = toAISDKTools(toolDefinitions);

    // 7. Build agent loop config and run
    const loopConfig: AgentLoopConfig = {
      model,
      tools: aiTools,
      toolRegistry: this.toolRegistry,
      maxIterations:
        typeof config.maxIterations === 'number'
          ? config.maxIterations
          : DEFAULT_LOOP_CONFIG.maxIterations,
      temperature:
        typeof config.temperature === 'number'
          ? config.temperature
          : DEFAULT_LOOP_CONFIG.temperature,
      contextWindowTokens,
      streamCallback: (event) => bus.emit(event),
      sessionId: context.sessionId,
    };

    let result: AgentLoopResult;
    try {
      result = await runAgentLoop(loopConfig, messages);
    } catch (error) {
      endResponding();
      const errorMsg = error instanceof Error ? error.message : String(error);
      bus.emitError(`智能体循环失败: ${errorMsg}`, 'chat');
      return;
    }

    endResponding();

    // 8. Clean thinking tags from final response
    const cleanedText = cleanThinkingTags(result.text);

    // 9. Emit the cleaned result
    bus.emitResult({
      text: cleanedText,
      iterations: result.iterationCount,
      messageCount: result.messages.length,
    });
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve the LanguageModel from context metadata.
   * Falls back to a default provider/model when metadata is missing.
   */
  private async resolveModel(
    context: UnifiedContext,
  ): Promise<import('ai').LanguageModel> {
    const { getModel } = await import('@/lib/ai/providers');

    // configOverrides takes priority (set by turns route), then metadata, then env defaults
    const overrides = context.configOverrides ?? {};
    const meta = context.metadata ?? {};

    const providerId =
      (overrides.providerId as string) ||
      (meta.providerId as string) ||
      process.env.AI_PROVIDER ||
      'openai';
    const modelId =
      (overrides.modelId as string) ||
      (meta.modelId as string) ||
      process.env.AI_MODEL ||
      'gpt-4o';
    const apiKey =
      (overrides.apiKey as string) ||
      (meta.apiKey as string) ||
      process.env.AI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      '';
    const baseUrl =
      (overrides.baseUrl as string) ||
      (meta.baseUrl as string) ||
      process.env.AI_BASE_URL ||
      undefined;

    const { model } = getModel({
      providerId: providerId as ProviderId,
      modelId,
      apiKey,
      baseUrl,
    });

    return model;
  }

  /**
   * Convert OpenAI-format conversation history to BaseMessage[].
   * Handles roles: system, user, assistant, tool.
   */
  private convertHistoryToMessages(
    history: Record<string, unknown>[],
  ): BaseMessage[] {
    const messages: BaseMessage[] = [];

    for (const entry of history) {
      const role = entry.role as string;
      const content = (entry.content as string) ?? '';

      switch (role) {
        case 'system':
          messages.push(new SystemMessage({ content }));
          break;

        case 'user':
          messages.push(new HumanMessage({ content }));
          break;

        case 'assistant': {
          const toolCalls = entry.tool_calls as
            | Array<{
                id: string;
                type: string;
                function: { name: string; arguments: string };
              }>
            | undefined;

          if (toolCalls && toolCalls.length > 0) {
            // Use LangChain standard tool_calls property so toModelMessages
            // can read them correctly (additional_kwargs is not read by AI SDK)
            messages.push(
              new AIMessage({
                content,
                tool_calls: toolCalls.map((tc) => ({
                  id: tc.id,
                  name: tc.function.name,
                  args: tc.function.arguments
                    ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
                    : {},
                  type: 'tool_call' as const,
                })),
              }),
            );
          } else {
            messages.push(new AIMessage({ content }));
          }
          break;
        }

        case 'tool':
          messages.push(
            new ToolMessage({
              content,
              tool_call_id: (entry.tool_call_id as string) ?? '',
              name: (entry.name as string) ?? '',
            }),
          );
          break;

        default:
          // Unknown role — treat as user message
          messages.push(new HumanMessage({ content }));
          break;
      }
    }

    return messages;
  }
}
