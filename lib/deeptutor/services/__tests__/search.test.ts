import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchServiceImpl } from '../search';
import type { SearchProviderName } from '../search';

describe('SearchServiceImpl', () => {
  describe('constructor', () => {
    it('reads config values', () => {
      const svc = new SearchServiceImpl({
        tavilyApiKey: 'tv-test',
        braveApiKey: 'br-test',
        defaultProvider: 'brave',
      });
      expect(svc.getAvailableProviders()).toContain('tavily');
      expect(svc.getAvailableProviders()).toContain('brave');
      expect(svc.getAvailableProviders()).toContain('duckduckgo');
    });

    it('falls back to env vars when no config', () => {
      const original = process.env.TAVILY_API_KEY;
      process.env.TAVILY_API_KEY = 'tv-env';
      try {
        const svc = new SearchServiceImpl();
        expect(svc.getAvailableProviders()).toContain('tavily');
      } finally {
        if (original === undefined) delete process.env.TAVILY_API_KEY;
        else process.env.TAVILY_API_KEY = original;
      }
    });

    it('always includes duckduckgo', () => {
      const svc = new SearchServiceImpl({ tavilyApiKey: '', braveApiKey: '' });
      const providers = svc.getAvailableProviders();
      expect(providers).toContain('duckduckgo');
      expect(providers).toHaveLength(1);
    });
  });

  describe('search — validation', () => {
    it('throws on empty query', async () => {
      const svc = new SearchServiceImpl({ tavilyApiKey: '', braveApiKey: '' });
      await expect(svc.search('')).rejects.toThrow('Search query is required');
    });

    it('throws on non-string query', async () => {
      const svc = new SearchServiceImpl({ tavilyApiKey: '', braveApiKey: '' });
      await expect(svc.search(123 as unknown as string)).rejects.toThrow('Search query is required');
    });
  });

  describe('search — DuckDuckGo fallback', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('uses duckduckgo when no API keys configured', async () => {
      // Mock fetch to simulate DuckDuckGo HTML response
      const mockHtml = `
        <a rel="nofollow" class="result__a" href="https://example.com/page1">Example Title 1</a>
        <a class="result__snippet" href="#">This is the first snippet</a>
        <a rel="nofollow" class="result__a" href="https://example.com/page2">Example Title 2</a>
        <a class="result__snippet" href="#">This is the second snippet</a>
      `;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      }));

      const svc = new SearchServiceImpl({ tavilyApiKey: '', braveApiKey: '' });
      const result = await svc.search('test query');

      expect(result.provider).toBe('duckduckgo');
      expect(result.query).toBe('test query');
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.citations[0].title).toBe('Example Title 1');
      expect(result.citations[0].url).toBe('https://example.com/page1');

      vi.unstubAllGlobals();
    });
  });

  describe('search — Tavily integration', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('calls Tavily API and returns structured results', async () => {
      const mockResponse = {
        query: 'test',
        answer: 'Test answer',
        results: [
          { title: 'Result 1', url: 'https://r1.com', content: 'Content 1', score: 0.9 },
          { title: 'Result 2', url: 'https://r2.com', content: 'Content 2', score: 0.7 },
        ],
        response_time: 1.5,
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }));

      const svc = new SearchServiceImpl({ tavilyApiKey: 'tv-test-key' });
      const result = await svc.search('test', { provider: 'tavily' });

      expect(result.provider).toBe('tavily');
      expect(result.answer).toBe('Test answer');
      expect(result.citations).toHaveLength(2);
      expect(result.citations[0].title).toBe('Result 1');
      expect(result.citations[0].source).toBe('tavily');
      expect(result.searchResults).toHaveLength(2);
      expect(result.searchResults[0].score).toBe(0.9);

      vi.unstubAllGlobals();
    });

    it('falls back to DuckDuckGo when Tavily fails', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Tavily fails
          return Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error' });
        }
        // DuckDuckGo succeeds
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<a rel="nofollow" class="result__a" href="https://ddg.com">DDG Result</a><a class="result__snippet" href="#">DDG snippet</a>'),
        });
      }));

      const svc = new SearchServiceImpl({ tavilyApiKey: 'tv-key' });
      const result = await svc.search('fallback test');

      expect(result.provider).toBe('duckduckgo');
      expect(callCount).toBeGreaterThanOrEqual(2);

      vi.unstubAllGlobals();
    });
  });

  describe('search — Brave integration', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('calls Brave API with correct headers', async () => {
      const mockResponse = {
        web: {
          results: [
            { title: 'Brave Result', url: 'https://brave.com', description: 'A brave result', age: '2 days ago' },
          ],
        },
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }));

      const svc = new SearchServiceImpl({ braveApiKey: 'br-key' });
      const result = await svc.search('brave test', { provider: 'brave' });

      expect(result.provider).toBe('brave');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].title).toBe('Brave Result');
      expect(result.citations[0].source).toBe('brave');

      // Verify fetch was called with X-Subscription-Token header
      const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].headers['X-Subscription-Token']).toBe('br-key');

      vi.unstubAllGlobals();
    });
  });

  describe('formatAsContext', () => {
    it('formats answer and citations', () => {
      const svc = new SearchServiceImpl();
      const formatted = svc.formatAsContext({
        query: 'test',
        answer: 'The answer is 42.',
        provider: 'tavily' as SearchProviderName,
        timestamp: '2026-01-01',
        citations: [
          { id: 1, title: 'Source A', url: 'https://a.com', snippet: 'Snippet A', date: '', source: 'tavily' },
          { id: 2, title: 'Source B', url: 'https://b.com', snippet: '', date: '', source: 'tavily' },
        ],
        searchResults: [],
        usage: {},
        metadata: {},
      });

      expect(formatted).toContain('## Answer');
      expect(formatted).toContain('The answer is 42.');
      expect(formatted).toContain('[1] Source A (https://a.com): Snippet A');
      expect(formatted).toContain('[2] Source B (https://b.com)');
    });

    it('handles empty answer', () => {
      const svc = new SearchServiceImpl();
      const formatted = svc.formatAsContext({
        query: 'test',
        answer: '',
        provider: 'brave' as SearchProviderName,
        timestamp: '2026-01-01',
        citations: [
          { id: 1, title: 'Only Source', url: 'https://only.com', snippet: 'Only snippet', date: '', source: 'brave' },
        ],
        searchResults: [],
        usage: {},
        metadata: {},
      });

      expect(formatted).not.toContain('## Answer');
      expect(formatted).toContain('## Sources');
      expect(formatted).toContain('[1] Only Source');
    });
  });
});
