/**
 * Auth Register API Route
 *
 * POST /api/v1/auth/register — Register a new user
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { registerUser, createToken, getAuthMode } from '@/lib/deeptutor/services/auth';

const log = createLogger('API:AuthRegister');

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authMode = getAuthMode();

    if (authMode !== 'multi') {
      return NextResponse.json(
        { success: false, error: 'Registration is only available in multi-user auth mode.' },
        { status: 403 },
      );
    }

    const body = await request.json() as { username?: string; password?: string };

    if (!body.username || !body.password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required.' },
        { status: 400 },
      );
    }

    if (body.username.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Username must be at least 3 characters.' },
        { status: 400 },
      );
    }

    if (body.password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters.' },
        { status: 400 },
      );
    }

    const user = await registerUser(body.username, body.password);
    const token = await createToken(user.id, user.username, user.role);

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
    }, { status: 201 });
  } catch (err) {
    log.error('Registration failed:', err);

    const message = err instanceof Error ? err.message : 'Registration failed';
    const status = message.includes('already exists') ? 409 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
}
