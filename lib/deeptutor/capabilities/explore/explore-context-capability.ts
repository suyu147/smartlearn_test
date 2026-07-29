/**
 * ExploreContextCapability — Deep reading and context exploration.
 *
 * Wraps source exploration as a LoopCapability:
 * - Reads attached documents/sources deeply
 * - Searches knowledge bases via RAG
 * - Supplements with web research
 * - Synthesizes findings into structured understanding
 *
 * Designed for "I want to understand this topic deeply" use cases
 * before jumping into problem-solving.
 *
 * Migrated from DeepTutor Python: deeptutor/capabilities/explore_context.py (new)
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
import { assembleExplorePrompt } from './prompt-assembler';
import { guardContextWindow, truncateHistory } from '../chat/context-guard';
import { cleanThinkingTags } from '../chat/think-filter';
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
// ExploreContextCapability
// ---------------------------------------------------------------------------

export class ExploreContextCapability extends LoopCapability {
  readonly manifest = createCapabilityManifest({
    name: 'explore_context',
    description: '深度阅读与上下文探索 — 发现、阅读和综合信息来源',
    stages: ['discover', 'read', 'synthesize'],
    toolsUsed: [
      'read_source',
      'rag',
      'web_search',
      'web_fetch',
      'brainstorm',
      'reason',
    ],
    cliAliases: ['explore', 'explore_context', 'explore-context', 'deep_read'],
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
   * Execute the explore context pipeline.
   *
   * Steps:
   * 1. Build tool set (exploration tools + standard tools)
   * 2. Assemble explore system prompt with source manifest
   * 3. Convert conversation history to BaseMessage[]
   * 4. Prepend system prompt, append user message
   * 5. Apply context window guard
   * 6. Resolve language model
   * 7. Run agent loop
   * 8. Clean thinking tags from final response
   * 9. Emit result
   */
  async run(context: UnifiedContext, stream: StreamBus): Promise<void> {
    const bus = stream as StreamBusImpl;
    const config = { ...DEFAULT_LOOP_CONFIG, ...context.configOverrides };

    // ------------------------------------------------------------------
    // Stage: discover — prepare tools and prompt
    // ------------------------------------------------------------------
    const endDiscover = bus.enterStage('discover', 'explore_context');

    const toolInstances = this.composition.buildToolSet({
      userEnabledTools: this.manifest.toolsUsed,
    });

    const systemPrompt = assembleExplorePrompt({
      language: context.language || 'en',
      enabledTools: toolInstances.map((t) => t.name),
      knowledgeBases: context.knowledgeBases,
      memoryContext: context.memoryContext,
      sourceManifest: context.sourceManifest,
    });

    let messages = this.convertHistoryToMessages(context.conversationHistory);

    messages = [
      new SystemMessage({ content: systemPrompt }),
      ...messages,
      await buildUserMessage(context),
    ];

    const contextWindowTokens =
      typeof config.contextWindowTokens === 'number'
        ? config.contextWindowTokens
        : DEFAULT_LOOP_CONFIG.contextWindowTokens;

    messages = guardContextWindow(messages, contextWindowTokens);
    messages = truncateHistory(messages, contextWindowTokens);

    endDiscover();

    // ------------------------------------------------------------------
    // Stage: read (agent loop handles read + synthesize internally)
    // ------------------------------------------------------------------
    const endRead = bus.enterStage('read', 'explore_context');

    const model = await this.resolveModel(context);

    const toolDefinitions = toolInstances.map((t) => t.getDefinition());
    const aiTools = toAISDKTools(toolDefinitions);

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
      endRead();
      const errorMsg = error instanceof Error ? error.message : String(error);
      bus.emitError(`上下文探索失败: ${errorMsg}`, 'explore_context');
      return;
    }

    endRead();

    // Clean thinking tags from final response
    const cleanedText = cleanThinkingTags(result.text);

    // Emit the cleaned result
    bus.emitResult({
      text: cleanedText,
      iterations: result.iterationCount,
      messageCount: result.messages.length,
    });
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async resolveModel(
    context: UnifiedContext,
  ): Promise<import('ai').LanguageModel> {
    const { getModel } = await import('@/lib/ai/providers');

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
          messages.push(new HumanMessage({ content }));
          break;
      }
    }

    return messages;
  }
}
