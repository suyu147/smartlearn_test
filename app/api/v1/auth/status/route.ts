/**
 * GET /api/v1/auth/status — Returns current auth mode, user info, token, and hasProfile
 *
 * This endpoint is excluded from the middleware matcher (public path).
 * Used by the frontend to discover the auth configuration on startup.
 * In disabled/single mode, also returns a pre-issued JWT so the frontend
 * can immediately use it for Authorization headers.
 * hasProfile indicates whether the user has completed the onboarding profile builder.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthMode,
  authenticate,
  createToken,
  type CurrentUser,
} from '@/lib/deeptutor/services/auth';
import prisma from '@/lib/utils/database';

/**
 * Ensure a User row exists in the Prisma DB for the given CurrentUser.
 * Returns true if profileCompletedAt is set (onboarding done).
 */
async function ensureUserAndGetProfileStatus(user: CurrentUser): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { id: user.id } });
  if (existing) {
    return existing.profileCompletedAt !== null;
  }
  // Auto-create User record (needed for disabled/single mode where auth is file-based)
  await prisma.user.create({
    data: {
      id: user.id,
      name: user.username,
      email: null,
    },
  });
  return false;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const mode = getAuthMode();

    let user: CurrentUser | null = null;
    let token: string | undefined;
    let hasProfile = false;

    if (mode !== 'multi') {
      // In disabled/single mode, authenticate() returns the default user
      user = await authenticate(request as unknown as Request);
      // Issue a real JWT so the frontend can use it for subsequent requests
      token = await createToken(user.id, user.username, user.role);
      hasProfile = await ensureUserAndGetProfileStatus(user);
    } else {
      // In multi mode, try to extract hasProfile from token if authenticated
      try {
        user = await authenticate(request as unknown as Request);
        hasProfile = await ensureUserAndGetProfileStatus(user);
      } catch {
        // Not authenticated in multi mode — user stays null, hasProfile stays false
        user = null;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        mode,
        user: user
          ? { id: user.id, username: user.username, role: user.role }
          : null,
        token,
        hasProfile,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to get auth status' },
      { status: 500 },
    );
  }
}
