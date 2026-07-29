/**
 * GET  /api/v1/personas — List all personas
 * POST /api/v1/personas — Create a new persona
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getPersonaService } from '@/lib/deeptutor/bootstrap';

const log = createLogger('PersonasRoute');

function apiError(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error('error', err);
  return new Response(JSON.stringify({ error: message }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(_req: NextRequest) {
  try {
    const personas = await getPersonaService().listPersonas();
    return new Response(JSON.stringify({ success: true, data: personas }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/personas failed:', err);
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { validatedBody } = await import('@/lib/server/validate');
    const { PersonaCreateSchema } = await import('@/lib/server/schemas');
    const { name, description, systemPrompt, tags } = await validatedBody(PersonaCreateSchema, req);

    const persona = await getPersonaService().createPersona(name, description, systemPrompt, tags);
    return new Response(JSON.stringify({ success: true, data: persona }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('POST /api/v1/personas failed:', err);
    return apiError(err);
  }
}
