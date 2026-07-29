/**
 * GET    /api/v1/sessions/[id] — Get session by ID
 * PUT    /api/v1/sessions/[id] — Update session title
 * DELETE /api/v1/sessions/[id] — Delete session
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import {
  getSession,
  updateSessionTitle,
  deleteSession,
  getMessages,
  listTurns,
} from '@/lib/deeptutor/services/session';

const log = createLogger('SessionDetailRoute');

function apiError(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error('error', err);
  return new Response(JSON.stringify({ error: message }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const includeMessages = url.searchParams.get('messages') !== 'false';
    const includeTurns = url.searchParams.get('turns') === 'true';

    const result: Record<string, unknown> = { session };

    if (includeMessages) {
      const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 100;
      result.messages = await getMessages(id, { limit });
    }
    if (includeTurns) {
      result.turns = await listTurns(id);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/sessions/[id] failed:', err);
    return apiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { validatedBody } = await import('@/lib/server/validate');
    const { SessionUpdateSchema } = await import('@/lib/server/schemas');
    const { title } = await validatedBody(SessionUpdateSchema, req);

    const ok = await updateSessionTitle(id, title);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('PUT /api/v1/sessions/[id] failed:', err);
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ok = await deleteSession(id);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('DELETE /api/v1/sessions/[id] failed:', err);
    return apiError(err);
  }
}
