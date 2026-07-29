import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/utils/database';
import { authenticate } from '@/lib/deeptutor/services/auth';
import { saveResources, loadResources } from '@/lib/api/server/resource-persistence';
import { createLogger } from '@/lib/logger';
import type { Resource } from '@/lib/types/resource';

const log = createLogger('api:resources:sync');

/**
 * GET /api/v1/resources/sync?userId=xxx
 *
 * Load all resources for the authenticated user.
 * In disabled/single mode, userId query param is used as fallback.
 */
export async function GET(req: NextRequest) {
  try {
    let userId: string;

    try {
      const user = await authenticate(req as unknown as Request);
      userId = user.id;
    } catch {
      // Fallback for disabled mode or when auth is off
      userId = req.nextUrl.searchParams.get('userId') ?? 'anonymous';
    }

    const resources = await loadResources(userId);

    return NextResponse.json({ success: true, data: { resources } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load resources';
    log.error('GET /api/v1/resources/sync error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/v1/resources/sync
 *
 * Batch save resources for the authenticated user.
 * Body: { resources: Resource[] }
 */
export async function POST(req: NextRequest) {
  try {
    let userId: string;

    try {
      const user = await authenticate(req as unknown as Request);
      userId = user.id;
    } catch {
      // Fallback: read from x-user-id header (used by client-side fetch)
      userId = req.headers.get('x-user-id') ?? 'anonymous';
    }

    const body = (await req.json()) as { resources?: Resource[] };
    const { resources = [] } = body;

    if (resources.length === 0) {
      return NextResponse.json({ success: true, data: { saved: 0 } });
    }

    // Ensure all resources have the correct userId
    const normalized = resources.map((r) => ({ ...r, userId }));

    await saveResources(userId, normalized);

    return NextResponse.json({ success: true, data: { saved: normalized.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save resources';
    log.error('POST /api/v1/resources/sync error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
