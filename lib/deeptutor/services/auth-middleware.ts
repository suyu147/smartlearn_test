/**
 * Auth Middleware — Next.js API route authentication helper
 *
 * Wraps API route handlers with authentication, injecting the resolved
 * CurrentUser into the handler context.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { authenticate, AuthError, type CurrentUser } from '@/lib/deeptutor/services/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('AuthMiddleware');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthContext {
  user: CurrentUser;
  params?: Record<string, string>;
}

export type AuthenticatedHandler = (
  request: NextRequest,
  context: AuthContext,
) => Promise<Response>;

// ---------------------------------------------------------------------------
// withAuth middleware
// ---------------------------------------------------------------------------

/**
 * Wraps a Next.js API route handler with authentication.
 *
 * Usage in a route.ts:
 * ```ts
 * export async function GET(request: NextRequest) {
 *   return withAuth(request, async (req, { user }) => {
 *     return NextResponse.json({ hello: user.username });
 *   });
 * }
 * ```
 */
export async function withAuth(
  request: NextRequest,
  handler: AuthenticatedHandler,
  context?: { params?: Record<string, string> },
): Promise<Response> {
  let user: CurrentUser;

  try {
    user = await authenticate(request as unknown as Request);
  } catch (err) {
    if (err instanceof AuthError) {
      log.warn(`Auth rejected: ${err.message}`);
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }

    // Unexpected error
    const message = err instanceof Error ? err.message : 'Authentication failed';
    log.error('Unexpected auth error:', err);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }

  try {
    return await handler(request, {
      user,
      params: context?.params,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    log.error('Handler error:', err);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// requireRole — additional role guard
// ---------------------------------------------------------------------------

/**
 * Wraps a handler to require a specific role (e.g. 'admin').
 * Use after withAuth for role-restricted endpoints.
 */
export function requireRole(
  role: 'admin',
  handler: AuthenticatedHandler,
): AuthenticatedHandler {
  return async (request, context) => {
    if (context.user.role !== role) {
      return NextResponse.json(
        { error: `Requires role: ${role}` },
        { status: 403 },
      );
    }
    return handler(request, context);
  };
}
