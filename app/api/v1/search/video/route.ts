/**
 * POST /api/v1/search/video — Search for videos (YouTube/external)
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('VideoSearchRoute');

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
    const body = await req.json();
    const { query, maxResults = 5 } = body;

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Video search requires YouTube Data API key configuration.
    // Return a structured response indicating the feature is available
    // but needs external integration for actual results.
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          query,
          maxResults,
          results: [],
          message: 'Video search requires YouTube Data API key configuration. Use web search for now.',
          provider: 'none',
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    log.error('POST /api/v1/search/video failed:', err);
    return apiError(err);
  }
}
