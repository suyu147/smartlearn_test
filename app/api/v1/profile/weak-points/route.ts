import { NextRequest, NextResponse } from 'next/server';

import { getLearnerProfileService } from '@/lib/deeptutor/services/learner-profile';

const learnerProfileService = getLearnerProfileService();

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') ?? 'anonymous';
    const snapshot = await learnerProfileService.getLearnerSnapshot(userId);
    return NextResponse.json({ weakPoints: snapshot.weakPoints, weakTopics: snapshot.analytics.weakTopics });
  } catch (error) {
    console.error('Failed to fetch weak points:', error);
    return NextResponse.json({ error: 'Failed to fetch weak points' }, { status: 500 });
  }
}
