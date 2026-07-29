/**
 * GET  /api/v1/apikeys — 获取用户所有 API Key 列表（不包含明文密钥）
 * POST /api/v1/apikeys — 存储（创建/更新）一个 API Key
 *
 * 支持的 provider：spark(讯飞星火), openai, deepseek, kimi, glm, qwen,
 * minimax, siliconflow, doubao, grok, anthropic, google
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getApiKeyService } from '@/lib/deeptutor/services/config';

const log = createLogger('ApiKeyRoute');

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') ?? 'anonymous';
}

function errorResponse(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error('error', err);
  return new Response(JSON.stringify({ error: message }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const apiKeyService = getApiKeyService();
    const keys = await apiKeyService.listKeys(userId);

    return new Response(JSON.stringify({ apiKeys: keys }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/apikeys failed:', err);
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const { validatedBody } = await import('@/lib/server/validate');
    const { ApiKeyCreateSchema } = await import('@/lib/server/schemas');
    const { provider, apiKey, label } = await validatedBody(ApiKeyCreateSchema, req);

    const apiKeyService = getApiKeyService();
    await apiKeyService.storeKey(userId, provider, apiKey, label);

    return new Response(JSON.stringify({ success: true, provider }), {
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
    log.error('POST /api/v1/apikeys failed:', err);
    return errorResponse(err);
  }
}
