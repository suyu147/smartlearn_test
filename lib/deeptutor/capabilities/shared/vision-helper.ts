/**
 * Vision Helper — shared image attachment handling for all capabilities.
 *
 * Extracted from ChatCapability so every capability (solve, research, visualize, etc.)
 * can process image attachments the same way.
 */
import { HumanMessage } from '@langchain/core/messages';
import type { UnifiedContext } from '../../core/types';
import type { ProviderId } from '@/lib/ai/providers';

export interface ImageAttachment {
  type: string;
  base64: string;
  url: string;
  mime_type?: string;
  filename?: string;
}

/**
 * Resolve the effective vision API key.
 * Falls back to provider-specific env vars when VISION_API_KEY is empty.
 */
function resolveVisionApiKey(visionProvider: string): string {
  const direct = process.env.VISION_API_KEY || '';
  if (direct) return direct;

  const providerKeyMap: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    glm: process.env.GLM_API_KEY,
    siliconflow: process.env.SILICONFLOW_API_KEY,
    doubao: process.env.DOUBAO_API_KEY,
    kimi: process.env.KIMI_API_KEY,
    qwen: process.env.QWEN_API_KEY,
    minimax: process.env.MINIMAX_API_KEY,
    grok: process.env.GROK_API_KEY,
    spark: process.env.SPARK_API_KEY,
  };
  return providerKeyMap[visionProvider] || '';
}

/** Check whether a dedicated vision proxy is configured */
export function isVisionProxyConfigured(): boolean {
  const provider = process.env.VISION_PROVIDER;
  if (!provider) return false;
  return !!resolveVisionApiKey(provider);
}

/**
 * Call a vision-capable model to describe images, returning a text summary.
 * Uses VISION_PROVIDER / VISION_MODEL / VISION_API_KEY env vars.
 */
async function describeImagesViaVisionModel(
  imageAttachments: ImageAttachment[],
  userMessage: string,
): Promise<string> {
  const visionProvider = process.env.VISION_PROVIDER || 'openai';
  const visionModel = process.env.VISION_MODEL || 'gpt-4o-mini';
  const visionApiKey = resolveVisionApiKey(visionProvider);
  const visionBaseUrl = process.env.VISION_BASE_URL || '';

  if (!visionApiKey) {
    const count = imageAttachments.length;
    return `[系统提示：用户发送了 ${count} 张图片，但视觉代理模型未配置，无法获取图片内容。请告知用户当前不支持图片识别。]`;
  }

  const maxRetries = 3;
  const retryDelayBaseMs = 2000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const isRetry = attempt > 0;
      const promptText = userMessage
        ? `请逐一详细描述这张/这些图片的内容。用户附带的问题是："${userMessage}"。请着重描述图片中与用户问题相关的视觉元素。用中文回答。`
        : `请逐一详细描述这张/这些图片的内容。用中文回答。`;

      const contentParts: Array<Record<string, unknown>> = [
        { type: 'text', text: isRetry ? `[重试第${attempt}次] ${promptText}` : promptText },
        ...imageAttachments.map((a) => {
          const mimeType = a.mime_type || 'image/jpeg';
          const imageData = a.url
            ? a.url
            : `data:${mimeType};base64,${a.base64}`;
          return { type: 'image_url', image_url: { url: imageData } };
        }),
      ];

      let apiUrl: string;
      if (visionBaseUrl) {
        apiUrl = visionBaseUrl.replace(/\/$/, '');
      } else {
        const { getProvider } = await import('@/lib/ai/providers');
        const providerConfig = getProvider(visionProvider as ProviderId);
        apiUrl = providerConfig?.defaultBaseUrl
          ? providerConfig.defaultBaseUrl.replace(/\/$/, '')
          : 'https://api.deepseek.com/v1';
      }
      if (!apiUrl.includes('/v') && !apiUrl.endsWith('/v1')) {
        apiUrl += '/v1';
      }
      apiUrl += '/chat/completions';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${visionApiKey}`,
        },
        body: JSON.stringify({
          model: visionModel,
          messages: [{ role: 'user', content: contentParts }],
          max_tokens: 2000,
        }),
      });

      if (response.status === 429) {
        if (attempt < maxRetries) {
          const delay = retryDelayBaseMs * (attempt + 1);
          console.warn(`[VisionHelper] Vision API 429 rate-limited (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Vision API 429 (rate-limited after ${maxRetries + 1} attempts)`);
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`Vision API ${response.status}: ${errBody.slice(0, 300)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content || '';
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = retryDelayBaseMs * (attempt + 1);
        console.warn(`[VisionHelper] Vision API error (attempt ${attempt + 1}/${maxRetries + 1}): ${error instanceof Error ? error.message : String(error)}, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[VisionHelper] Vision proxy failed (${visionProvider}/${visionModel}):`, errMsg);
      return '';
    }
  }

  return '';
}

/**
 * Build a user-facing HumanMessage, automatically handling image attachments.
 *
 * Strategy (in priority order):
 *  1. Vision proxy configured → describe images via proxy, inject as text
 *  2. Main model supports vision → native image_url content array
 *  3. No vision support → inject a hint telling the model it can't see images
 *
 * When no images are present, returns a plain-text HumanMessage.
 */
export async function buildUserMessage(context: UnifiedContext): Promise<HumanMessage> {
  const allAttachments = context.attachments;
  const imageAttachments = allAttachments.filter(
    (a) => a.type === 'image' && (a.base64 || a.url),
  ) as ImageAttachment[];

  console.log(`[VisionHelper] buildUserMessage: totalAttachments=${allAttachments.length}, imageAttachments=${imageAttachments.length}, visionProxy=${isVisionProxyConfigured()}`);

  if (imageAttachments.length === 0) {
    if (allAttachments.length > 0) {
      console.log(`[VisionHelper] Non-image attachments found: ${allAttachments.map(a => a.type).join(', ')}`);
    }
    return new HumanMessage({ content: context.userMessage });
  }

  // 1. Vision proxy
  if (isVisionProxyConfigured()) {
    const descriptions = await describeImagesViaVisionModel(imageAttachments, context.userMessage);
    const augmentedText = descriptions
      ? `以下是用户发送的图片内容描述，请结合这些视觉信息回答问题：\n\n${descriptions}\n\n用户的问题：${context.userMessage}`
      : `[系统提示：用户发送了 ${imageAttachments.length} 张图片，但视觉识别服务暂时繁忙（已自动重试后仍失败）。请友善地告知用户：图片识别服务当前不可用，请稍后重试或改用文字描述图片内容。]\n\n用户的问题：${context.userMessage}`;
    return new HumanMessage({ content: augmentedText });
  }

  // 2. Check main model vision capability
  const overrides = context.configOverrides ?? {};
  const meta = context.metadata ?? {};
  const mainProviderId = (overrides.providerId as string) || (meta.providerId as string) || process.env.AI_PROVIDER || 'openai';
  const mainModelId = (overrides.modelId as string) || (meta.modelId as string) || process.env.AI_MODEL || 'gpt-4o';

  try {
    const { getModelInfo } = await import('@/lib/ai/providers');
    const mainModelInfo = getModelInfo(mainProviderId as ProviderId, mainModelId);
    if (mainModelInfo?.capabilities.vision) {
      const contentParts: Array<Record<string, unknown>> = [
        { type: 'text', text: context.userMessage },
        ...imageAttachments.map((a) => {
          const mimeType = a.mime_type || 'image/jpeg';
          const imageData = a.url ? a.url : `data:${mimeType};base64,${a.base64}`;
          return { type: 'image_url', image_url: { url: imageData } };
        }),
      ];
      return new HumanMessage({ content: contentParts as unknown as string });
    }
  } catch {
    // getModelInfo failed — fall through to no-vision hint
  }

  // 3. No vision support
  const count = imageAttachments.length;
  const augmentedText = `[系统提示：用户发送了 ${count} 张图片，但当前模型不支持视觉识别。请告知用户当前不支持图片识别，需要配置视觉代理模型。]\n\n用户的问题：${context.userMessage}`;
  return new HumanMessage({ content: augmentedText });
}

/**
 * Like buildUserMessage, but returns a plain text string instead of a HumanMessage.
 * Useful for capabilities that use generateText() with prompt strings instead of messages.
 */
export async function augmentUserMessageText(context: UnifiedContext): Promise<string> {
  const msg = await buildUserMessage(context);
  return typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
}
