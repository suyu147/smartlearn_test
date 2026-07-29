import { NextRequest, NextResponse } from 'next/server';

import { getSearchService } from '@/lib/deeptutor/services/search';
import type { SearchProviderName } from '@/lib/deeptutor/services/search';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/search/web');

/**
 * POST /api/v1/search/web — Execute a web search
 *
 * Body: { query: string, provider?: string, maxResults?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const query = body.query;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: query (string)' },
        { status: 400 },
      );
    }

    const provider = body.provider as SearchProviderName | undefined;
    const maxResults = Number(body.maxResults ?? 8);

    const searchService = getSearchService();
    const response = await searchService.search(query, {
      provider,
      maxResults: Math.min(Math.max(maxResults, 1), 20),
    });

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    log.error('Web search failed:', message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
