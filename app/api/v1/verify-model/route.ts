/**
 * POST /api/v1/verify-model — Verify LLM model connectivity
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';

const log = createLogger('VerifyModelRoute');

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
    const { VerifyModelSchema } = await import('@/lib/server/schemas');
    const { provider, model: modelId, apiKey, baseUrl } = await validatedBody(VerifyModelSchema, req);

    // Resolve the model configuration
    let modelResult;
    try {
      modelResult = getModel({
        providerId: provider as ProviderId,
        modelId,
        apiKey: apiKey ?? '',
        baseUrl,
      });
    } catch (modelErr) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            valid: false,
            error: modelErr instanceof Error ? modelErr.message : String(modelErr),
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Attempt a minimal LLM call to verify connectivity
    const start = Date.now();
    try {
      const result = await callLLM(
        {
          model: modelResult.model,
          prompt: 'Hi',
          maxOutputTokens: 5,
        },
        'verify-model',
      );
      const elapsed = Date.now() - start;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            valid: true,
            elapsed,
            provider,
            model: modelId,
            responsePreview: (result.text ?? '').slice(0, 100) || 'ok',
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    } catch (callErr) {
      const elapsed = Date.now() - start;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            valid: false,
            elapsed,
            error: callErr instanceof Error ? callErr.message : String(callErr),
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('POST /api/v1/verify-model failed:', err);
    return apiError(err);
  }
}
