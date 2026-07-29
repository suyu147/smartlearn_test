/**
 * GET  /api/v1/knowledge — List user's knowledge bases
 * POST /api/v1/knowledge — Create a new knowledge base
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { KnowledgeServiceImpl, KnowledgeError } from '@/lib/deeptutor/services/knowledge';

const log = createLogger('KnowledgeRoute');

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') ?? 'anonymous';
}

function errorResponse(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const status = err instanceof KnowledgeError ? err.statusCode : fallbackStatus;
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const kbService = new KnowledgeServiceImpl();
    const kbs = await kbService.listKbs(userId);
    return new Response(JSON.stringify({ knowledgeBases: kbs }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/knowledge failed:', err);
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const { validatedBody } = await import('@/lib/server/validate');
    const { KnowledgeCreateSchema } = await import('@/lib/server/schemas');
    const { name, description } = await validatedBody(KnowledgeCreateSchema, req);

    const kbService = new KnowledgeServiceImpl();
    const kb = await kbService.createKb(userId, name, description);
    return new Response(JSON.stringify({ knowledgeBase: kb }), {
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
    log.error('POST /api/v1/knowledge failed:', err);
    return errorResponse(err);
  }
}
