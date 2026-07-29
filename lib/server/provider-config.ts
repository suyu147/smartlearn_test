export function getServerWebSearchProviders() {
  const providers: Record<string, string> = {};
  if (process.env.TAVILY_API_KEY) providers.tavily = process.env.TAVILY_API_KEY;
  return providers;
}

export function getServerImageProviders() {
  const providers: Record<string, string> = {};
  if (process.env.IMAGE_GEN_API_KEY) {
    const provider = process.env.IMAGE_GEN_PROVIDER || 'siliconflow';
    providers[provider] = process.env.IMAGE_GEN_API_KEY;
  }
  if (process.env.DOUBAO_IMAGE_API_KEY) {
    providers.doubao = process.env.DOUBAO_IMAGE_API_KEY;
  }
  return providers;
}

export function getServerVideoProviders() {
  const providers: Record<string, string> = {};
  return providers;
}

export function resolveWebSearchApiKey(clientApiKey?: string): string | null {
  return clientApiKey || process.env.TAVILY_API_KEY || null;
}

export function resolveImageGenApiKey(provider?: string, clientApiKey?: string): string | null {
  if (clientApiKey) return clientApiKey;
  const p = provider || process.env.IMAGE_GEN_PROVIDER || 'siliconflow';
  if (p === 'doubao') {
    return process.env.DOUBAO_IMAGE_API_KEY || process.env.IMAGE_GEN_API_KEY || null;
  }
  return process.env.IMAGE_GEN_API_KEY || null;
}

export function resolveImageGenProvider(): string {
  return process.env.IMAGE_GEN_PROVIDER || 'siliconflow';
}

export function resolveImageGenBaseUrl(provider?: string): string | undefined {
  const p = provider || process.env.IMAGE_GEN_PROVIDER || 'siliconflow';
  if (p === 'doubao') {
    return process.env.DOUBAO_IMAGE_BASE_URL || 'https://ark.cn-beijing.volces.com';
  }
  return process.env.IMAGE_GEN_BASE_URL || undefined;
}

export function resolveASRApiKey(providerId: string, clientApiKey?: string): string {
  if (clientApiKey) return clientApiKey;
  switch (providerId) {
    case 'openai-whisper':
      return process.env.OPENAI_API_KEY || '';
    case 'spark':
      return process.env.SPARK_API_KEY || '';
    default:
      return process.env.OPENAI_API_KEY || '';
  }
}

export function resolveASRBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  if (clientBaseUrl) return clientBaseUrl;
  switch (providerId) {
    case 'spark':
      return process.env.SPARK_BASE_URL || 'https://spark-api-open.xf-yun.com/v1';
    default:
      return undefined;
  }
}

export function getServerTTSProviders() {
  const providers: Record<string, string> = {};
  if (process.env.SPARK_API_KEY) providers.spark = process.env.SPARK_API_KEY;
  return providers;
}
