/**
 * Auth Login API Route
 *
 * POST /api/v1/auth/login — Authenticate user and return JWT token
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { loginUser, getAuthMode } from '@/lib/deeptutor/services/auth';

const log = createLogger('API:AuthLogin');

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authMode = getAuthMode();

    if (authMode === 'disabled') {
      return NextResponse.json({
        success: true,
        data: {
          token: 'disabled-mode',
          user: { id: 'local-admin', username: 'local', role: 'admin' },
        },
      });
    }

    const body = await request.json() as { username?: string; password?: string };

    if (!body.username || !body.password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required.' },
        { status: 400 },
      );
    }

    const result = await loginUser(body.username, body.password);

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Invalid username or password.' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        token: result.token,
        user: {
          id: result.user.id,
          username: result.user.username,
          role: result.user.role,
        },
      },
    });
  } catch (err) {
    log.error('Login failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Login failed' },
      { status: 500 },
    );
  }
}
