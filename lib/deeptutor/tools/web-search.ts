/**
 * WebSearchTool — Web search via configured providers
 *
 * Supports Tavily, Brave, and DuckDuckGo with automatic fallback.
 * Returns structured search results formatted for LLM consumption.
 *
 * Migrated from DeepTutor Python: deeptutor/tools/web_search.py
 */

import { BaseTool, createToolResult } from '@/lib/deeptutor/core/tool-protocol';
import type { ToolDefinition, ToolResult } from '@/lib/deeptutor/core/tool-protocol';
import { getSearchService } from '@/lib/deeptutor/services/search';
import { createLogger } from '@/lib/logger';

const log = createLogger('WebSearchTool');

export class WebSearchTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'web_search',
      description:
        'Search the web for current information. ' +
        'Use this to find up-to-date facts, recent news, or specific information ' +
        'that may not be in your training data. ' +
        'Returns an AI-generated answer when available, plus a list of sources with URLs.',
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'The search query to look up',
          required: true,
          default: null,
          enum: null,
          items: null,
        },
        {
          name: 'max_results',
          type: 'integer',
          description: 'Maximum number of results to return (default: 8, max: 20)',
          required: false,
          default: 8,
          enum: null,
          items: null,
        },
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const query = kwargs.query as string;
    const maxResults = Math.min(
      Math.max(Number(kwargs.max_results ?? 8), 1),
      20,
    );

    if (!query || typeof query !== 'string') {
      return createToolResult({
        content: 'Error: "query" is required and must be a non-empty string.',
        success: false,
      });
    }

    log.info('Web search query:', query.slice(0, 80));

    try {
      const searchService = getSearchService();
      const response = await searchService.search(query, { maxResults });

      // Build LLM-friendly content
      const parts: string[] = [];

      if (response.answer) {
        parts.push(`## Answer\n${response.answer}`);
      }

      if (response.citations.length > 0) {
        parts.push('\n## Sources');
        for (const c of response.citations) {
          const line = c.snippet
            ? `[${c.id}] ${c.title}\n    URL: ${c.url}\n    ${c.snippet}`
            : `[${c.id}] ${c.title}\n    URL: ${c.url}`;
          parts.push(line);
        }
      }

      if (parts.length === 0) {
        return createToolResult({
          content: `No results found for "${query}".`,
          success: true,
          metadata: { query, provider: response.provider, resultCount: 0 },
        });
      }

      const content = parts.join('\n\n');

      // Build sources array for UI citation display
      const sources = response.citations.map((c) => ({
        id: c.id,
        title: c.title,
        url: c.url,
        snippet: c.snippet,
        source: c.source,
      }));

      return createToolResult({
        content,
        sources,
        success: true,
        metadata: {
          query,
          provider: response.provider,
          resultCount: response.citations.length,
          hasAnswer: !!response.answer,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      log.error('Web search failed:', message);

      return createToolResult({
        content:
          `Web search for "${query}" failed: ${message}\n` +
          'Please try a different query or use web_fetch to access specific URLs directly.',
        success: false,
        metadata: { query, error: message },
      });
    }
  }
}

export default WebSearchTool;
