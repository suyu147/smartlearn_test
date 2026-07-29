import { NextRequest, NextResponse } from 'next/server';
import { compileLearningGraph } from '@/lib/learning-graph/graph';
import { createLearnEventWriter } from '@/lib/deeptutor/capabilities/smartlearn/event-mapper';
import { createStreamEvent } from '@/lib/deeptutor/core/types';
import type { LearnRequest } from '@/lib/learning-graph/types';
import type { LearningStateType } from '@/lib/learning-graph/state';
import { createLogger } from '@/lib/logger';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { SmartLearnRequestSchema } from '@/lib/server/schemas';
import { createSSEStream } from '@/lib/server/sse-stream';

import { authenticate } from '@/lib/deeptutor/services/auth';

const log = createLogger('api:smartlearn');

export async function GET(_req: NextRequest) {
  return NextResponse.json({ success: true, data: [] });
}

export async function POST(req: NextRequest) {
  try {
    const validated = await validatedBody(SmartLearnRequestSchema, req);
    const body = validated as unknown as LearnRequest;

    const userId = req.headers.get('x-user-id') ?? (await (async () => {
      try { return (await authenticate(req)).id; } catch { return 'anonymous'; }
    })());

    const sessionId = body.sessionId;
    const turnId = `turn_${Date.now()}`;

    log.info(`SmartLearn POST: sessionId=${sessionId}, action=${body.action}`);

    const initialState: Partial<LearningStateType> = {
      action: body.action,
      sessionId,
      profile: body.profile ?? {},
      goal: body.goal,
      completedNodes: body.completedNodes ?? [],
      currentNodeId: body.currentNodeId ?? null,
      quizResults: body.quizResults ?? [],
      message: body.message ?? '',
      conversationHistory: body.conversationHistory ?? [],
      attachedResources: body.attachedResources ?? [],
      currentNodeTitle: body.currentNodeTitle ?? null,
      aiConfig: body.aiConfig ?? undefined,
      resourceFeedback: body.resourceFeedback ?? [],
      nodeDecisionOverrides: body.nodeDecisionOverrides ?? {},
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

    const stream = createSSEStream('smartlearn', sessionId, async (emit) => {
      const learnEventWriter = createLearnEventWriter(emit, sessionId, turnId, 'smartlearn');

      await graph.invoke(initialState as LearningStateType, {
        configurable: {
          writer: learnEventWriter,
          sessionId,
          turnId,
          userId,
        },
      });

      const doneEvent = createStreamEvent('done', { sessionId, turnId, source: 'smartlearn' });
      emit(doneEvent);

      log.info(`SmartLearn stream completed: sessionId=${sessionId}`);
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
    log.error('SmartLearn POST handler error:', err);
    return NextResponse.json(
      { success: false, error: `Internal server error: ${message}` },
      { status: 500 },
    );
  }
}
