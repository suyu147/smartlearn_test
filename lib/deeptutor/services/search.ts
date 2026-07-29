/**
 * Search Service — Web search provider aggregation
 *
 * Supports three providers with automatic fallback:
 * - Tavily   (AI-powered, returns answer + sources, requires API key)
 * - Brave    (standard web SERP, requires API key)
 * - DuckDuckGo (free, no API key, HTML scraping fallback)
 *
 * Migrated from DeepTutor Python: deeptutor/services/search/
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('SearchService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchProviderName = 'tavily' | 'brave' | 'duckduckgo';

export interface SearchCitation {
  id: number;
  title: string;
  url: string;
  snippet: string;
  date: string;
  source: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date: string;
  score: number;
}

export interface WebSearchResponse {
  query: string;
  answer: string;
  provider: SearchProviderName;
  timestamp: string;
  citations: SearchCitation[];
  searchResults: SearchResult[];
  usage: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface SearchOptions {
  provider?: SearchProviderName;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeDomains?: string[];
  excludeDomains?: string[];
  days?: number;
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Provider: Tavily
// ---------------------------------------------------------------------------

async function searchTavily(
  query: string,
  apiKey: string,
  options: SearchOptions,
): Promise<WebSearchResponse> {
  const maxResults = options.maxResults ?? 8;
  const searchDepth = options.searchDepth ?? 'basic';
  const timeout = options.timeout ?? 30_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const body: Record<string, unknown> = {
      query,
      api_key: apiKey,
      search_depth: searchDepth,
      include_answer: true,
      include_raw_content: false,
      max_results: maxResults,
    };

    if (options.includeDomains?.length) {
      body.include_domains = options.includeDomains;
    }
    if (options.excludeDomains?.length) {
      body.exclude_domains = options.excludeDomains;
    }
    if (options.days != null) {
      body.days = options.days;
    }

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const results = (data.results ?? []) as Array<Record<string, unknown>>;

    const citations: SearchCitation[] = results.map((r, i) => ({
      id: i + 1,
      title: String(r.title ?? ''),
      url: String(r.url ?? ''),
      snippet: String(r.content ?? ''),
      date: String(r.published_date ?? ''),
      source: 'tavily',
    }));

    const searchResults: SearchResult[] = results.map((r) => ({
      title: String(r.title ?? ''),
      url: String(r.url ?? ''),
      snippet: String(r.content ?? ''),
      date: String(r.published_date ?? ''),
      score: Number(r.score ?? 0),
    }));

    return {
      query: String(data.query ?? query),
      answer: String(data.answer ?? ''),
      provider: 'tavily',
      timestamp: new Date().toISOString(),
      citations,
      searchResults,
      usage: {
        responseTime: data.response_time,
      },
      metadata: {
        images: data.images ?? [],
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Provider: Brave Search
// ---------------------------------------------------------------------------

async function searchBrave(
  query: string,
  apiKey: string,
  options: SearchOptions,
): Promise<WebSearchResponse> {
  const count = options.maxResults ?? 8;
  const timeout = options.timeout ?? 20_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const params = new URLSearchParams({ q: query, count: String(count) });
    if (options.days != null) {
      params.set('freshness', `pd:${options.days}`);
    }

    const url = `https://api.search.brave.com/res/v1/web/search?${params}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Brave API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const web = (data.web ?? {}) as Record<string, unknown>;
    const results = (web.results ?? []) as Array<Record<string, unknown>>;

    const citations: SearchCitation[] = results.map((r, i) => ({
      id: i + 1,
      title: String(r.title ?? ''),
      url: String(r.url ?? ''),
      snippet: String(r.description ?? ''),
      date: String(r.age ?? ''),
      source: 'brave',
    }));

    const searchResults: SearchResult[] = results.map((r) => ({
      title: String(r.title ?? ''),
      url: String(r.url ?? ''),
      snippet: String(r.description ?? ''),
      date: String(r.age ?? ''),
      score: 0,
    }));

    return {
      query,
      answer: '',
      provider: 'brave',
      timestamp: new Date().toISOString(),
      citations,
      searchResults,
      usage: {},
      metadata: {},
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Provider: DuckDuckGo (HTML scraping, no API key required)
// ---------------------------------------------------------------------------

async function searchDuckDuckGo(
  query: string,
  options: SearchOptions,
): Promise<WebSearchResponse> {
  const maxResults = options.maxResults ?? 8;
  const timeout = options.timeout ?? 20_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    // Use DuckDuckGo HTML endpoint (no API key needed)
    const params = new URLSearchParams({
      q: query,
      kl: '',
      s: '0',
      dc: String(maxResults),
      vqd: '',
      df: '',
    });

    const res = await fetch(
      `https://html.duckduckgo.com/html/?${params}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      throw new Error(
        `DuckDuckGo request failed: ${res.status} ${res.statusText}`,
      );
    }

    const html = await res.text();
    const results = parseDuckDuckGoHtml(html, maxResults);

    const citations: SearchCitation[] = results.map((r, i) => ({
      id: i + 1,
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      date: '',
      source: 'duckduckgo',
    }));

    return {
      query,
      answer: '',
      provider: 'duckduckgo',
      timestamp: new Date().toISOString(),
      citations,
      searchResults: results,
      usage: {},
      metadata: {},
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minimal HTML parser for DuckDuckGo search results.
 * Extracts titles, URLs, and snippets from the result list.
 */
function parseDuckDuckGoHtml(
  html: string,
  maxResults: number,
): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML results follow pattern:
  //   <a rel="nofollow" class="result__a" href="...">title</a>
  //   <a class="result__snippet" href="...">snippet</a>
  const linkRegex =
    /<a\s+rel="nofollow"\s+class="result__a"\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRegex =
    /<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const links: Array<{ url: string; title: string }> = [];
  const snippets: string[] = [];

  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    // DuckDuckGo wraps URLs in a redirect: //duckduckgo.com/l/?uddg=<encoded-url>&...
    let url = rawUrl;
    if (rawUrl.includes('uddg=')) {
      const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        try {
          url = decodeURIComponent(uddgMatch[1]);
        } catch {
          url = rawUrl;
        }
      }
    }
    const title = stripHtml(match[2]).trim();
    if (title && url && !url.includes('duckduckgo.com')) {
      links.push({ url, title });
    }
  }

  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtml(match[1]).trim());
  }

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? '',
      date: '',
      score: 0,
    });
  }

  return results;
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ');
}

// ---------------------------------------------------------------------------
// SearchService class
// ---------------------------------------------------------------------------

export class SearchServiceError extends Error {
  constructor(
    message: string,
    public readonly provider: SearchProviderName | 'none',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SearchServiceError';
  }
}

export interface SearchServiceConfig {
  tavilyApiKey?: string;
  braveApiKey?: string;
  defaultProvider?: SearchProviderName;
}

export class SearchServiceImpl {
  private readonly tavilyApiKey: string;
  private readonly braveApiKey: string;
  private readonly defaultProvider: SearchProviderName;

  constructor(config?: SearchServiceConfig) {
    this.tavilyApiKey =
      config?.tavilyApiKey ?? process.env.TAVILY_API_KEY ?? '';
    this.braveApiKey =
      config?.braveApiKey ?? process.env.BRAVE_API_KEY ?? '';
    this.defaultProvider =
      config?.defaultProvider ??
      ((process.env.DT_SEARCH_PROVIDER as SearchProviderName) || 'tavily');
  }

  /**
   * List providers that have API keys configured (or are key-free).
   */
  getAvailableProviders(): SearchProviderName[] {
    const providers: SearchProviderName[] = [];
    if (this.tavilyApiKey) providers.push('tavily');
    if (this.braveApiKey) providers.push('brave');
    providers.push('duckduckgo'); // always available
    return providers;
  }

  /**
   * Resolve which provider to use, with automatic fallback.
   *
   * Priority: requested provider → default provider → first available.
   * If Tavily/Brave are requested but no API key, falls back to DuckDuckGo.
   */
  private resolveProvider(
    requested?: SearchProviderName,
  ): SearchProviderName {
    const preferred = requested ?? this.defaultProvider;

    if (preferred === 'tavily' && this.tavilyApiKey) return 'tavily';
    if (preferred === 'brave' && this.braveApiKey) return 'brave';
    if (preferred === 'duckduckgo') return 'duckduckgo';

    // Fallback chain
    if (this.tavilyApiKey) return 'tavily';
    if (this.braveApiKey) return 'brave';
    return 'duckduckgo';
  }

  /**
   * Execute a web search.
   */
  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<WebSearchResponse> {
    if (!query || typeof query !== 'string') {
      throw new SearchServiceError('Search query is required', 'none');
    }

    const provider = this.resolveProvider(options?.provider);
    log.info(`Web search [${provider}]: "${query.slice(0, 80)}"`);

    try {
      switch (provider) {
        case 'tavily':
          return await searchTavily(query, this.tavilyApiKey, options ?? {});
        case 'brave':
          return await searchBrave(query, this.braveApiKey, options ?? {});
        case 'duckduckgo':
          return await searchDuckDuckGo(query, options ?? {});
      }
    } catch (error) {
      log.error(`Search failed [${provider}]:`, error);

      // If the primary provider fails, try fallback (unless already DDG)
      if (provider !== 'duckduckgo') {
        log.info('Falling back to DuckDuckGo');
        try {
          return await searchDuckDuckGo(query, options ?? {});
        } catch (fallbackError) {
          log.error('DuckDuckGo fallback also failed:', fallbackError);
          throw new SearchServiceError(
            `All search providers failed. Primary (${provider}): ${error instanceof Error ? error.message : String(error)}. Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
            'none',
            error,
          );
        }
      }

      throw new SearchServiceError(
        `DuckDuckGo search failed: ${error instanceof Error ? error.message : String(error)}`,
        'duckduckgo',
        error,
      );
    }
  }

  /**
   * Format search results as context string for LLM consumption.
   */
  formatAsContext(response: WebSearchResponse): string {
    const parts: string[] = [];

    if (response.answer) {
      parts.push(`## Answer\n${response.answer}\n`);
    }

    if (response.citations.length > 0) {
      parts.push('## Sources');
      for (const c of response.citations) {
        const line = c.snippet
          ? `[${c.id}] ${c.title} (${c.url}): ${c.snippet}`
          : `[${c.id}] ${c.title} (${c.url})`;
        parts.push(line);
      }
    }

    return parts.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: SearchServiceImpl | null = null;

export function getSearchService(
  config?: SearchServiceConfig,
): SearchServiceImpl {
  if (!_instance) {
    _instance = new SearchServiceImpl(config);
  }
  return _instance;
}

// Re-export legacy interface (satisfied by SearchServiceImpl)
export type SearchService = SearchServiceImpl;
