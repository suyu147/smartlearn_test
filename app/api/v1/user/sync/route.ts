import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/deeptutor/services/auth';
import { loadSessions, saveSessions } from '@/lib/api/server/session-persistence';
import { loadLearningPaths, saveLearningPaths } from '@/lib/api/server/learning-path-persistence';
import { loadResources, saveResources } from '@/lib/api/server/resource-persistence';
import { createLogger } from '@/lib/logger';
import type { LearningPath } from '@/lib/types/learning-path';
import type { Resource } from '@/lib/types/resource';
import type { LearningSession } from '@/lib/store/sessions';

const log = createLogger('api:user:sync');

interface SyncRequestBody {
  sessions?: LearningSession[];
  learningPaths?: LearningPath[];
  resources?: Resource[];
}

interface SyncResponseBody {
  sessions?: LearningSession[];
  learningPaths?: LearningPath[];
  resources?: Resource[];
}

/**
 * GET /api/v1/user/sync?userId=xxx
 *
 * Load all state (sessions, learning paths, resources) for the authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    let userId: string;
    try {
      const user = await authenticate(req as unknown as Request);
      userId = user.id;
    } catch {
      userId = req.nextUrl.searchParams.get('userId') ?? 'anonymous';
    }

    const [sessions, learningPaths, resources] = await Promise.all([
      loadSessions(userId),
      loadLearningPaths(userId),
      loadResources(userId),
    ]);

    const data: SyncResponseBody = { sessions, learningPaths, resources };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load user data';
    log.error('GET /api/v1/user/sync error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/v1/user/sync
 *
 * Save all state (sessions, learning paths, resources) for the authenticated user.
 * Body: { sessions?, learningPaths?, resources? }
 */
export async function POST(req: NextRequest) {
  try {
    let userId: string;
    try {
      const user = await authenticate(req as unknown as Request);
      userId = user.id;
    } catch {
      userId = req.headers.get('x-user-id') ?? 'anonymous';
    }

    const body = (await req.json()) as SyncRequestBody;

    const promises: Promise<unknown>[] = [];

    if (body.sessions) {
      promises.push(saveSessions(userId, body.sessions));
    }
    if (body.learningPaths) {
      promises.push(saveLearningPaths(userId, body.learningPaths));
    }
    if (body.resources) {
      promises.push(saveResources(userId, body.resources));
    }

    await Promise.all(promises);

    return NextResponse.json({ success: true, data: { saved: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save user data';
    log.error('POST /api/v1/user/sync error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
