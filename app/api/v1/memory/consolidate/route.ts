/**
 * POST /api/v1/memory/consolidate — Trigger memory consolidation (L1→L2→L3)
 *
 * Query params:
 *   ?surface=chat  — Surface to consolidate (default: chat)
 * 
 * Uses v2 LLM-based consolidator by default.
 * Add ?v1=true to use simple text rollup as fallback.
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getMemoryService } from '@/lib/deeptutor/bootstrap';
import type { Surface } from '@/lib/deeptutor/services/memory';

const log = createLogger('MemoryConsolidateRoute');

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') ?? 'anonymous';
}

function apiError(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = process.env.NODE_ENV === 'development' && err instanceof Error ? err.stack : undefined;
  log.error('apiError', { message, status: fallbackStatus, stack });
  return new Response(JSON.stringify({ error: message, status: fallbackStatus }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const url = new URL(req.url);
    const surface = (url.searchParams.get('surface') ?? 'chat') as Surface;

    const svc = getMemoryService();

    // Trigger consolidation (v2 LLM-based by default)
    await svc.consolidate(userId, surface);

    // Read back L3/recent for confirmation
    const l3Recent = await svc.readL3(userId, 'recent');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          consolidated: true,
          surface,
          hasL3Content: l3Recent.trim().length > 0,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    log.error('POST /api/v1/memory/consolidate failed:', err);
    return apiError(err);
  }
}
