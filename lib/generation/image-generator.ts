import { createLogger } from '@/lib/logger';
const log = createLogger('ImageGeneration');

export type ImageGenProvider = 'siliconflow' | 'tongyi' | 'openai' | 'doubao';

export const IMAGE_GEN_PROVIDERS: Array<{
  id: ImageGenProvider;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  envKey: string;
}> = [
  {
    id: 'siliconflow',
    name: 'SiliconFlow (硅基流动)',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'stabilityai/stable-diffusion-3-5-large',
    envKey: 'IMAGE_GEN_API_KEY',
  },
  {
    id: 'tongyi',
    name: '通义万相 (阿里云)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    defaultModel: 'wanx-v1',
    envKey: 'IMAGE_GEN_API_KEY',
  },
  {
    id: 'openai',
    name: 'OpenAI DALL-E',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'dall-e-3',
    envKey: 'IMAGE_GEN_API_KEY',
  },
  {
    id: 'doubao',
    name: '豆包 (字节跳动)',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
    defaultModel: 'doubao-seedream-4-5-251128',
    envKey: 'DOUBAO_IMAGE_API_KEY',
  },
];

export interface ImageGenerationOptions {
  prompt: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  style?: string;
}

export interface ImageGenerationResult {
  url: string;
  elementId: string;
}

function resolveApiKey(provider: ImageGenProvider): string {
  switch (provider) {
    case 'doubao':
      return process.env.DOUBAO_IMAGE_API_KEY || process.env.IMAGE_GEN_API_KEY || '';
    default:
      return process.env.IMAGE_GEN_API_KEY || '';
  }
}

function resolveBaseUrl(provider: ImageGenProvider): string {
  switch (provider) {
    case 'doubao':
      return process.env.DOUBAO_IMAGE_BASE_URL || process.env.IMAGE_GEN_BASE_URL || 'https://ark.cn-beijing.volces.com';
    default:
      return process.env.IMAGE_GEN_BASE_URL || IMAGE_GEN_PROVIDERS.find((p) => p.id === provider)?.defaultBaseUrl || '';
  }
}

function resolveModel(provider: ImageGenProvider): string {
  switch (provider) {
    case 'doubao':
      return process.env.DOUBAO_IMAGE_MODEL || 'doubao-seedream-5-0-pro-260628';
    default:
      return process.env.IMAGE_GEN_MODEL || IMAGE_GEN_PROVIDERS.find((p) => p.id === provider)?.defaultModel || '';
  }
}

/** Per-request timeout (ms) for a single fetch call */
const FETCH_TIMEOUT_MS = 90_000;
/** Overall timeout (ms) for the entire batch image generation */
const BATCH_TIMEOUT_MS = 300_000;

function createAbortController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Prevent the Node.js timer from keeping the process alive
  if (timer.unref) timer.unref();
  return controller;
}

export async function generateImage(
  options: ImageGenerationOptions,
  elementId: string,
): Promise<ImageGenerationResult | null> {
  const provider = (process.env.IMAGE_GEN_PROVIDER || 'siliconflow') as ImageGenProvider;
  const apiKey = resolveApiKey(provider);

  if (!apiKey) {
    log.warn('Image generation API key not configured, skipping image generation');
    return null;
  }

  try {
    switch (provider) {
      case 'siliconflow':
        return await generateWithSiliconFlow(options, elementId, apiKey);
      case 'tongyi':
        return await generateWithTongyi(options, elementId, apiKey);
      case 'openai':
        return await generateWithOpenAI(options, elementId, apiKey);
      case 'doubao':
        return await generateWithDoubao(options, elementId, apiKey);
      default:
        log.warn(`Unknown image generation provider: ${provider}`);
        return null;
    }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      log.error(`Image generation timed out for ${elementId}`);
    } else {
      log.error(`Image generation failed for ${elementId}:`, error);
    }
    return null;
  }
}

async function generateWithSiliconFlow(
  options: ImageGenerationOptions,
  elementId: string,
  apiKey: string,
): Promise<ImageGenerationResult | null> {
  const baseUrl = resolveBaseUrl('siliconflow');
  const model = resolveModel('siliconflow');
  const size = resolveSize(options.aspectRatio);
  const { signal } = createAbortController(FETCH_TIMEOUT_MS);

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: options.prompt,
      image_size: size,
      num_inference_steps: 20,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`SiliconFlow API error: ${response.status} ${errorText}`);
    return null;
  }

  const data = await response.json();
  const imageUrl = data?.images?.[0]?.url;

  if (!imageUrl) {
    log.error('No image URL in SiliconFlow response');
    return null;
  }

  return { url: imageUrl, elementId };
}

async function generateWithTongyi(
  options: ImageGenerationOptions,
  elementId: string,
  apiKey: string,
): Promise<ImageGenerationResult | null> {
  const baseUrl = resolveBaseUrl('tongyi');
  const model = resolveModel('tongyi');
  const size = resolveSize(options.aspectRatio);
  const { signal: submitSignal } = createAbortController(FETCH_TIMEOUT_MS);

  const response = await fetch(`${baseUrl}/services/aigc/text2image/image-synthesis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model,
      input: { prompt: options.prompt },
      parameters: {
        size,
        n: 1,
        style: options.style || '<auto>',
      },
    }),
    signal: submitSignal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`Tongyi API error: ${response.status} ${errorText}`);
    return null;
  }

  const data = await response.json();
  const taskId = data?.output?.task_id;

  if (!taskId) {
    log.error('No task_id in Tongyi response');
    return null;
  }

  const maxPolls = 30;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { signal: pollSignal } = createAbortController(FETCH_TIMEOUT_MS);

    const pollResponse = await fetch(
      `${baseUrl}/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: pollSignal },
    );

    if (!pollResponse.ok) continue;

    const pollData = await pollResponse.json();
    const status = pollData?.output?.task_status;

    if (status === 'SUCCEEDED') {
      const imageUrl = pollData?.output?.results?.[0]?.url;
      if (imageUrl) {
        return { url: imageUrl, elementId };
      }
      break;
    }

    if (status === 'FAILED') {
      log.error('Tongyi image generation task failed');
      return null;
    }
  }

  return null;
}

async function generateWithOpenAI(
  options: ImageGenerationOptions,
  elementId: string,
  apiKey: string,
): Promise<ImageGenerationResult | null> {
  const baseUrl = resolveBaseUrl('openai');
  const model = resolveModel('openai');
  const size = resolveSizeOpenAI(options.aspectRatio);
  const { signal } = createAbortController(FETCH_TIMEOUT_MS);

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: options.prompt,
      n: 1,
      size,
      quality: 'standard',
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`OpenAI API error: ${response.status} ${errorText}`);
    return null;
  }

  const data = await response.json();
  const imageUrl = data?.data?.[0]?.url;

  if (!imageUrl) {
    log.error('No image URL in OpenAI response');
    return null;
  }

  return { url: imageUrl, elementId };
}

async function generateWithDoubao(
  options: ImageGenerationOptions,
  elementId: string,
  apiKey: string,
): Promise<ImageGenerationResult | null> {
  const baseUrl = resolveBaseUrl('doubao');
  const model = resolveModel('doubao');
  const size = resolveSizeDoubao(options.aspectRatio);

  const requestBody: Record<string, unknown> = {
    model,
    prompt: options.prompt,
    size,
    response_format: 'url',
    sequential_image_generation: 'disabled',
    stream: false,
    watermark: false,
  };

  log.debug(`Doubao API request: ${baseUrl}/api/v3/images/generations, model=${model}, size=${size}`);
  const { signal } = createAbortController(FETCH_TIMEOUT_MS);

  const response = await fetch(`${baseUrl}/api/v3/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`Doubao API error: ${response.status} ${errorText}`);
    return null;
  }

  const data = await response.json();
  log.debug(`Doubao API response keys: ${Object.keys(data || {}).join(', ')}`);

  const imageUrl =
    data?.data?.[0]?.url ||
    data?.images?.[0]?.url ||
    data?.output?.image_url ||
    data?.url;

  if (!imageUrl) {
    log.error('No image URL in Doubao response. Response structure: ' + JSON.stringify(data).substring(0, 500));
    return null;
  }

  return { url: imageUrl, elementId };
}

function resolveSize(aspectRatio?: string): string {
  switch (aspectRatio) {
    case '1:1': return '1024x1024';
    case '4:3': return '1024x768';
    case '3:4': return '768x1024';
    case '16:9': return '1024x576';
    case '9:16': return '576x1024';
    default: return '1024x576';
  }
}

function resolveSizeOpenAI(aspectRatio?: string): string {
  switch (aspectRatio) {
    case '1:1': return '1024x1024';
    case '16:9': return '1792x1024';
    case '9:16': return '1024x1792';
    default: return '1792x1024';
  }
}

function resolveSizeDoubao(aspectRatio?: string): string {
  switch (aspectRatio) {
    case '1:1': return '2048x2048';
    case '4:3': return '2560x1920';
    case '3:4': return '1920x2560';
    case '16:9': return '2560x1440';
    case '9:16': return '1440x2560';
    default: return '2560x1440';
  }
}

export async function batchGenerateImages(
  mediaGenerations: Array<{ elementId: string; type: string; prompt: string; aspectRatio?: string }>,
  concurrency = 2,
): Promise<Map<string, string>> {
  const imageGens = mediaGenerations.filter((mg) => mg.type === 'image');
  if (imageGens.length === 0) return new Map();

  const mapping = new Map<string, string>();
  const queue = [...imageGens];

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const result = await generateImage(
        { prompt: item.prompt, aspectRatio: item.aspectRatio },
        item.elementId,
      );

      if (result) {
        mapping.set(result.elementId, result.url);
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());

  // Race the batch against an overall timeout so the PPT generation is never
  // blocked indefinitely by slow/unreachable image APIs.
  try {
    await Promise.race([
      Promise.all(workers),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new DOMException('Batch image generation timed out', 'AbortError')), BATCH_TIMEOUT_MS);
        if (timer.unref) timer.unref();
      }),
    ]);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      log.warn(`Batch image generation timed out after ${BATCH_TIMEOUT_MS}ms, proceeding with partial results`);
    } else {
      log.error('Batch image generation failed:', error);
    }
  }

  return mapping;
}
