import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { generateTTS } from '@/lib/audio/tts-providers';
import type { TTSModelConfig, TTSProviderId } from '@/lib/audio/types';
import { TTS_PROVIDERS, DEFAULT_TTS_VOICES, DEFAULT_TTS_MODELS } from '@/lib/audio/constants';

const log = createLogger('api:smartlearn:tts');

interface TTSRequest {
  text: string;
  providerId?: TTSProviderId;
  voice?: string;
  modelId?: string;
  speed?: number;
}

/** 从环境变量中解析 TTS provider 对应的 API key */
function resolveTTSApiKey(providerId: TTSProviderId): string | undefined {
  const envMap: Record<string, string> = {
    'openai-tts': process.env.OPENAI_API_KEY ?? '',
    'azure-tts': process.env.AZURE_SPEECH_KEY ?? '',
    'glm-tts': process.env.GLM_API_KEY ?? '',
    'qwen-tts': process.env.QWEN_API_KEY ?? '',
    'minimax-tts': process.env.MINIMAX_API_KEY ?? '',
    'doubao-tts': process.env.DOUBAO_API_KEY ?? '',
    'elevenlabs-tts': process.env.ELEVENLABS_API_KEY ?? '',
  };
  return envMap[providerId] || undefined;
}

function resolveTTSBaseUrl(providerId: TTSProviderId): string | undefined {
  const envMap: Record<string, string> = {
    'openai-tts': process.env.OPENAI_BASE_URL ?? '',
    'glm-tts': process.env.GLM_BASE_URL ?? '',
    'qwen-tts': process.env.QWEN_BASE_URL ?? '',
  };
  return envMap[providerId] || TTS_PROVIDERS[providerId]?.defaultBaseUrl;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TTSRequest;

    if (!body.text) {
      return NextResponse.json({ error: 'Missing required field: text' }, { status: 400 });
    }

    const providerId = body.providerId ?? 'openai-tts';
    const provider = TTS_PROVIDERS[providerId];
    if (!provider) {
      return NextResponse.json({ error: `Unknown TTS provider: ${providerId}` }, { status: 400 });
    }

    if (providerId === 'browser-native-tts') {
      return NextResponse.json({ error: 'Browser TTS must be called client-side' }, { status: 400 });
    }

    const apiKey = resolveTTSApiKey(providerId);
    if (provider.requiresApiKey && !apiKey) {
      return NextResponse.json(
        { error: `API key not configured for TTS provider: ${providerId}` },
        { status: 503 },
      );
    }

    const config: TTSModelConfig = {
      providerId,
      modelId: body.modelId ?? DEFAULT_TTS_MODELS[providerId] ?? provider.defaultModelId,
      apiKey,
      baseUrl: resolveTTSBaseUrl(providerId),
      voice: body.voice ?? DEFAULT_TTS_VOICES[providerId] ?? provider.voices[0]?.id ?? 'default',
      speed: body.speed ?? 1.0,
      format: provider.supportedFormats.includes('mp3') ? 'mp3' : provider.supportedFormats[0],
    };

    log.info(`TTS: provider=${providerId}, voice=${config.voice}, text="${body.text.slice(0, 60)}..."`);

    const result = await generateTTS(config, body.text);
    const audioBase64 = Buffer.from(result.audio).toString('base64');

    return NextResponse.json({
      audio: audioBase64,
      format: result.format,
      providerId,
      voice: config.voice,
    });
  } catch (error) {
    log.error('TTS generation failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'TTS generation failed' },
      { status: 500 },
    );
  }
}
