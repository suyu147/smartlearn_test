/**
 * MasteryPathCapability — Learning mastery cycle with quiz-grade-plan loop.
 *
 * Wraps the mastery system as a LoopCapability:
 * - Uses 5 mastery tools: status, quiz, grade, assess, build
 * - Tracks SM-2 inspired mastery scores per topic
 * - Generates LLM-powered quiz questions and learning plans
 *
 * Migrated from DeepTutor Python: deeptutor/capabilities/mastery_path.py (new)
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
import { assembleMasteryPrompt } from './prompt-assembler';
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
// MasteryPathCapability
// ---------------------------------------------------------------------------

export class MasteryPathCapability extends LoopCapability {
  readonly manifest = createCapabilityManifest({
    name: 'mastery_path',
    description: '学习掌握循环 — 评估、测验、评分和构建学习计划',
    stages: ['assess', 'quiz', 'grade', 'build_plan'],
    toolsUsed: [
      'mastery_status',
      'mastery_quiz',
      'mastery_grade',
      'mastery_assess',
      'mastery_build',
      'read_source',
      'rag',
    ],
    cliAliases: ['mastery', 'mastery_path', 'mastery-path'],
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
   * Execute the mastery path pipeline.
   *
   * Steps:
   * 1. Build tool set (mastery tools + standard tools)
   * 2. Assemble mastery system prompt
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
    // Stage: assess — prepare tools and prompt
    // ------------------------------------------------------------------
    const endAssess = bus.enterStage('assess', 'mastery_path');

    const toolInstances = this.composition.buildToolSet({
      userEnabledTools: this.manifest.toolsUsed,
    });

    const systemPrompt = assembleMasteryPrompt({
      language: context.language || 'en',
      enabledTools: toolInstances.map((t) => t.name),
      memoryContext: context.memoryContext,
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

    endAssess();

    // ------------------------------------------------------------------
    // Stage: quiz (agent loop handles quiz + grade + build internally)
    // ------------------------------------------------------------------
    const endQuiz = bus.enterStage('quiz', 'mastery_path');

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
      endQuiz();
      const errorMsg = error instanceof Error ? error.message : String(error);
      bus.emitError(`掌握路径失败: ${errorMsg}`, 'mastery_path');
      return;
    }

    endQuiz();

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
