import { generateId } from '@/lib/utils';

/**
 * Media Tools — Image generation, video generation, and voice synthesis.
 *
 * Three tools for multimodal content generation:
 * 1. imagegen  — Generate images from text prompts via AI image APIs
 * 2. videogen  — Generate short video clips from text descriptions
 * 3. voice     — Text-to-speech synthesis
 *
 * These are placeholder implementations that define the tool interface.
 * Actual providers (OpenAI DALL-E, Stability AI, ElevenLabs, etc.)
 * are configured via environment variables.
 *
 * Provider support:
 * - Image: OpenAI DALL-E 3 (others as future)
 * - Video: RunwayML (submit + poll pattern), Pika (future)
 * - Voice: OpenAI TTS, Edge TTS
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolResult,
  type ToolPromptHints,
  createToolResult,
  createToolParameter,
  createToolPromptHints,
} from '@/lib/deeptutor/core/tool-protocol';
import { createLogger } from '@/lib/logger';

const log = createLogger('MediaTools');

// ---------------------------------------------------------------------------
// Media service context (configured during bootstrap)
// ---------------------------------------------------------------------------

export interface MediaServiceConfig {
  /** Image generation provider */
  imageProvider: 'openai' | 'stability' | 'siliconflow' | 'doubao' | 'tongyi' | 'none';
  /** Video generation provider */
  videoProvider: 'runwayml' | 'pika' | 'none';
  /** Voice/TTS provider */
  voiceProvider: 'openai' | 'elevenlabs' | 'edge' | 'none';
  /** API keys by provider */
  apiKeys: Record<string, string>;
  /** Output directory for generated media */
  outputDir: string;
}

let _config: MediaServiceConfig = {
  imageProvider: 'none',
  videoProvider: 'none',
  voiceProvider: 'none',
  apiKeys: {},
  outputDir: 'data/media',
};

export function setMediaToolContext(config: Partial<MediaServiceConfig>): void {
  _config = { ..._config, ...config };
  log.info(`Media tools configured: image=${_config.imageProvider}, video=${_config.videoProvider}, voice=${_config.voiceProvider}`);
}

export function getMediaConfig(): MediaServiceConfig {
  return { ..._config };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function downloadToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch (err) {
    log.error(`Failed to download media from ${url}:`, err);
    throw err;
  }
}

function generateMediaId(): string {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// 1. ImageGenTool
// ---------------------------------------------------------------------------

export class ImageGenTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'imagegen',
      description: 'Generate an image from a text description using AI image generation. Returns the generated image as a URL or base64 data.',
      parameters: [
        createToolParameter({ name: 'prompt', type: 'string', description: 'Detailed text description of the image to generate' }),
        createToolParameter({ name: 'style', type: 'string', description: 'Visual style: natural, vivid, artistic, digital-art, anime, photographic', required: false, default: 'natural', enum: ['natural', 'vivid', 'artistic', 'digital-art', 'anime', 'photographic'] }),
        createToolParameter({ name: 'size', type: 'string', description: 'Image size: 1024x1024, 1792x1024, 1024x1792', required: false, default: '1024x1024', enum: ['1024x1024', '1792x1024', '1024x1792'] }),
        createToolParameter({ name: 'quality', type: 'string', description: 'Generation quality: standard, hd', required: false, default: 'standard', enum: ['standard', 'hd'] }),
      ],
    };
  }

  override getPromptHints(): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Generate images from text',
      whenToUse: 'When the user asks to create, generate, or draw an image, illustration, diagram, or visual',
      inputFormat: 'prompt: detailed description, style: visual style, size: dimensions',
      guideline: 'Be descriptive in prompts. Include details about composition, lighting, colors, and mood.',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const prompt = kwargs.prompt as string;
      const style = (kwargs.style as string) || 'natural';
      const size = (kwargs.size as string) || '1024x1024';
      const quality = (kwargs.quality as string) || 'standard';

      if (_config.imageProvider === 'none') {
        return createToolResult({
          content: 'Image generation is not configured. Set DT_IMAGE_PROVIDER (openai|stability|siliconflow) and the corresponding API key.',
          success: false,
        });
      }

      if (_config.imageProvider === 'openai') {
        return await this.generateOpenAI(prompt, style, size, quality);
      }

      if (_config.imageProvider === 'stability') {
        return await this.generateStabilityAI(prompt, style, size);
      }

      if (_config.imageProvider === 'siliconflow') {
        return await this.generateSiliconFlow(prompt, style, size);
      }

      return createToolResult({
        content: `Image generation with provider "${_config.imageProvider}" is not supported.`,
        success: false,
      });
    } catch (err) {
      log.error('Image generation failed:', err);
      return createToolResult({
        content: `Image generation failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }

  private async generateOpenAI(
    prompt: string,
    style: string,
    size: string,
    quality: string,
  ): Promise<ToolResult> {
    const apiKey = _config.apiKeys.openai ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return createToolResult({ content: 'OpenAI API key not configured.', success: false });
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality,
        style,
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI DALL-E error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { data: Array<{ url: string; revised_prompt: string }> };
    const image = data.data[0];

    if (!image?.url) {
      return createToolResult({ content: 'No image URL returned from DALL-E.', success: false });
    }

    return createToolResult({
      content: `Generated image: ${image.url}\n\nRevised prompt: ${image.revised_prompt}`,
      metadata: {
        url: image.url,
        revisedPrompt: image.revised_prompt,
        provider: 'openai',
        mediaId: generateMediaId(),
      },
    });
  }

  private async generateStabilityAI(
    prompt: string,
    style: string,
    size: string,
  ): Promise<ToolResult> {
    const apiKey = _config.apiKeys.stability
      ?? process.env.STABILITY_API_KEY
      ?? process.env.IMAGE_GEN_API_KEY;
    if (!apiKey) {
      return createToolResult({ content: 'Stability AI API key not configured. Set STABILITY_API_KEY or IMAGE_GEN_API_KEY env var.', success: false });
    }

    // Map size string to aspect_ratio
    const aspectRatioMap: Record<string, string> = {
      '1024x1024': '1:1',
      '1792x1024': '16:9',
      '1024x1792': '9:16',
    };
    const aspectRatio = aspectRatioMap[size] ?? '1:1';

    // Build multipart form data
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('output_format', 'png');
    formData.append('aspect_ratio', aspectRatio);

    // Map style to negative prompt hints
    if (style === 'photographic') {
      formData.append('negative_prompt', 'blurry, cartoon, illustration, painting');
    } else if (style === 'anime') {
      formData.append('negative_prompt', 'photorealistic, 3d render, blurry');
    }

    log.info(`Stability AI request: prompt="${prompt.slice(0, 60)}...", aspect_ratio=${aspectRatio}`);

    const response = await fetch(
      'https://api.stability.ai/v2beta/stable-image/generate/core',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'image/*',
        },
        body: formData,
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stability AI error: ${response.status} ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const seed = response.headers.get('x-seed') ?? null;
    const contentType = response.headers.get('content-type') ?? 'image/png';

    return createToolResult({
      content: `Generated image via Stability AI (${buffer.byteLength} bytes, format: ${contentType}).`,
      metadata: {
        mediaId: generateMediaId(),
        provider: 'stability',
        format: contentType.split('/').pop() ?? 'png',
        imageBase64: base64,
        byteLength: buffer.byteLength,
        seed,
        prompt,
        style,
        aspectRatio,
      },
    });
  }

  private async generateSiliconFlow(
    prompt: string,
    style: string,
    size: string,
  ): Promise<ToolResult> {
    const apiKey = _config.apiKeys.siliconflow
      ?? process.env.SILICONFLOW_API_KEY
      ?? process.env.IMAGE_GEN_API_KEY;
    if (!apiKey) {
      return createToolResult({ content: 'SiliconFlow API key not configured. Set SILICONFLOW_API_KEY or IMAGE_GEN_API_KEY env var.', success: false });
    }

    // Map size to SiliconFlow image_size format
    const imageSizeMap: Record<string, string> = {
      '1024x1024': '1024x1024',
      '1792x1024': '1792x1024',
      '1024x1792': '1024x1792',
    };
    const imageSize = imageSizeMap[size] ?? '1024x1024';

    log.info(`SiliconFlow request: prompt="${prompt.slice(0, 60)}...", image_size=${imageSize}`);

    const response = await fetch('https://api.siliconflow.cn/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'stabilityai/stable-diffusion-3-5-large',
        prompt,
        image_size: imageSize,
        num_inference_steps: 30,
        guidance_scale: 7.5,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SiliconFlow API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { images: Array<{ url: string }> };
    const firstImage = data.images?.[0];

    if (!firstImage?.url) {
      return createToolResult({ content: 'SiliconFlow returned no image URL.', success: false });
    }

    // Download the image and convert to base64 for consistency
    const imageBase64 = await downloadToBase64(firstImage.url);

    return createToolResult({
      content: `Generated image via SiliconFlow: ${firstImage.url}`,
      metadata: {
        mediaId: generateMediaId(),
        provider: 'siliconflow',
        url: firstImage.url,
        imageBase64,
        prompt,
        style,
        imageSize,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// 2. VideoGenTool
// ---------------------------------------------------------------------------

export class VideoGenTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'videogen',
      description: 'Generate a short video clip from a text description. Returns a video URL or status.',
      parameters: [
        createToolParameter({ name: 'prompt', type: 'string', description: 'Detailed description of the video to generate' }),
        createToolParameter({ name: 'duration', type: 'number', description: 'Video duration in seconds (default: 4)', required: false, default: 4 }),
        createToolParameter({ name: 'style', type: 'string', description: 'Video style: cinematic, animation, realistic, artistic', required: false, default: 'cinematic', enum: ['cinematic', 'animation', 'realistic', 'artistic'] }),
      ],
    };
  }

  override getPromptHints(): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Generate video clips from text',
      whenToUse: 'When the user asks to create a video, animation, or motion clip',
      inputFormat: 'prompt: scene description, duration: seconds, style: visual style',
      guideline: 'Describe camera movement, subject motion, and scene composition clearly.',
      note: 'Video generation is compute-intensive and may take 30-120 seconds.',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const prompt = kwargs.prompt as string;
      const duration = (kwargs.duration as number) || 4;
      const style = (kwargs.style as string) || 'cinematic';

      if (_config.videoProvider === 'none') {
        return createToolResult({
          content: 'Video generation is not configured. Set DT_VIDEO_PROVIDER (runwayml) and the corresponding API key (RUNWAYML_API_SECRET).',
          success: false,
        });
      }

      if (_config.videoProvider === 'runwayml') {
        return await this.generateRunwayML(prompt, duration, style);
      }

      // Pika placeholder
      return createToolResult({
        content: `Video provider "${_config.videoProvider}" is not yet implemented. Currently supported: runwayml. Please set videoProvider to 'runwayml' in your settings.`,
        success: false,
      });
    } catch (err) {
      log.error('Video generation failed:', err);
      return createToolResult({
        content: `Video generation failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }

  /**
   * RunwayML video generation — submit task + poll for result.
   *
   * API flow:
   * 1. POST /v1/generations/video → returns { id: "task_xxx" }
   * 2. GET  /v1/tasks/{id} → poll every 5s until status is SUCCEEDED/FAILED
   * 3. Extract output.video_url on success
   */
  private async generateRunwayML(
    prompt: string,
    duration: number,
    style: string,
  ): Promise<ToolResult> {
    const apiSecret =
      _config.apiKeys.runwayml ?? process.env.RUNWAYML_API_SECRET;
    if (!apiSecret) {
      return createToolResult({
        content: 'RunwayML API secret not configured. Set RUNWAYML_API_SECRET env var.',
        success: false,
      });
    }

    const baseUrl = process.env.RUNWAYML_BASE_URL ?? 'https://api.runwayml.com/v1';

    // Step 1: Submit generation task
    log.info(`Submitting RunwayML video generation: "${prompt.slice(0, 60)}..." (${duration}s, ${style})`);

    const submitRes = await fetch(`${baseUrl}/generations/video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiSecret}`,
        'X-Runway-Version': '2025-04-01',
      },
      body: JSON.stringify({
        model: process.env.RUNWAYML_MODEL ?? 'gen4_turbo',
        promptText: prompt,
        duration: Math.min(Math.max(duration, 1), 10),
        resolution: '720p',
        ratio: '16:9',
      }),
    });

    if (!submitRes.ok) {
      const errorText = await submitRes.text();
      throw new Error(`RunwayML submit error: ${submitRes.status} ${errorText}`);
    }

    const submitData = (await submitRes.json()) as Record<string, unknown>;
    const taskId = String(submitData.id ?? '');

    if (!taskId) {
      return createToolResult({
        content: 'RunwayML did not return a task ID.',
        success: false,
      });
    }

    // Step 2: Poll for completion (max 5 minutes, every 5 seconds)
    const maxPollMs = 5 * 60 * 1000;
    const pollIntervalMs = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const pollRes = await fetch(`${baseUrl}/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${apiSecret}`,
          'X-Runway-Version': '2025-04-01',
        },
      });

      if (!pollRes.ok) {
        log.warn(`RunwayML poll error: ${pollRes.status}, retrying...`);
        continue;
      }

      const taskData = (await pollRes.json()) as Record<string, unknown>;
      const status = String(taskData.status ?? '').toUpperCase();

      if (status === 'SUCCEEDED') {
        const output = (taskData.output ?? {}) as Record<string, unknown>;
        const videoUrl = String(output.video_url ?? '');
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);

        if (!videoUrl) {
          return createToolResult({
            content: 'RunwayML task succeeded but no video URL was returned.',
            success: false,
          });
        }

        return createToolResult({
          content: `Video generated successfully in ${elapsedSec}s: ${videoUrl}`,
          metadata: {
            mediaId: generateMediaId(),
            provider: 'runwayml',
            status: 'completed',
            videoUrl,
            prompt,
            duration,
            style,
            taskId,
            elapsedSeconds: elapsedSec,
          },
        });
      }

      if (status === 'FAILED') {
        const failure = String(taskData.failure ?? 'Unknown error');
        throw new Error(`RunwayML generation failed: ${failure}`);
      }

      // PENDING, RUNNING, THROTTLED — continue polling
      log.info(`RunwayML task ${taskId}: ${status} (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
    }

    // Timeout — return processing status for client-side polling
    return createToolResult({
      content: `Video generation still processing (task: ${taskId}). Timed out after 5 minutes of server-side polling.`,
      metadata: {
        mediaId: generateMediaId(),
        provider: 'runwayml',
        status: 'processing',
        taskId,
        prompt,
        duration,
        style,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// 3. VoiceTool
// ---------------------------------------------------------------------------

export class VoiceTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'voice',
      description: 'Convert text to speech audio. Returns audio data as a URL or base64.',
      parameters: [
        createToolParameter({ name: 'text', type: 'string', description: 'Text to convert to speech' }),
        createToolParameter({ name: 'voice', type: 'string', description: 'Voice selection', required: false, default: 'alloy', enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] }),
        createToolParameter({ name: 'speed', type: 'number', description: 'Speech speed (0.25 to 4.0, default: 1.0)', required: false, default: 1.0 }),
        createToolParameter({ name: 'language', type: 'string', description: 'Language hint: en, zh, ja, ru, auto', required: false, default: 'auto' }),
      ],
    };
  }

  override getPromptHints(): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Text-to-speech synthesis',
      whenToUse: 'When the user asks to read text aloud, generate audio, or narrate content',
      inputFormat: 'text: content to speak, voice: voice selection, speed: playback rate',
      guideline: 'For best results, use clear punctuation and natural sentence structure.',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const text = kwargs.text as string;
      const voice = (kwargs.voice as string) || 'alloy';
      const speed = (kwargs.speed as number) || 1.0;
      const language = (kwargs.language as string) || 'auto';

      if (_config.voiceProvider === 'none') {
        return createToolResult({
          content: 'Voice synthesis is not configured. Set DT_VOICE_PROVIDER (openai|elevenlabs|edge) and the corresponding API key.',
          success: false,
        });
      }

      if (_config.voiceProvider === 'openai') {
        return await this.synthesizeOpenAI(text, voice, speed);
      }

      // Edge TTS fallback (free, no API key needed)
      if (_config.voiceProvider === 'edge') {
        return await this.synthesizeEdge(text, language);
      }

      return createToolResult({
        content: `Voice provider "${_config.voiceProvider}" is not yet implemented. Currently supported: openai, edge. Please set voiceProvider to 'openai' or 'edge' in your settings.`,
        success: false,
      });
    } catch (err) {
      log.error('Voice synthesis failed:', err);
      return createToolResult({
        content: `Voice synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }

  private async synthesizeOpenAI(
    text: string,
    voice: string,
    speed: number,
  ): Promise<ToolResult> {
    const apiKey = _config.apiKeys.openai ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return createToolResult({ content: 'OpenAI API key not configured.', success: false });
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        speed,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS error: ${response.status} ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return createToolResult({
      content: `Generated ${text.length} characters of speech audio (${buffer.byteLength} bytes).`,
      metadata: {
        mediaId: generateMediaId(),
        provider: 'openai',
        format: 'mp3',
        audioBase64: base64,
        byteLength: buffer.byteLength,
        voice,
        speed,
      },
    });
  }

  private async synthesizeEdge(
    text: string,
    language: string,
  ): Promise<ToolResult> {
    // Voice mapping for Edge TTS — uses Microsoft Neural voices
    const voiceMap: Record<string, string> = {
      'en': 'en-US-AriaNeural',
      'zh': 'zh-CN-XiaoxiaoNeural',
      'ja': 'ja-JP-NanamiNeural',
      'ru': 'ru-RU-SvetlanaNeural',
      'fr': 'fr-FR-DeniseNeural',
      'de': 'de-DE-KatjaNeural',
      'es': 'es-ES-ElviraNeural',
      'ko': 'ko-KR-SunHiNeural',
      'pt': 'pt-BR-FranciscaNeural',
      'ar': 'ar-SA-ZariyahNeural',
    };

    const langCode = language.slice(0, 2).toLowerCase();
    const voice = voiceMap[langCode] ?? voiceMap['en'];
    const resolvedLang = langCode in voiceMap ? language : 'en-US';

    // Build SSML document
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${resolvedLang}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`;

    const connectionId = generateId().replace(/-/g, '');

    log.info(`Edge TTS request: voice=${voice}, lang=${resolvedLang}, text_length=${text.length}`);

    try {
      const response = await fetch(
        `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/ssml+xml',
            'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          body: ssml,
          signal: AbortSignal.timeout(30_000),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge TTS HTTP error: ${response.status} ${errorText}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      log.info(`Edge TTS success: ${buffer.byteLength} bytes, voice=${voice}`);

      return createToolResult({
        content: `Audio generated successfully via Edge TTS (${buffer.byteLength} bytes, voice: ${voice}).`,
        metadata: {
          mediaId: generateMediaId(),
          provider: 'edge',
          format: 'mp3',
          audioBase64: base64,
          byteLength: buffer.byteLength,
          voice,
          language: resolvedLang,
        },
      });
    } catch (err) {
      log.error('Edge TTS synthesis failed:', err);
      return createToolResult({
        content: `Edge TTS synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMediaTools(): BaseTool[] {
  return [
    new ImageGenTool(),
    new VideoGenTool(),
    new VoiceTool(),
  ];
}
