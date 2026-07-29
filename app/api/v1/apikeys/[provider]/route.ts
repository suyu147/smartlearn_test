/**
 * GET    /api/v1/apikeys/[provider] — 获取指定 provider 的 API Key（返回掩码后的值）
 * DELETE /api/v1/apikeys/[provider] — 删除指定 provider 的 API Key
 *
 * 例如：
 *   GET  /api/v1/apikeys/spark   → 获取讯飞星火 API Key
 *   DELETE /api/v1/apikeys/spark → 删除讯飞星火 API Key
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getApiKeyService } from '@/lib/deeptutor/services/config';

const log = createLogger('ProviderApiKeyRoute');

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') ?? 'anonymous';
}

function errorResponse(err: unknown, status: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 掩码处理：只保留前 4 位和后 4 位，中间用 **** 替代 */
function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const userId = getUserId(req);
    const { provider } = await params;
    const apiKeyService = getApiKeyService();

    const key = await apiKeyService.getKey(userId, provider);
    if (key === null) {
      return errorResponse({ message: `No API key found for provider: ${provider}` }, 404);
    }

    return new Response(JSON.stringify({
      provider,
      apiKey: maskApiKey(key),
      hasKey: true,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error(`GET /api/v1/apikeys/[provider] failed:`, err);
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const userId = getUserId(req);
    const { provider } = await params;
    const apiKeyService = getApiKeyService();

    const deleted = await apiKeyService.deleteKey(userId, provider);
    if (!deleted) {
      return errorResponse({ message: `No API key found for provider: ${provider}` }, 404);
    }

    return new Response(JSON.stringify({ success: true, provider }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error(`DELETE /api/v1/apikeys/[provider] failed:`, err);
    return errorResponse(err);
  }
}
