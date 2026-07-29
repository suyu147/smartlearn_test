/**
 * Smart Retriever — Multi-query automatic retrieval
 *
 * Inspired by DeepTutor Python's smart_retriever.py.
 *
 * Instead of relying on the LLM to decide when to call the RAG tool,
 * Smart Retriever proactively generates multiple query variants from
 * the user's message, performs concurrent vector searches, and
 * aggregates the results by deduplication + re-ranking.
 *
 * Usage:
 *   const retriever = new SmartRetriever(ragService, userId, kbIds);
 *   const result = await retriever.retrieve("What is quantum entanglement?");
 */

import { createLogger } from '@/lib/logger';
import type { RAGServiceImpl, RAGSearchResult, RAGSearchOptions } from '@/lib/deeptutor/services/rag';
import { cosineSimilarity } from '@/lib/deeptutor/services/rag';

const log = createLogger('SmartRetriever');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmartRetrievalResult {
  /** Original user query */
  originalQuery: string;
  /** Generated query variants (including original) */
  queryVariants: string[];
  /** Aggregated results after dedup + rerank */
  aggregated: RAGSearchResult;
  /** Per-variant results for debugging */
  perVariant: Array<{
    query: string;
    resultCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// Query Generation
// ---------------------------------------------------------------------------

/**
 * Generate query variants from the original query.
 *
 * Strategy (no LLM needed — uses heuristic transformations):
 * 1. Original query
 * 2. Key noun extraction (remove stop words)
 * 3. Question-to-statement transformation
 * 4. Broader/different phrasing
 */
function generateQueryVariants(query: string): string[] {
  const variants = new Set<string>();

  // 1. Original
  variants.add(query.trim());

  // 2. Remove common Chinese/English question prefixes
  const dequestioned = query
    .replace(/^(什么是|怎么|如何|为什么|哪个|哪些|能不能|可以|请问|tell me about|what is|how to|how do|why|which|can you|explain)\s*/i, '')
    .trim();
  if (dequestioned.length > 2 && dequestioned !== query.trim()) {
    variants.add(dequestioned);
  }

  // 3. Extract key terms (split by common delimiters)
  const terms = query
    .split(/[，,、；;？?！!。.\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && t.length < query.length);
  if (terms.length > 0) {
    // Use the most significant term (longest)
    const keyTerm = terms.sort((a, b) => b.length - a.length)[0];
    if (keyTerm !== query.trim()) {
      variants.add(keyTerm);
    }
  }

  // 4. If the query contains "和" or "与" (and), split into sub-queries
  const andSplit = query.split(/[和与and&]/).map((s) => s.trim()).filter((s) => s.length > 1);
  for (const part of andSplit) {
    if (part !== query.trim()) {
      variants.add(part);
    }
  }

  return Array.from(variants).slice(0, 4); // Max 4 variants
}

// ---------------------------------------------------------------------------
// Result Aggregation
// ---------------------------------------------------------------------------

interface ScoredChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  chunkIndex: number;
  score: number;
  metadata: Record<string, unknown>;
  /** How many query variants matched this chunk */
  hitCount: number;
}

/**
 * Aggregate results from multiple query variants.
 *
 * Deduplication: same chunkId → merge scores.
 * Reranking: combined score = avg similarity * (1 + 0.2 * hitCount)
 */
function aggregateResults(
  perVariantResults: Array<{ query: string; result: RAGSearchResult }>,
  topK: number,
): RAGSearchResult {
  const chunkMap = new Map<string, ScoredChunk>();

  for (const { query: _q, result } of perVariantResults) {
    for (const source of result.sources) {
      const existing = chunkMap.get(source.chunkId);
      if (existing) {
        // Already seen — boost the score and increment hit count
        existing.score = Math.max(existing.score, source.score);
        existing.hitCount += 1;
      } else {
        chunkMap.set(source.chunkId, {
          chunkId: source.chunkId,
          documentId: source.documentId,
          documentTitle: source.documentTitle,
          content: source.content,
          chunkIndex: source.chunkIndex,
          score: source.score,
          metadata: source.metadata,
          hitCount: 1,
        });
      }
    }
  }

  // Recompute scores with hit-count boost
  const scored = Array.from(chunkMap.values()).map((chunk) => ({
    ...chunk,
    score: chunk.score * (1 + 0.2 * (chunk.hitCount - 1)), // Boost multi-hit
  }));

  // Sort by boosted score descending
  scored.sort((a, b) => b.score - a.score);

  // Trim to topK
  const topResults = scored.slice(0, topK);

  // Build context
  const context = topResults
    .map((s, i) => `[${i + 1}] From: ${s.documentTitle} (chunk ${s.chunkIndex + 1}, relevance: ${(s.score * 100).toFixed(1)}%, matched by ${s.hitCount} variant(s))\n${s.content}`)
    .join('\n\n---\n\n');

  return {
    query: perVariantResults[0]?.result.query ?? '',
    context,
    sources: topResults.map((s) => ({
      chunkId: s.chunkId,
      documentId: s.documentId,
      documentTitle: s.documentTitle,
      content: s.content,
      score: s.score,
      chunkIndex: s.chunkIndex,
      metadata: s.metadata,
    })),
  };
}

// ---------------------------------------------------------------------------
// SmartRetriever
// ---------------------------------------------------------------------------

export class SmartRetriever {
  private ragService: RAGServiceImpl;
  private kbIds: string[];
  private userId: string;

  constructor(ragService: RAGServiceImpl, userId: string, kbIds: string[]) {
    this.ragService = ragService;
    this.userId = userId;
    this.kbIds = kbIds;
  }

  /**
   * Perform smart multi-query retrieval.
   *
   * @param query — The user's original query
   * @param options — Search options
   * @returns Aggregated results with query variant info
   */
  async retrieve(
    query: string,
    options: RAGSearchOptions & { enableMultiQuery?: boolean } = {},
  ): Promise<SmartRetrievalResult> {
    const enableMultiQuery = options.enableMultiQuery !== false;
    const topK = options.topK ?? 5;

    if (this.kbIds.length === 0) {
      return {
        originalQuery: query,
        queryVariants: [query],
        aggregated: { query, context: '', sources: [] },
        perVariant: [],
      };
    }

    // Generate query variants
    const variants = enableMultiQuery
      ? generateQueryVariants(query)
      : [query];

    log.info(`Smart retrieval: "${query.slice(0, 50)}..." → ${variants.length} variant(s)`);

    // Concurrent search across all variants
    const searchPromises = variants.map(async (variant) => {
      try {
        const result = await this.ragService.search(variant, this.kbIds, {
          ...options,
          topK: Math.ceil(topK * 1.5), // Fetch more for dedup headroom
          rerank: false, // Skip per-variant rerank; we rerank after aggregation
        });
        return { query: variant, result };
      } catch (err) {
        log.debug(`Variant search failed for "${variant.slice(0, 30)}":`, err);
        return null;
      }
    });

    const searchResults = await Promise.all(searchPromises);
    const validResults = searchResults.filter(
      (r): r is { query: string; result: RAGSearchResult } => r !== null,
    );

    // Aggregate and deduplicate
    const aggregated = aggregateResults(validResults, topK);

    const perVariant = validResults.map((r) => ({
      query: r.query,
      resultCount: r.result.sources.length,
    }));

    log.info(
      `Smart retrieval complete: ${perVariant.length} variants, ` +
      `${aggregated.sources.length} unique chunks after dedup`,
    );

    return {
      originalQuery: query,
      queryVariants: variants,
      aggregated,
      perVariant,
    };
  }
}
