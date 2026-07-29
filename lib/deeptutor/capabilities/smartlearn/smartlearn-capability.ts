/**
 * SmartLearnCapability — GraphCapability wrapping the learning-graph
 *
 * Bridges the SmartLearn learning-graph (8 nodes, 14 LearnEvent types)
 * with the DeepTutor Capability framework (GraphCapability, StreamBus).
 *
 * The learning-graph is compiled once and cached. Each invocation maps
 * the UnifiedContext into a LearningState, runs the graph, and translates
 * LearnEvent emissions to StreamEvent via the event mapper.
 *
 * Phase 2d: SmartLearn Capability integration
 */

import {
  GraphCapability,
  createCapabilityManifest,
  type CapabilityManifest,
  type StreamBus,
} from '@/lib/deeptutor/core/capability-protocol';
import type { UnifiedContext, StreamEvent } from '@/lib/deeptutor/core/types';
import { createStreamEvent } from '@/lib/deeptutor/core/types';
import { compileLearningGraph } from '@/lib/learning-graph/graph';
import type { LearningStateType } from '@/lib/learning-graph/state';
import type { LearnRequest, LearnEvent } from '@/lib/learning-graph/types';
import { createLearnEventWriter } from './event-mapper';
import { createLogger } from '@/lib/logger';

const log = createLogger('SmartLearnCapability');

// ---------------------------------------------------------------------------
// SmartLearnCapability
// ---------------------------------------------------------------------------

export class SmartLearnCapability extends GraphCapability {
  readonly manifest: CapabilityManifest;
  private compiledGraph: ReturnType<typeof compileLearningGraph> | null = null;

  constructor() {
    super();
    this.manifest = createCapabilityManifest({
      name: 'smartlearn',
      description: '自适应学习流程：画像 → 规划 → 资源 → 评估 → 画像更新循环',
      stages: [
        'plan',
        'analyze',
        'resource_plan',
        'generate',
        'evaluate',
        'update_profile',
        'tutor',
      ],
      toolsUsed: [],
      cliAliases: ['sl', 'learn'],
      requestSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['start', 'node_complete', 'quiz_result', 'tutor_chat'] },
          sessionId: { type: 'string' },
          profile: { type: 'object' },
          goal: { type: 'string' },
          completedNodes: { type: 'array' },
          currentNodeId: { type: ['string', 'null'] },
          quizResults: { type: 'array' },
          message: { type: 'string' },
          conversationHistory: { type: 'array' },
          attachedResources: { type: 'array' },
        },
        required: ['action', 'sessionId', 'profile', 'goal'],
      },
      configDefaults: {
        maxConcurrency: 3,
      },
    });
  }

  // -------------------------------------------------------------------------
  // GraphCapability interface
  // -------------------------------------------------------------------------

  compileGraph(): ReturnType<typeof compileLearningGraph> {
    if (!this.compiledGraph) {
      this.compiledGraph = compileLearningGraph();
      log.info('Learning graph compiled successfully');
    }
    return this.compiledGraph;
  }

  async invoke(
    initialState: Record<string, unknown>,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const graph = this.compileGraph();
    const result = await graph.invoke(initialState as LearningStateType, config);
    return result as Record<string, unknown>;
  }

  // -------------------------------------------------------------------------
  // BaseCapability.run — Entry point from the Orchestrator
  // -------------------------------------------------------------------------

  async run(context: UnifiedContext, stream: StreamBus): Promise<void> {
    log.info(`SmartLearn run: sessionId=${context.sessionId}, action=${context.metadata.action ?? 'start'}`);

    try {
      // Build initial state from context + metadata
      const initialState = this.buildInitialState(context);

      // Create LearnEvent → StreamEvent writer bridge
      const sessionId = context.sessionId;
      const turnId = (context.metadata.turnId as string) ?? '';
      const learnEventWriter = createLearnEventWriter(
        (event) => stream.emit(event),
        sessionId,
        turnId,
        'smartlearn',
      );

      // Enter the top-level stage
      const endStage = stream.enterStage(initialState.phase ?? 'plan', 'smartlearn');

      // Compile and invoke the graph
      const graph = this.compileGraph();
      await graph.invoke(initialState as LearningStateType, {
        configurable: {
          writer: learnEventWriter,
          sessionId,
          turnId,
        },
      });

      endStage();
      stream.emit(createStreamEvent('done', { source: 'smartlearn' }));
      log.info(`SmartLearn run completed: sessionId=${sessionId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('SmartLearn run failed:', err);
      stream.emit(createStreamEvent('error', { content: `SmartLearn 错误: ${message}`, source: 'smartlearn' }));
      stream.emit(createStreamEvent('done', { source: 'smartlearn' }));
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Build the initial LearningState from UnifiedContext.
   *
   * The LearnRequest data is carried in context.metadata (set by the API route).
   * Fields not present in metadata get safe defaults.
   */
  private buildInitialState(context: UnifiedContext): Partial<LearningStateType> {
    const meta = context.metadata;

    return {
      action: (meta.action as LearnRequest['action']) ?? 'start',
      sessionId: context.sessionId,
      profile: (meta.profile as LearnRequest['profile']) ?? {},
      goal: (meta.goal as string) ?? context.userMessage,
      completedNodes: (meta.completedNodes as LearnRequest['completedNodes']) ?? [],
      currentNodeId: (meta.currentNodeId as string | null) ?? null,
      quizResults: (meta.quizResults as LearnRequest['quizResults']) ?? [],
      message: (meta.message as string) ?? context.userMessage,
      conversationHistory: (meta.conversationHistory as LearnRequest['conversationHistory']) ?? [],
      attachedResources: (meta.attachedResources as LearnRequest['attachedResources']) ?? [],
      currentNodeTitle: (meta.currentNodeTitle as string) ?? null,
      aiConfig: (meta.aiConfig as LearnRequest['aiConfig']) ?? undefined,
      resourceFeedback: (meta.resourceFeedback as LearnRequest['resourceFeedback']) ?? [],
      nodeDecisionOverrides: (meta.nodeDecisionOverrides as LearnRequest['nodeDecisionOverrides']) ?? {},
      // Derived/computed fields — set to null (populated by graph nodes)
      currentNode: null,
      learnerSnapshot: null,
      resourcePlan: null,
      generatedResources: [],
      evaluationResult: null,
      evaluationScore: null,
      evaluationFeedback: null,
      updatedProfile: null,
      pptScenes: null,
      phase: '',
    };
  }
}
