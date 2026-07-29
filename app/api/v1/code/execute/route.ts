/**
 * POST /api/v1/code/execute — Execute code in sandbox (Piston API)
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSandboxService } from '@/lib/deeptutor/bootstrap';

const log = createLogger('CodeExecuteRoute');

function apiError(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error('error', err);
  return new Response(JSON.stringify({ error: message }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { validatedBody } = await import('@/lib/server/validate');
    const { CodeExecuteSchema } = await import('@/lib/server/schemas');
    const { code, language, version, timeout, stdin, args } = await validatedBody(CodeExecuteSchema, req);

    const result = await getSandboxService().execute(code, {
      language,
      version,
      timeout: timeout ? timeout * 1000 : undefined,
      stdin,
      args,
    });
    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('POST /api/v1/code/execute failed:', err);
    return apiError(err);
  }
}
