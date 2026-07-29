import { createOpenAI } from '@ai-sdk/openai';
import { createHmac } from 'crypto';

export interface SparkConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  useWebSocket?: boolean;
}

export function generateSparkAuthUrl(apiKey: string, apiSecret: string, modelId: string): string {
  const host = 'spark-api.xf-yun.com';

  const modelPathMap: Record<string, string> = {
    'lite': '/v1/chat',
    'generalv3': '/v3.1/chat',
    'pro-128k': '/pro-128k/chat',
    '4.0Ultra': '/v4.0/chat',
  };

  const path = modelPathMap[modelId] ?? '/v1/chat';
  const now = new Date().toUTCString();

  const signatureOrigin = `host: ${host}\ndate: ${now}\nGET ${path} HTTP/1.1`;
  const signature = createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');
  const authorization = Buffer.from(
    `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  ).toString('base64');

  const url = `wss://${host}${path}?authorization=${authorization}&date=${encodeURIComponent(now)}&host=${host}`;

  return url;
}

export function createSparkModel(modelId: string, config: SparkConfig) {
  const baseUrl = config.baseUrl || 'https://spark-api-open.xf-yun.com/v1';

  const spark = createOpenAI({
    apiKey: config.apiKey,
    baseURL: baseUrl,
  });

  return spark.chat(modelId);
}

export const SPARK_MODELS = [
  {
    id: 'lite',
    name: '星火 Lite',
    contextWindow: 8000,
    outputWindow: 4096,
    capabilities: { streaming: true, tools: true, vision: false },
  },
  {
    id: 'generalv3',
    name: '星火 Pro',
    contextWindow: 8000,
    outputWindow: 8192,
    capabilities: { streaming: true, tools: true, vision: false },
  },
  {
    id: 'pro-128k',
    name: '星火 Pro-128K',
    contextWindow: 128000,
    outputWindow: 4096,
    capabilities: { streaming: true, tools: true, vision: false },
  },
  {
    id: '4.0Ultra',
    name: '星火 4.0 Ultra',
    contextWindow: 32000,
    outputWindow: 32000,
    capabilities: { streaming: true, tools: true, vision: true },
  },
];
