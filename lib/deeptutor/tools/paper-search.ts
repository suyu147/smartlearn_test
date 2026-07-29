/**
 * PaperSearchTool — Search for academic papers
 *
 * Uses Semantic Scholar as primary provider with arXiv fallback.
 * Both APIs are free and require no API key.
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

const log = createLogger('PaperSearchTool');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaperResult {
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  url: string;
  citationCount: number | null;
  source: 'semantic_scholar' | 'arxiv';
}

interface SemanticScholarPaper {
  title: string;
  authors: Array<{ name: string }>;
  year: number | null;
  abstract: string | null;
  citationCount: number | null;
  url: string;
  openAccessPdf: { url: string } | null;
}

interface SemanticScholarResponse {
  total: number;
  offset: number;
  data: SemanticScholarPaper[];
}

interface ArxivEntry {
  title: string;
  summary: string;
  authors: string[];
  published: string;
  link: string;
  arxivId: string;
}

// ---------------------------------------------------------------------------
// Semantic Scholar API
// ---------------------------------------------------------------------------

async function searchSemanticScholar(
  query: string,
  limit: number,
  yearFrom: number | null,
): Promise<{ papers: PaperResult[]; total: number }> {
  const fields = 'title,authors,year,abstract,citationCount,url,openAccessPdf';
  const params = new URLSearchParams({
    query,
    limit: String(Math.min(limit, 100)),
    offset: '0',
    fields,
  });

  if (yearFrom !== null) {
    params.set('year', `${yearFrom}-`);
  }

  const url = `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`;
  log.info(`Semantic Scholar request: query="${query}", limit=${limit}`);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Semantic Scholar API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as SemanticScholarResponse;

  const papers: PaperResult[] = data.data.map((p) => ({
    title: p.title || 'Untitled',
    authors: p.authors.map((a) => a.name),
    year: p.year ?? null,
    abstract: p.abstract ?? '',
    url: p.openAccessPdf?.url ?? p.url ?? '',
    citationCount: p.citationCount ?? null,
    source: 'semantic_scholar' as const,
  }));

  return { papers, total: data.total };
}

// ---------------------------------------------------------------------------
// arXiv API (fallback)
// ---------------------------------------------------------------------------

async function searchArxiv(
  query: string,
  limit: number,
): Promise<{ papers: PaperResult[]; total: number }> {
  // arXiv uses a different query syntax
  const searchQuery = encodeURIComponent(query.replace(/\s+/g, '+'));
  const params = new URLSearchParams({
    search_query: `all:${searchQuery}`,
    start: '0',
    max_results: String(Math.min(limit, 50)),
    sortBy: 'relevance',
  });

  const url = `http://export.arxiv.org/api/query?${params.toString()}`;
  log.info(`arXiv request: query="${query}", max_results=${limit}`);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`arXiv API error: ${response.status} ${errorText}`);
  }

  const xml = await response.text();
  const entries = parseArxivXml(xml);

  const papers: PaperResult[] = entries.map((entry) => {
    const year = entry.published ? new Date(entry.published).getFullYear() : null;
    return {
      title: entry.title,
      authors: entry.authors,
      year,
      abstract: entry.summary,
      url: entry.link,
      citationCount: null,
      source: 'arxiv' as const,
    };
  });

  // arXiv doesn't always return a total in the feed; use entries length as minimum
  const totalMatch = xml.match(/<opensearch:totalResults>(\d+)<\/opensearch:totalResults>/);
  const total = totalMatch ? parseInt(totalMatch[1], 10) : papers.length;

  return { papers, total };
}

/**
 * Parse arXiv Atom XML feed with simple regex extraction.
 * Avoids pulling in a full XML parser dependency.
 */
function parseArxivXml(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const summaryMatch = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
    const idMatch = block.match(/<id>([^<]+)<\/id>/);

    // Extract authors
    const authorNames: string[] = [];
    const authorRegex = /<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(block)) !== null) {
      authorNames.push(authorMatch[1].trim());
    }

    const title = titleMatch ? cleanXmlText(titleMatch[1]) : 'Untitled';
    const summary = summaryMatch ? cleanXmlText(summaryMatch[1]) : '';
    const link = idMatch ? idMatch[1].trim() : '';
    const arxivId = link.split('/abs/').pop() ?? link;

    entries.push({
      title,
      summary,
      authors: authorNames,
      published: publishedMatch ? publishedMatch[1].trim() : '',
      link,
      arxivId,
    });
  }

  return entries;
}

/** Strip XML tags and normalize whitespace */
function cleanXmlText(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatPapersForLLM(papers: PaperResult[], totalResults: number, provider: string): string {
  if (papers.length === 0) {
    return `No papers found. (provider: ${provider}, total reported: ${totalResults})`;
  }

  const header = `Found ${totalResults} total results (showing ${papers.length}). Provider: ${provider}.\n\n`;

  const formatted = papers.map((p, i) => {
    const authorStr = p.authors.length > 3
      ? `${p.authors.slice(0, 3).join(', ')} et al.`
      : p.authors.join(', ');
    const yearStr = p.year !== null ? String(p.year) : 'n.d.';
    const abstractSnippet = p.abstract.length > 200
      ? p.abstract.slice(0, 200) + '...'
      : p.abstract || '(no abstract available)';
    const citationStr = p.citationCount !== null ? `${p.citationCount} citations` : 'citation count unknown';

    return `[${i + 1}] ${p.title}\n    Authors: ${authorStr}\n    Year: ${yearStr} | ${citationStr}\n    Abstract: ${abstractSnippet}\n    URL: ${p.url}`;
  });

  return header + formatted.join('\n\n');
}

// ---------------------------------------------------------------------------
// Tool class
// ---------------------------------------------------------------------------

export class PaperSearchTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'paper_search',
      description: 'Search for academic papers and research publications using Semantic Scholar and arXiv. Returns titles, authors, abstracts, citation counts, and links.',
      parameters: [
        createToolParameter({
          name: 'query',
          type: 'string',
          description: 'Search query for academic papers.',
          required: true,
        }),
        createToolParameter({
          name: 'limit',
          type: 'number',
          description: 'Maximum number of results to return (default: 10, max: 50).',
          required: false,
          default: 10,
        }),
        createToolParameter({
          name: 'year_from',
          type: 'number',
          description: 'Only return papers published in or after this year (e.g. 2020). Optional.',
          required: false,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Search academic papers via Semantic Scholar and arXiv.',
      whenToUse: 'When the user asks for research papers, academic references, scientific literature, or citations.',
      inputFormat: 'query: academic search terms, limit: max results, year_from: filter by publication year',
      note: 'Semantic Scholar is tried first; arXiv is used as fallback on rate limits or errors.',
      phase: 'retrieval',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const query = kwargs.query as string;

    if (!query) {
      return createToolResult({ content: 'Error: query is required.', success: false });
    }

    const limit = typeof kwargs.limit === 'number' ? Math.min(kwargs.limit, 50) : 10;
    const yearFrom = typeof kwargs.year_from === 'number' ? kwargs.year_from : null;

    // Try Semantic Scholar first
    let papers: PaperResult[] = [];
    let totalResults = 0;
    let provider = 'semantic_scholar';

    try {
      const result = await searchSemanticScholar(query, limit, yearFrom);
      papers = result.papers;
      totalResults = result.total;
      log.info(`Semantic Scholar returned ${papers.length} papers (total: ${totalResults})`);
    } catch (err) {
      log.warn(`Semantic Scholar failed, falling back to arXiv: ${err instanceof Error ? err.message : String(err)}`);

      // Fall back to arXiv
      try {
        const fallback = await searchArxiv(query, limit);
        papers = fallback.papers;
        totalResults = fallback.total;
        provider = 'arxiv';
        log.info(`arXiv fallback returned ${papers.length} papers (total: ${totalResults})`);
      } catch (arxivErr) {
        log.error(`arXiv fallback also failed: ${arxivErr instanceof Error ? arxivErr.message : String(arxivErr)}`);
        return createToolResult({
          content: `Both academic search providers failed.\n- Semantic Scholar: ${err instanceof Error ? err.message : String(err)}\n- arXiv: ${arxivErr instanceof Error ? arxivErr.message : String(arxivErr)}\n\nTry using web_search as an alternative.`,
          success: false,
          metadata: { query, providersAttempted: ['semantic_scholar', 'arxiv'] },
        });
      }
    }

    const formattedText = formatPapersForLLM(papers, totalResults, provider);

    return createToolResult({
      content: formattedText,
      metadata: {
        papers,
        totalResults,
        provider,
        query,
        limit,
        yearFrom,
      },
    });
  }
}
