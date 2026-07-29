import { getModel } from '@/lib/ai/providers';
import type { ModelConfig, ProviderId } from '@/lib/types/provider';
import type { NextRequest } from 'next/server';

/**
 * Resolve API key with proper provider-specific environment variable fallback.
 *
 * Priority: explicitApiKey > DT_DEFAULT_API_KEY > provider-specific env var > OPENAI_API_KEY
 *
 * This is the canonical API key resolution shared across the Book Engine
 * agents and bootstrap. It mirrors the logic in resolveModel().
 */
export function resolveApiKey(providerId?: string, explicitApiKey?: string): string {
  if (explicitApiKey) return explicitApiKey;
  if (process.env.DT_DEFAULT_API_KEY) return process.env.DT_DEFAULT_API_KEY;

  switch (providerId) {
    case 'spark':       return process.env.SPARK_API_KEY || '';
    case 'openai':      return process.env.OPENAI_API_KEY || '';
    case 'deepseek':    return process.env.DEEPSEEK_API_KEY || '';
    case 'kimi':        return process.env.KIMI_API_KEY || '';
    case 'glm':         return process.env.GLM_API_KEY || '';
    case 'qwen':        return process.env.QWEN_API_KEY || '';
    case 'minimax':     return process.env.MINIMAX_API_KEY || '';
    case 'siliconflow': return process.env.SILICONFLOW_API_KEY || '';
    case 'doubao':      return process.env.DOUBAO_API_KEY || '';
    case 'grok':        return process.env.GROK_API_KEY || '';
    case 'anthropic':   return process.env.ANTHROPIC_API_KEY || '';
    case 'google':      return process.env.GOOGLE_API_KEY || '';
    default:            return process.env.OPENAI_API_KEY || '';
  }
}

/** Resolve provider ID, falling back to DT_DEFAULT_PROVIDER > AI_PROVIDER > openai */
export function resolveProviderId(explicitId?: string): string {
  return explicitId || process.env.DT_DEFAULT_PROVIDER || process.env.AI_PROVIDER || 'openai';
}

/** Resolve model ID, falling back to DT_DEFAULT_MODEL > AI_MODEL > gpt-4o-mini */
export function resolveModelId(explicitId?: string): string {
  return explicitId || process.env.DT_DEFAULT_MODEL || process.env.AI_MODEL || 'gpt-4o-mini';
}

/** Resolve base URL from env (no explicit override beyond what caller provides) */
export function resolveBaseUrl(): string | undefined {
  return process.env.AI_BASE_URL || undefined;
}

interface ResolveModelOptions {
  modelString?: string;
  modelId?: string;
  providerId?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: ModelConfig['providerType'];
  requiresApiKey?: boolean;
}

export function resolveModel(config?: ResolveModelOptions & Partial<ModelConfig>) {
  const modelString = config?.modelString || config?.modelId || process.env.AI_MODEL || 'deepseek-chat';
  const providerId = config?.providerId || (process.env.AI_PROVIDER as string) || 'deepseek';
  
  // 根据 providerId 获取对应的 API key
  let apiKey = config?.apiKey;
  if (!apiKey) {
    switch (providerId) {
      case 'spark':
        apiKey = process.env.SPARK_API_KEY;
        break;
      case 'openai':
        apiKey = process.env.OPENAI_API_KEY;
        break;
      case 'deepseek':
        apiKey = process.env.DEEPSEEK_API_KEY;
        break;
      case 'kimi':
        apiKey = process.env.KIMI_API_KEY;
        break;
      case 'glm':
        apiKey = process.env.GLM_API_KEY;
        break;
      case 'qwen':
        apiKey = process.env.QWEN_API_KEY;
        break;
      case 'minimax':
        apiKey = process.env.MINIMAX_API_KEY;
        break;
      case 'siliconflow':
        apiKey = process.env.SILICONFLOW_API_KEY;
        break;
      case 'doubao':
        apiKey = process.env.DOUBAO_API_KEY;
        break;
      case 'grok':
        apiKey = process.env.GROK_API_KEY;
        break;
      default:
        apiKey = process.env.OPENAI_API_KEY;
    }
    apiKey = apiKey || '';
  }

  const modelConfig = providerId === 'spark'
    ? {
        providerId: 'spark' as const,
        modelId: modelString,
        apiKey,
        providerType: 'openai' as const,
        baseUrl: config?.baseUrl || process.env.SPARK_BASE_URL || 'https://spark-api-open.xf-yun.com/v1',
      }
    : {
        providerId: providerId as ProviderId,
        modelId: modelString,
        apiKey,
        ...(config?.baseUrl ? { baseUrl: config.baseUrl } : {}),
      };

  const result = getModel(modelConfig);
  return {
    ...result,
    apiKey,
  };
}

export function resolveModelFromHeaders(req: NextRequest) {
  const modelString = req.headers.get('x-model') || undefined;
  const apiKey = req.headers.get('x-api-key') || undefined;
  const baseUrl = req.headers.get('x-base-url') || undefined;
  const providerType = req.headers.get('x-provider-type') || undefined;

  return resolveModel({
    modelString,
    apiKey,
    baseUrl,
    providerType: providerType as ModelConfig['providerType'] | undefined,
  });
}

/**
 * Resolve BookEngine config from request headers.
 * Reads x-api-key, x-provider, x-model, x-base-url headers
 * and falls back to environment variables.
 * Used by Book API routes to pass the user's configured LLM credentials
 * to the BookEngine so it can actually call the LLM.
 */
export function resolveBookEngineConfigFromHeaders(req: NextRequest): {
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
} {
  const apiKey = req.headers.get('x-api-key') || undefined;
  const providerId = req.headers.get('x-provider') || undefined;
  const modelId = req.headers.get('x-model') || undefined;
  const baseUrl = req.headers.get('x-base-url') || undefined;

  return {
    providerId,
    modelId,
    apiKey,
    baseUrl,
  };
}
