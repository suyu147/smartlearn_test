/**
 * GET  /api/v1/sessions — List user's sessions
 * POST /api/v1/sessions — Create a new session
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { listSessions, createSession } from '@/lib/deeptutor/services/session';

const log = createLogger('SessionsRoute');

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') ?? 'anonymous';
}

function apiError(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error('error', err);
  return new Response(JSON.stringify({ error: message }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const url = new URL(req.url);
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;
    const offset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined;

    const sessions = await listSessions(userId, { limit, offset });
    return new Response(JSON.stringify({ success: true, data: sessions }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/sessions failed:', err);
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const { validatedBody } = await import('@/lib/server/validate');
    const { SessionCreateSchema } = await import('@/lib/server/schemas');
    const body = await validatedBody(SessionCreateSchema, req);

    const sessionId = await createSession(userId, {
      title: body.title,
      capability: body.capability,
      preferences: body.preferences,
      metadata: body.metadata,
    });
    return new Response(JSON.stringify({ success: true, data: { id: sessionId } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('POST /api/v1/sessions failed:', err);
    return apiError(err);
  }
}
