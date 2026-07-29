/**
 * GET /api/v1/settings — Get server-side settings from PostgreSQL
 * PUT /api/v1/settings — Update server-side settings in PostgreSQL
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { UserSettingsService } from '@/lib/deeptutor/services/user-settings-service';

const log = createLogger('SettingsRoute');
const settingsService = new UserSettingsService();

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') ?? 'anonymous';
}

function apiError(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error('error', err);
  return new Response(JSON.stringify({ error: message }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getDefaults(): Record<string, unknown> {
  return {
    provider: process.env.AI_PROVIDER ?? process.env.DT_DEFAULT_PROVIDER ?? 'openai',
    model: process.env.AI_MODEL ?? process.env.DT_DEFAULT_MODEL ?? 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 4096,
    theme: 'system',
    language: process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE ?? 'zh',
    thinkingMode: false,
    contextWindow: 65536,
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const dbSettings = await settingsService.getSettings(userId);
    const defaults = getDefaults();
    const merged = dbSettings ? { ...defaults, ...dbSettings } : defaults;

    return new Response(JSON.stringify({ success: true, data: merged }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/settings failed:', err);
    return apiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const { validatedBody } = await import('@/lib/server/validate');
    const { SettingsUpdateSchema } = await import('@/lib/server/schemas');
    const updates = await validatedBody(SettingsUpdateSchema, req);

    const ok = await settingsService.updateSettings(userId, updates);
    if (!ok) {
      return apiError(new Error('Failed to persist settings'));
    }

    // Return the freshly-merged result (DB values + env defaults)
    const dbSettings = await settingsService.getSettings(userId);
    const merged = dbSettings ? { ...getDefaults(), ...dbSettings } : getDefaults();

    return new Response(JSON.stringify({ success: true, data: merged }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('PUT /api/v1/settings failed:', err);
    return apiError(err);
  }
}
