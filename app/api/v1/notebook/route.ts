/**
 * GET  /api/v1/notebook — List user's notebooks
 * POST /api/v1/notebook — Create a new notebook
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getNotebookService } from '@/lib/deeptutor/bootstrap';

const log = createLogger('NotebookRoute');

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
    const notebooks = await getNotebookService().listNotebooks(userId);
    return new Response(JSON.stringify({ success: true, data: notebooks }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/notebook failed:', err);
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const { validatedBody } = await import('@/lib/server/validate');
    const { NotebookCreateSchema } = await import('@/lib/server/schemas');
    const { name, description } = await validatedBody(NotebookCreateSchema, req);

    const notebook = await getNotebookService().createNotebook(userId, name, description);
    return new Response(JSON.stringify({ success: true, data: notebook }), {
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
    log.error('POST /api/v1/notebook failed:', err);
    return apiError(err);
  }
}
