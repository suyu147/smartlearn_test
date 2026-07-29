/**
 * GET    /api/v1/notebook/[id] — Get notebook with records
 * PUT    /api/v1/notebook/[id] — Add a record to the notebook
 * DELETE /api/v1/notebook/[id] — Delete notebook
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getNotebookService } from '@/lib/deeptutor/bootstrap';

const log = createLogger('NotebookDetailRoute');

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = getUserId(req);
    const svc = getNotebookService();

    const notebook = await svc.getNotebook(userId, id);
    if (!notebook) {
      return new Response(JSON.stringify({ error: 'Notebook not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const records = await svc.getRecords(userId, id);
    return new Response(JSON.stringify({ success: true, data: { notebook, records } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/notebook/[id] failed:', err);
    return apiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = getUserId(req);
    const { validatedBody } = await import('@/lib/server/validate');
    const { NoteCreateSchema } = await import('@/lib/server/schemas');
    const body = await validatedBody(NoteCreateSchema, req);

    const record = await getNotebookService().addRecord(userId, id, {
      type: 'note',
      title: body.title ?? '',
      summary: '',
      content: body.content,
      metadata: body.tags ? { tags: body.tags } : {},
    });
    return new Response(JSON.stringify({ success: true, data: record }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('PUT /api/v1/notebook/[id] failed:', err);
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = getUserId(req);
    const ok = await getNotebookService().deleteNotebook(userId, id);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Notebook not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('DELETE /api/v1/notebook/[id] failed:', err);
    return apiError(err);
  }
}
