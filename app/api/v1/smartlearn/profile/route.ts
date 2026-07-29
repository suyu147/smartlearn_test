import { NextRequest, NextResponse } from 'next/server';

import { getLearnerProfileService } from '@/lib/deeptutor/services/learner-profile';

import { authenticate } from '@/lib/deeptutor/services/auth';
import { ProfileUpdateSchema } from '@/lib/server/schemas';

const learnerProfileService = getLearnerProfileService();

function getUserId(request: NextRequest): string {
  return request.headers.get('x-user-id') ?? 'anonymous';
}

async function getWritableUserId(request: NextRequest): Promise<string> {
  try {
    const user = await authenticate(request);
    return user.id;
  } catch {
    return 'anonymous';
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const snapshot = await learnerProfileService.getLearnerSnapshot(userId);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Failed to fetch learner profile snapshot:', error);
    return NextResponse.json({ error: 'Failed to fetch learner profile snapshot' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getWritableUserId(request);
    const parsed = ProfileUpdateSchema.parse(await request.json());
    const dimensions = parsed.dimensions ?? {};
    const profile = await learnerProfileService.replaceProfileDimensions(userId, dimensions, 'profile_page');
    const snapshot = await learnerProfileService.getLearnerSnapshot(userId);
    return NextResponse.json({ profile, snapshot });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 400;
    console.error('Failed to update learner profile:', error);
    return NextResponse.json({ error: 'Failed to update learner profile' }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getWritableUserId(request);
    const parsed = ProfileUpdateSchema.parse(await request.json());
    const dimensions = parsed.dimensions ?? {};
    const profile = await learnerProfileService.updateProfileDimensions(userId, dimensions, 'profile_patch');
    const snapshot = await learnerProfileService.getLearnerSnapshot(userId);
    return NextResponse.json({ profile, snapshot });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 400;
    console.error('Failed to patch learner profile:', error);
    return NextResponse.json({ error: 'Failed to patch learner profile' }, { status });
  }
}
