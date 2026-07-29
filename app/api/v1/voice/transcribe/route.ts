/**
 * POST /api/v1/voice/transcribe — Transcribe audio to text
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('VoiceTranscribeRoute');

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
    const contentType = req.headers.get('content-type') ?? '';

    if (!contentType.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: 'multipart/form-data with audio file is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = formData.get('language') as string | null;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: 'audio file is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check for OpenAI API key for Whisper transcription
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey || openaiKey === 'your_openai_api_key_here') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Voice transcription requires OPENAI_API_KEY for Whisper API',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Call OpenAI Whisper API
    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, audioFile.name);
    whisperForm.append('model', 'whisper-1');
    if (language) whisperForm.append('language', language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperForm,
    });

    if (!response.ok) {
      const errBody = await response.text();
      log.error(`Whisper API error: ${response.status} ${errBody}`);
      return new Response(JSON.stringify({ error: `Transcription failed: ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    return new Response(
      JSON.stringify({
        success: true,
        data: { text: result.text, language: result.language ?? language },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    log.error('POST /api/v1/voice/transcribe failed:', err);
    return apiError(err);
  }
}
