/**
 * POST /api/v1/profile/complete — Mark user profile as completed
 *
 * Sets the `profileCompletedAt` timestamp on the current user's record.
 * userId is extracted from JWT token (server-side), not from request body.
 * Accepts optional { skipped: true } to distinguish skip vs complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/deeptutor/services/auth';
import prisma from '@/lib/utils/database';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await authenticate(request as unknown as Request);

    // Ensure User record exists
    const existing = await prisma.user.findUnique({ where: { id: user.id } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: user.id,
          name: user.username,
          email: null,
          profileCompletedAt: new Date(),
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { profileCompletedAt: new Date() },
      });
    }

    return NextResponse.json({
      success: true,
      data: { profileCompletedAt: new Date().toISOString() },
    });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to mark profile complete' },
      { status },
    );
  }
}
