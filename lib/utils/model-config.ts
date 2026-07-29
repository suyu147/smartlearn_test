import { useSettingsStore } from '@/lib/store/settings';

export interface ModelConfig {
  providerId: string;
  modelId: string;
  modelString: string;
  apiKey: string;
  baseUrl: string;
  providerType: string;
  requiresApiKey: boolean;
  isServerConfigured: boolean;
}

export function getCurrentModelConfig(): ModelConfig {
  const settings = useSettingsStore.getState();
  const providerId = settings.providerId || 'spark';
  const modelId = settings.modelId || 'spark-4.0-turbo';
  const apiKey = settings.apiKey || '';
  return {
    providerId,
    modelId,
    modelString: `${providerId}:${modelId}`,
    apiKey,
    baseUrl: settings.baseUrl || 'https://spark-api-open.xf-yun.com/v1',
    providerType: providerId === 'spark' ? 'openai' : providerId,
    requiresApiKey: true,
    isServerConfigured: !!process.env.SPARK_API_KEY || !!process.env.OPENAI_API_KEY,
  };
}
