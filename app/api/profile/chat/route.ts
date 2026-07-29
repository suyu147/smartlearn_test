/**
 * POST /api/profile/chat — Profile-building chat via learning graph
 *
 * Streams LearnEvents as SSE in the format expected by processSSEStream.
 * Used by the profile chat UI to build the learner profile through conversation.
 */

import { NextRequest } from 'next/server';
import { compileLearningGraph } from '@/lib/learning-graph/graph';
import { createLearnEventWriter } from '@/lib/deeptutor/capabilities/smartlearn/event-mapper';
import { createStreamEvent } from '@/lib/deeptutor/core/types';
import type { LearnRequest } from '@/lib/learning-graph/types';
import type { LearningStateType } from '@/lib/learning-graph/state';
import { ensureSession, addMessage } from '@/lib/deeptutor/services/session';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProfileChatRoute');

interface ProfileChatRequest {
  message: string;
  profile: Record<string, unknown>;
  conversationHistory: Array<{ role: string; content: string }>;
  aiConfig?: {
    providerId?: string;
    modelId?: string;
    apiKey?: string;
    baseUrl?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ProfileChatRequest;

    const userId = req.headers.get('x-user-id') ?? 'anonymous';
    const sessionId = `profile-${Date.now()}`;
    await ensureSession(sessionId, userId);

    const turnId = `turn_${Date.now()}`;

    const learnRequest: Partial<LearnRequest> = {
      action: 'tutor_chat',
      sessionId,
      profile: (body.profile ?? {}) as unknown as LearnRequest['profile'],
      goal: '',
      message: body.message,
      conversationHistory: body.conversationHistory ?? [],
      aiConfig: body.aiConfig as LearnRequest['aiConfig'],
    };

    const initialState: Partial<LearningStateType> = {
      action: learnRequest.action,
      sessionId,
      profile: (learnRequest.profile ?? {}) as LearningStateType['profile'],
      goal: learnRequest.goal ?? '',
      completedNodes: [],
      currentNodeId: null,
      quizResults: [],
      message: learnRequest.message ?? '',
      conversationHistory: learnRequest.conversationHistory ?? [],
      attachedResources: [],
      currentNodeTitle: null,
      aiConfig: learnRequest.aiConfig ?? undefined,
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
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: import('@/lib/deeptutor/core/types').StreamEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            /* controller closed */
          }
        };

        const learnEventWriter = createLearnEventWriter(emit, sessionId, turnId, 'profile-chat');

        try {
          await addMessage(sessionId, userId, 'user', body.message, {
            capability: 'profile_build',
            metadata: { source: 'profile-chat' },
          });

          await graph.invoke(initialState as LearningStateType, {
            configurable: {
              writer: learnEventWriter,
              sessionId,
              turnId,
              userId,
              profileChat: true,
            },
          });

          const doneEvent = createStreamEvent('done', { sessionId, turnId, source: 'profile-chat' });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error('Profile chat stream error:', err);

          const errorEvent = createStreamEvent('error', {
            sessionId,
            turnId,
            source: 'profile-chat',
            content: `Profile chat error: ${message}`,
          });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));

          const doneEvent = createStreamEvent('done', { sessionId, turnId, source: 'profile-chat' });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Profile chat handler error:', err);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
