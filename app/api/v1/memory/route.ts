/**
 * GET  /api/v1/memory — Read memory entries (L1 trace, L2 summary, L3 synthesis)
 * POST /api/v1/memory — Write memory entry (trace event, L2, or L3)
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getMemoryService } from '@/lib/deeptutor/bootstrap';
import type { Surface, L3Slot, TraceEvent } from '@/lib/deeptutor/services/memory';

const log = createLogger('MemoryRoute');

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
    const layer = url.searchParams.get('layer') ?? 'overview'; // 'trace' | 'l2' | 'l3' | 'overview'
    const surface = url.searchParams.get('surface') ?? 'chat';
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 50;
    const slot = url.searchParams.get('slot') ?? 'general';

    const svc = getMemoryService();

    let data: unknown;
    switch (layer) {
      case 'trace':
        data = await svc.readTrace(userId, surface as Surface, limit);
        break;
      case 'l2':
        data = await svc.readL2(userId, surface);
        break;
      case 'l3':
        data = await svc.readL3(userId, slot as L3Slot);
        break;
      case 'all_l3':
        data = await svc.readAllL3(userId);
        break;
      case 'overview':
      default:
        data = await svc.overview(userId);
        break;
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/memory failed:', err);
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const { validatedBody } = await import('@/lib/server/validate');
    const { MemoryWriteSchema } = await import('@/lib/server/schemas');
    const body = await validatedBody(MemoryWriteSchema, req);

    const svc = getMemoryService();
    const effectiveUserId = body.userId ?? userId;

    let result: unknown;

    if (body.event) {
      // Write L1 trace event
      result = await svc.emitTrace(effectiveUserId, body.event as Omit<TraceEvent, 'id' | 'ts'>);
    } else if (body.slot) {
      // Write L3
      await svc.writeL3(effectiveUserId, body.slot as L3Slot, body.content);
      result = { written: 'l3', slot: body.slot };
    } else {
      // Write L2
      const surface = body.surface ?? 'chat';
      await svc.writeL2(effectiveUserId, surface, body.content);
      result = { written: 'l2', surface };
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
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
    log.error('POST /api/v1/memory failed:', err);
    return apiError(err);
  }
}
