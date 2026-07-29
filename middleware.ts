/**
 * Next.js Middleware — Global authentication gate
 *
 * Runs at the Edge for all /api/* routes. Uses jose (Edge-compatible JWT lib)
 * to verify tokens without Node.js-only dependencies (crypto.scrypt, fs).
 *
 * Three auth modes (controlled by AUTH_MODE env var):
 *
 * - disabled: all requests pass through as local-admin; auto-generates a JWT
 *   if none provided so downstream x-user-id is always set.
 * - single: all requests pass through as a single auto-created user.
 * - multi: requires a valid Bearer token; rejects unauthenticated requests
 *   with 401 (except public paths like /auth/login, /auth/register).
 *
 * On success, injects `x-user-id` and `x-auth-role` request headers so all
 * downstream route handlers see the real authenticated identity.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthMode = 'disabled' | 'single' | 'multi';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET env var is required in production');
    }
    return new TextEncoder().encode('dev-only-fallback-secret-not-for-production');
  }
  return new TextEncoder().encode(secret);
}

function getMode(): AuthMode {
  const raw = (process.env.AUTH_MODE ?? 'disabled').toLowerCase();
  if (raw === 'single' || raw === 'multi') return raw;
  return 'disabled';
}

// ---------------------------------------------------------------------------
// Token cache — one auto-generated token per (mode, host) pair
// ---------------------------------------------------------------------------

const _cache = new Map<string, string>();

async function cachedAutoToken(mode: AuthMode, host: string): Promise<string> {
  const key = `${mode}:${host}`;
  let token = _cache.get(key);
  if (token) return token;

  const secret = getSecret();

  if (mode === 'disabled') {
    token = await new SignJWT({
      userId: 'local-admin',
      username: 'local',
      role: 'admin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('365d')
      .setSubject('local-admin')
      .sign(secret);
  } else {
    // single mode
    token = await new SignJWT({
      userId: 'local-single-user',
      username: 'user',
      role: 'admin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('365d')
      .setSubject('local-single-user')
      .sign(secret);
  }

  _cache.set(key, token);
  return token;
}

// ---------------------------------------------------------------------------
// JSON error helper
// ---------------------------------------------------------------------------

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// ---------------------------------------------------------------------------
// Main middleware handler
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const mode = getMode();
  const host = request.headers.get('host') ?? 'localhost';

  // Extract Bearer token from Authorization header
  const authHeader = request.headers.get('authorization');
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1] ?? null;

  // --- disabled mode ---
  if (mode === 'disabled') {
    const effectiveToken = token ?? (await cachedAutoToken('disabled', host));
    const next = NextResponse.next();
    next.headers.set('authorization', `Bearer ${effectiveToken}`);
    next.headers.set('x-user-id', 'local-admin');
    next.headers.set('x-auth-role', 'admin');
    next.headers.set('x-auth-mode', 'disabled');
    return next;
  }

  // --- single-user mode ---
  if (mode === 'single') {
    const effectiveToken = token ?? (await cachedAutoToken('single', host));
    const next = NextResponse.next();
    next.headers.set('authorization', `Bearer ${effectiveToken}`);
    next.headers.set('x-user-id', 'local-single-user');
    next.headers.set('x-auth-role', 'admin');
    next.headers.set('x-auth-mode', 'single');
    return next;
  }

  // --- multi-user mode ---
  if (!token) {
    return jsonError(
      'Authentication required. Send Authorization: Bearer <token> header.',
      401,
    );
  }

  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    const userId = payload.userId as string | undefined;
    const role = payload.role as string | undefined;

    if (!userId || !role) {
      return jsonError('Malformed token payload', 401);
    }

    const next = NextResponse.next();
    next.headers.set('x-user-id', userId);
    next.headers.set('x-auth-role', role);
    next.headers.set('x-auth-mode', 'multi');
    return next;
  } catch {
    return jsonError('Invalid or expired token', 401);
  }
}

// ---------------------------------------------------------------------------
// Matcher — which paths this middleware applies to
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    // All v1 API routes EXCEPT auth endpoints and health check
    '/api/v1/((?!auth/|health).*)',
    // Non-v1 routes (director graph chat, profile chat)
    '/api/chat',
    '/api/profile/:path*',
  ],
};
