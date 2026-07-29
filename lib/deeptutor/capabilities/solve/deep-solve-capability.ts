/**
 * DeepSolveCapability — Structured problem-solving with plan-execute-synthesize.
 *
 * Wraps the solve pipeline as a LoopCapability:
 * 1. Pre-retrieve: gather context
 * 2. Plan: create step-by-step plan (solve_plan tool)
 * 3. Solve steps: execute each step (solve_finish_step tool)
 * 4. Synthesize: combine results
 *
 * Replanning via solve_replan when the approach fails.
 *
 * Migrated from DeepTutor Python: deeptutor/capabilities/solve.py
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
import { assembleSolvePrompt } from './prompt-assembler';
import { guardContextWindow, truncateHistory } from '../chat/context-guard';
import { cleanThinkingTags } from '../chat/think-filter';
import { buildUserMessage } from '../shared/vision-helper';
import { clearSolveStepResults } from '@/lib/deeptutor/tools/solve-finish-step';
import { resetReplanState } from '@/lib/deeptutor/tools/solve-replan';

import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';

import type { ProviderId } from '@/lib/types/provider';

// ---------------------------------------------------------------------------
// DeepSolveCapability
// ---------------------------------------------------------------------------

export class DeepSolveCapability extends LoopCapability {
  readonly manifest = createCapabilityManifest({
    name: 'deep_solve',
    description: '结构化解题 — 规划-执行-综合流程',
    stages: ['pre_retrieve', 'planning', 'solving', 'synthesizing'],
    toolsUsed: [
      'solve_plan',
      'solve_finish_step',
      'solve_replan',
      'brainstorm',
      'reason',
      'web_search',
      'web_fetch',
      'read_source',
      'rag',
    ],
    cliAliases: ['solve', 'deep_solve', 'deep-solve'],
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
   * Execute the deep solve pipeline.
   *
   * Steps:
   * 1. Reset solve tool state (step results, replan flags)
   * 2. Build tool set (solve-specific + standard tools)
   * 3. Assemble solve system prompt
   * 4. Convert conversation history to BaseMessage[]
   * 5. Prepend system prompt, append user message
   * 6. Apply context window guard
   * 7. Resolve language model
   * 8. Run agent loop
   * 9. Clean thinking tags from final response
   * 10. Emit result
   */
  async run(context: UnifiedContext, stream: StreamBus): Promise<void> {
    const bus = stream as StreamBusImpl;
    const config = { ...DEFAULT_LOOP_CONFIG, ...context.configOverrides };

    // ------------------------------------------------------------------
    // Stage: pre_retrieve — reset state and prepare tools
    // ------------------------------------------------------------------
    const endPreRetrieve = bus.enterStage('pre_retrieve', 'deep_solve');

    // Reset module-level state in solve tools
    clearSolveStepResults();
    resetReplanState();

    // Build tool set — include solve tools + standard tools
    const toolInstances = this.composition.buildToolSet({
      userEnabledTools: this.manifest.toolsUsed,
    });

    endPreRetrieve();

    // ------------------------------------------------------------------
    // Stage: planning — assemble prompt and prepare messages
    // ------------------------------------------------------------------
    const endPlanning = bus.enterStage('planning', 'deep_solve');

    const systemPrompt = assembleSolvePrompt({
      language: context.language || 'en',
      enabledTools: toolInstances.map((t) => t.name),
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

    endPlanning();

    // ------------------------------------------------------------------
    // Stage: solving (agent loop encompasses solving + synthesizing)
    // ------------------------------------------------------------------
    const endSolving = bus.enterStage('solving', 'deep_solve');

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
      endSolving();
      const errorMsg = error instanceof Error ? error.message : String(error);
      bus.emitError(`深度解题失败: ${errorMsg}`, 'deep_solve');
      return;
    }

    endSolving();

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
