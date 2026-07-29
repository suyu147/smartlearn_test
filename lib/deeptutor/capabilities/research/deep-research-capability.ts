/**
 * DeepResearchCapability — Multi-phase research with citations.
 *
 * Four-phase approach (matching DeepTutor's ResearchPipeline):
 * 1. Rephrase: Refine the research question
 * 2. Decompose: Break into sub-topics
 * 3. Research: Per-block agentic exploration with citations
 * 4. Report: Structured report with references
 *
 * Modes: notes, report, comparison, learning_path
 * Depths: quick, standard, deep
 *
 * Migrated from: deeptutor/capabilities/deep_research.py (100 lines)
 * + deeptutor/agents/research/pipeline.py (1000+ lines)
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
import { assembleResearchPrompt } from './prompt-assembler';
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

export class DeepResearchCapability extends LoopCapability {
  readonly manifest = createCapabilityManifest({
    name: 'deep_research',
    description: '多阶段深度研究 — 子主题分解、引用与结构化报告',
    stages: ['rephrasing', 'decomposing', 'researching', 'reporting'],
    toolsUsed: [
      'rag',
      'web_search',
      'web_fetch',
      'paper_search',
      'code_execution',
      'reason',
      'brainstorm',
      'read_source',
    ],
    cliAliases: ['research', 'deep_research', 'deep-research'],
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

  async run(context: UnifiedContext, stream: StreamBus): Promise<void> {
    const bus = stream as StreamBusImpl;
    const config = { ...DEFAULT_LOOP_CONFIG, ...context.configOverrides };

    // Extract research config from metadata
    const mode = (context.metadata.mode as string) ?? 'report';
    const depth = (context.metadata.depth as string) ?? 'standard';

    // ------------------------------------------------------------------
    // Stage: rephrasing — prepare and optionally refine
    // ------------------------------------------------------------------
    const endRephrasing = bus.enterStage('rephrasing', 'deep_research');

    const toolInstances = this.composition.buildToolSet({
      userEnabledTools: this.manifest.toolsUsed,
    });

    const systemPrompt = assembleResearchPrompt({
      language: context.language || 'en',
      enabledTools: toolInstances.map((t) => t.name),
      mode: mode as 'notes' | 'report' | 'comparison' | 'learning_path',
      depth: depth as 'quick' | 'standard' | 'deep',
      memoryContext: context.memoryContext,
      knowledgeBases: context.knowledgeBases,
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

    endRephrasing();

    // ------------------------------------------------------------------
    // Stage: decomposing (agent loop handles all 4 phases internally)
    // ------------------------------------------------------------------
    const endDecomposing = bus.enterStage('decomposing', 'deep_research');

    const model = await this.resolveModel(context);

    const toolDefinitions = toolInstances.map((t) => t.getDefinition());
    const aiTools = toAISDKTools(toolDefinitions);

    // Research needs more iterations due to multi-phase nature
    const maxIterations = typeof config.maxIterations === 'number'
      ? config.maxIterations
      : Math.max(DEFAULT_LOOP_CONFIG.maxIterations, 30);

    const loopConfig: AgentLoopConfig = {
      model,
      tools: aiTools,
      toolRegistry: this.toolRegistry,
      maxIterations,
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
      endDecomposing();
      const errorMsg = error instanceof Error ? error.message : String(error);
      bus.emitError(`深度研究失败: ${errorMsg}`, 'deep_research');
      return;
    }

    endDecomposing();

    const cleanedText = cleanThinkingTags(result.text);

    bus.emitResult({
      text: cleanedText,
      iterations: result.iterationCount,
      messageCount: result.messages.length,
      mode,
      depth,
    });
  }

  private async resolveModel(context: UnifiedContext): Promise<import('ai').LanguageModel> {
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
    const { model } = getModel({ providerId: providerId as ProviderId, modelId, apiKey, baseUrl });
    return model;
  }

  private convertHistoryToMessages(history: Record<string, unknown>[]): BaseMessage[] {
    const messages: BaseMessage[] = [];
    for (const entry of history) {
      const role = entry.role as string;
      const content = (entry.content as string) ?? '';
      switch (role) {
        case 'system': messages.push(new SystemMessage({ content })); break;
        case 'user': messages.push(new HumanMessage({ content })); break;
        case 'assistant': {
          const toolCalls = entry.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }> | undefined;
          if (toolCalls?.length) {
            messages.push(new AIMessage({ content, tool_calls: toolCalls.map((tc) => ({ id: tc.id, name: tc.function.name, args: tc.function.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {}, type: 'tool_call' as const })) }));
          } else {
            messages.push(new AIMessage({ content }));
          }
          break;
        }
        case 'tool': messages.push(new ToolMessage({ content, tool_call_id: (entry.tool_call_id as string) ?? '', name: (entry.name as string) ?? '' })); break;
        default: messages.push(new HumanMessage({ content })); break;
      }
    }
    return messages;
  }
}
