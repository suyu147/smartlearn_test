/**
 * DELETE /api/v1/memory/cleanup — Delete all memory data for a user
 *
 * Query params:
 *   ?userId=xxx  — User whose memory to delete (defaults to x-user-id header)
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getMemoryService } from '@/lib/deeptutor/bootstrap';

const log = createLogger('MemoryCleanupRoute');

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') ?? 'anonymous';
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId') ?? getUserId(req);

    const svc = getMemoryService();
    const result = await svc.cleanup(userId);

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('DELETE /api/v1/memory/cleanup failed:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
