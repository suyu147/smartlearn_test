/**
 * POST /api/chat — Multi-agent chat via director graph
 *
 * This route powers the workspace chat panel. It accepts a StatelessChatRequest
 * from the frontend, compiles the director graph, and streams StatelessEvents
 * back as SSE in the format expected by processSSEStream.
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import {
  createOrchestrationGraph,
  buildInitialState,
} from '@/lib/orchestration/director-graph';
import { resolveModel } from '@/lib/server/resolve-model';
import { parseModelString } from '@/lib/ai/providers';
import type { StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';

const log = createLogger('ChatRoute');

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StatelessChatRequest;

    // Resolve the LLM model from the request
    const { providerId, modelId } = parseModelString(body.model ?? '');
    const { model } = resolveModel({
      providerId,
      modelId,
      apiKey: body.apiKey || undefined,
      baseUrl: body.baseUrl || undefined,
      providerType: body.providerType as 'openai' | 'anthropic' | 'google' | undefined,
    });

    // Build initial state and run the director graph
    const initialState = buildInitialState(body, model);
    const graph = createOrchestrationGraph();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const write = (event: StatelessEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            /* controller closed */
          }
        };

        try {
          await graph.invoke(initialState, {
            configurable: { writer: write },
          });

          write({ type: 'done', data: { totalActions: 0, totalAgents: 1 } });
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error('Chat route error:', err);
          write({ type: 'error', data: { message } });
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
    log.error('Chat route handler error:', err);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
