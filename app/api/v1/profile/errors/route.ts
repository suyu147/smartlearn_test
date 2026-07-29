import { NextRequest, NextResponse } from 'next/server';

import { getLearnerProfileService } from '@/lib/deeptutor/services/learner-profile';

const learnerProfileService = getLearnerProfileService();

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') ?? 'anonymous';
    const snapshot = await learnerProfileService.getLearnerSnapshot(userId);
    return NextResponse.json({ errors: snapshot.errors });
  } catch (error) {
    console.error('Failed to fetch profile errors:', error);
    return NextResponse.json({ error: 'Failed to fetch profile errors' }, { status: 500 });
  }
}
