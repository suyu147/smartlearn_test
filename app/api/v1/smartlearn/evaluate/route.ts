import { NextRequest, NextResponse } from 'next/server';
import { compileLearningGraph } from '@/lib/learning-graph/graph';
import { createLearnEventWriter } from '@/lib/deeptutor/capabilities/smartlearn/event-mapper';
import { createStreamEvent } from '@/lib/deeptutor/core/types';
import type { QuizResultPayload } from '@/lib/learning-graph/types';
import type { ProfileDimensions } from '@/lib/types/profile';
import type { LearningPathNode } from '@/lib/types/learning-path';
import type { LearningStateType } from '@/lib/learning-graph/state';
import { createLogger } from '@/lib/logger';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { SmartLearnEvaluateSchema } from '@/lib/server/schemas';
import { createSSEStream } from '@/lib/server/sse-stream';

import { authenticate } from '@/lib/deeptutor/services/auth';

const log = createLogger('api:smartlearn:evaluate');

interface EvaluateRequest {
  sessionId?: string;
  quizResults: QuizResultPayload[];
  profile: ProfileDimensions;
  goal: string;
  completedNodes: LearningPathNode[];
  currentNodeId: string | null;
  currentNodeTitle?: string;
  aiConfig?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string };
}

export async function POST(req: NextRequest) {
  try {
    const validated = await validatedBody(SmartLearnEvaluateSchema, req);
    const body = validated as unknown as EvaluateRequest;

    const userId = await (async () => {
      try { return (await authenticate(req)).id; } catch { return 'anonymous'; }
    })();

    const sessionId = body.sessionId ?? `eval_${Date.now()}`;
    const turnId = `turn_eval_${Date.now()}`;

    log.info(`Evaluate POST: sessionId=${sessionId}, quizResults=${body.quizResults.length}`);

    const initialState: Partial<LearningStateType> = {
      action: 'node_complete',
      sessionId,
      profile: body.profile,
      goal: body.goal,
      completedNodes: body.completedNodes ?? [],
      currentNodeId: body.currentNodeId ?? null,
      quizResults: body.quizResults,
      message: '',
      conversationHistory: [],
      attachedResources: [],
      currentNodeTitle: body.currentNodeTitle ?? null,
      aiConfig: body.aiConfig ?? undefined,
      resourceFeedback: [],
      nodeDecisionOverrides: {},
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

    const graph = compileLearningGraph();

    const stream = createSSEStream('smartlearn:evaluate', sessionId, async (emit) => {
      const learnEventWriter = createLearnEventWriter(emit, sessionId, turnId, 'smartlearn:evaluate');

      await graph.invoke(initialState as LearningStateType, {
        configurable: {
          writer: learnEventWriter,
          sessionId,
          turnId,
          userId,
        },
      });

      const doneEvent = createStreamEvent('done', { sessionId, turnId, source: 'smartlearn:evaluate' });
      emit(doneEvent);

      log.info(`Evaluate stream completed: sessionId=${sessionId}`);
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    if (isValidationError(err) || isSyntaxError(err)) {
      return NextResponse.json(
        { success: false, error: errorToMessage(err) },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error('Evaluate POST handler error:', err);
    return NextResponse.json(
      { success: false, error: `Internal server error: ${message}` },
      { status: 500 },
    );
  }
}
