/**
 * GET /api/v1/stats/learning
 *
 * Returns aggregated learning statistics for the current user.
 * All queries are scoped by userId from the x-user-id header
 * (injected by middleware) and executed in parallel for minimal latency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLearningStatsService } from '@/lib/deeptutor/services/learning-stats';

function getUserId(request: NextRequest): string {
  return request.headers.get('x-user-id') ?? 'anonymous';
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const stats = await getLearningStatsService().getStats(userId);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Failed to fetch learning stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch learning stats' },
      { status: 500 },
    );
  }
}
