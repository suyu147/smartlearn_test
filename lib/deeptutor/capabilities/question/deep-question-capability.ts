/**
 * DeepQuestionCapability — Quiz/question generation pipeline.
 *
 * Three-phase approach (matching DeepTutor's QuestionPipeline):
 * 1. Explore: Research the topic with tools
 * 2. Plan: Design question templates
 * 3. Generate: Produce each question with validation
 *
 * Modes: custom (topic-based), followup (follow-up questions)
 *
 * Migrated from: deeptutor/capabilities/deep_question.py (422 lines)
 * + deeptutor/agents/question/pipeline.py (2180 lines)
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
import { assembleQuestionPrompt } from './prompt-assembler';
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

export class DeepQuestionCapability extends LoopCapability {
  readonly manifest = createCapabilityManifest({
    name: 'deep_question',
    description: '教育测验/题目生成 — 主题研究与多题型支持',
    stages: ['ideation', 'generation'],
    toolsUsed: [
      'brainstorm',
      'reason',
      'rag',
      'web_search',
      'web_fetch',
      'code_execution',
      'read_source',
      'paper_search',
    ],
    cliAliases: ['quiz', 'question', 'deep_question'],
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

    // Determine mode from metadata
    const mode = (context.metadata.mode as string) ?? 'custom';

    // ------------------------------------------------------------------
    // Stage: ideation — prepare tools and prompt
    // ------------------------------------------------------------------
    const endIdeation = bus.enterStage('ideation', 'deep_question');

    const toolInstances = this.composition.buildToolSet({
      userEnabledTools: this.manifest.toolsUsed,
    });

    const systemPrompt = assembleQuestionPrompt({
      language: context.language || 'en',
      enabledTools: toolInstances.map((t) => t.name),
      mode: mode as 'custom' | 'followup' | 'mimic',
      topic: context.metadata.topic as string | undefined,
      numQuestions: context.metadata.numQuestions as number | undefined,
      difficulty: context.metadata.difficulty as string | undefined,
      questionTypes: context.metadata.questionTypes as string[] | undefined,
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

    endIdeation();

    // ------------------------------------------------------------------
    // Stage: generation (agent loop handles explore→plan→quiz internally)
    // ------------------------------------------------------------------
    const endGeneration = bus.enterStage('generation', 'deep_question');

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
      endGeneration();
      const errorMsg = error instanceof Error ? error.message : String(error);
      bus.emitError(`题目生成失败: ${errorMsg}`, 'deep_question');
      return;
    }

    endGeneration();

    const cleanedText = cleanThinkingTags(result.text);

    bus.emitResult({
      text: cleanedText,
      iterations: result.iterationCount,
      messageCount: result.messages.length,
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
