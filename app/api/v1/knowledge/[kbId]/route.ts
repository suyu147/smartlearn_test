/**
 * GET    /api/v1/knowledge/[kbId] — Get KB details with document list
 * DELETE /api/v1/knowledge/[kbId] — Delete a KB and all its documents
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { KnowledgeServiceImpl, KnowledgeError } from '@/lib/deeptutor/services/knowledge';

const log = createLogger('KnowledgeDetailRoute');

function errorResponse(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const status = err instanceof KnowledgeError ? err.statusCode : fallbackStatus;
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    const { kbId } = await params;
    const kbService = new KnowledgeServiceImpl();
    const kb = await kbService.getKb(kbId);
    const documents = await kbService.listDocuments(kbId);
    return new Response(JSON.stringify({ knowledgeBase: kb, documents }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/knowledge/[kbId] failed:', err);
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    const { kbId } = await params;
    const kbService = new KnowledgeServiceImpl();
    await kbService.deleteKb(kbId);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('DELETE /api/v1/knowledge/[kbId] failed:', err);
    return errorResponse(err);
  }
}
