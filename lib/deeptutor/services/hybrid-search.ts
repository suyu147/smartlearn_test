/**
 * HybridSearch — Combines BM25 keyword search with vector similarity
 *
 * Uses Reciprocal Rank Fusion (RRF) to merge two ranked result lists
 * into a single relevance-ordered list. RRF is parameter-free and
 * robust across different score distributions.
 *
 * RRF score = Σ 1 / (k + rank_i)  where k = 60 (default)
 *
 * Also supports multi-query retrieval: decompose a complex query
 * into sub-queries, search each independently, then fuse results.
 *
 * Migrated from: deeptutor/services/rag/factory.py (hybrid mode)
 * + deeptutor/services/rag/pipelines/llamaindex/config.py
 */

import { createLogger } from '@/lib/logger';
import { BM25Scorer, tokenize } from './bm25';
import type { BM25Document, BM25Result } from './bm25';
import type { RAGSource } from './rag';

const log = createLogger('HybridSearch');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HybridSearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  /** Individual rank positions from each retriever */
  ranks: { bm25?: number; vector?: number };
}

export interface HybridSearchOptions {
  /** Number of results to return (default: 5) */
  topK?: number;
  /** Minimum fused score threshold (default: 0.01) */
  minScore?: number;
  /** RRF constant k (default: 60) */
  rrfK?: number;
  /** Weight for BM25 results (default: 1.0) */
  bm25Weight?: number;
  /** Weight for vector results (default: 1.0) */
  vectorWeight?: number;
  /** How many candidates to fetch from each retriever before fusion */
  candidateMultiplier?: number;
}

export interface MultiQueryOptions extends HybridSearchOptions {
  /** Sub-queries to search independently */
  subQueries: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.01;
const DEFAULT_RRF_K = 60;
const DEFAULT_BM25_WEIGHT = 1.0;
const DEFAULT_VECTOR_WEIGHT = 1.0;
const DEFAULT_CANDIDATE_MULTIPLIER = 3;

// BM25 top-k multiplier: fetch more BM25 candidates since keyword
// matching can be sparse
const BM25_TOP_K_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion
// ---------------------------------------------------------------------------

/**
 * Merge BM25 and vector results using Reciprocal Rank Fusion.
 *
 * Each result list is ranked by position (1-indexed). The fused score
 * for a document is the sum of 1/(k + rank) across all lists where it
 * appears, optionally weighted.
 */
export function reciprocalRankFusion(
  bm25Results: BM25Result[],
  vectorResults: RAGSource[],
  options: {
    rrfK?: number;
    bm25Weight?: number;
    vectorWeight?: number;
    topK?: number;
    minScore?: number;
  } = {},
): HybridSearchResult[] {
  const rrfK = options.rrfK ?? DEFAULT_RRF_K;
  const bm25W = options.bm25Weight ?? DEFAULT_BM25_WEIGHT;
  const vectorW = options.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
  const topK = options.topK ?? DEFAULT_TOP_K;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;

  // Score accumulator
  const scores = new Map<string, {
    score: number;
    bm25Rank?: number;
    vectorRank?: number;
    bm25Result?: BM25Result;
    vectorResult?: RAGSource;
  }>();

  // Process BM25 results (rank 1-indexed)
  for (let i = 0; i < bm25Results.length; i++) {
    const r = bm25Results[i];
    const rank = i + 1;
    const rrfScore = bm25W / (rrfK + rank);

    const entry = scores.get(r.id) ?? { score: 0 };
    entry.score += rrfScore;
    entry.bm25Rank = rank;
    entry.bm25Result = r;
    scores.set(r.id, entry);
  }

  // Process vector results (rank 1-indexed)
  for (let i = 0; i < vectorResults.length; i++) {
    const r = vectorResults[i];
    const rank = i + 1;
    const rrfScore = vectorW / (rrfK + rank);

    const entry = scores.get(r.chunkId) ?? { score: 0 };
    entry.score += rrfScore;
    entry.vectorRank = rank;
    entry.vectorResult = r;
    scores.set(r.chunkId, entry);
  }

  // Convert to sorted results
  const results: HybridSearchResult[] = [];

  for (const [id, entry] of scores) {
    if (entry.score < minScore) continue;

    // Prefer vector result metadata if available (has documentId, title, etc.)
    const source = entry.vectorResult ?? entry.bm25Result;
    if (!source) continue;

    const isVector = !!entry.vectorResult;

    results.push({
      chunkId: id,
      documentId: isVector
        ? entry.vectorResult!.documentId
        : (entry.bm25Result!.metadata.documentId as string ?? ''),
      documentTitle: isVector
        ? entry.vectorResult!.documentTitle
        : (entry.bm25Result!.metadata.documentTitle as string ?? 'Unknown'),
      content: source.content,
      score: entry.score,
      chunkIndex: isVector
        ? entry.vectorResult!.chunkIndex
        : (entry.bm25Result!.metadata.chunkIndex as number ?? 0),
      metadata: source.metadata,
      ranks: {
        bm25: entry.bm25Rank,
        vector: entry.vectorRank,
      },
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// ---------------------------------------------------------------------------
// Hybrid Search Service
// ---------------------------------------------------------------------------

export class HybridSearchService {
  private bm25Scorer: BM25Scorer;

  constructor() {
    this.bm25Scorer = new BM25Scorer();
  }

  /**
   * Build the BM25 index from document chunks.
   * Should be called after documents are indexed.
   */
  buildIndex(docs: BM25Document[], version?: string): void {
    this.bm25Scorer.buildIndex(docs, version);
  }

  /**
   * Perform hybrid search combining BM25 and vector results.
   *
   * @param query         — User query
   * @param vectorResults — Pre-computed vector similarity results
   * @param options       — Hybrid search options
   */
  search(
    query: string,
    vectorResults: RAGSource[],
    options: HybridSearchOptions = {},
  ): HybridSearchResult[] {
    const topK = options.topK ?? DEFAULT_TOP_K;
    const candidateMultiplier = options.candidateMultiplier ?? DEFAULT_CANDIDATE_MULTIPLIER;

    // Get BM25 candidates
    const bm25Results = this.bm25Scorer.isReady
      ? this.bm25Scorer.search(query, topK * candidateMultiplier * BM25_TOP_K_MULTIPLIER)
      : [];

    if (bm25Results.length === 0 && vectorResults.length === 0) {
      return [];
    }

    // Fuse results
    const fused = reciprocalRankFusion(
      bm25Results,
      vectorResults,
      {
        rrfK: options.rrfK,
        bm25Weight: options.bm25Weight,
        vectorWeight: options.vectorWeight,
        topK,
        minScore: options.minScore,
      },
    );

    log.debug(
      `Hybrid search: ${bm25Results.length} BM25 + ${vectorResults.length} vector → ${fused.length} fused results`,
    );

    return fused;
  }

  /**
   * Multi-query retrieval: decompose a complex query into sub-queries,
   * search each independently, then fuse all results.
   *
   * This improves recall for complex questions that span multiple topics.
   */
  multiQuerySearch(
    mainQuery: string,
    subQueries: string[],
    vectorSearchFn: (query: string) => Promise<RAGSource[]>,
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResult[]> {
    return this.executeMultiQuery(mainQuery, subQueries, vectorSearchFn, options);
  }

  private async executeMultiQuery(
    mainQuery: string,
    subQueries: string[],
    vectorSearchFn: (query: string) => Promise<RAGSource[]>,
    options: HybridSearchOptions,
  ): Promise<HybridSearchResult[]> {
    const topK = options.topK ?? DEFAULT_TOP_K;

    // Search main query + sub-queries in parallel
    const allQueries = [mainQuery, ...subQueries];
    const allResults = await Promise.all(
      allQueries.map(async (q) => {
        const vectorResults = await vectorSearchFn(q);
        return this.search(q, vectorResults, {
          ...options,
          topK: topK * 2, // fetch more per sub-query for better fusion
        });
      }),
    );

    // Flatten and re-fuse all sub-query results
    const allCandidates = allResults.flat();

    // Deduplicate by chunkId, keeping highest score
    const deduped = new Map<string, HybridSearchResult>();
    for (const result of allCandidates) {
      const existing = deduped.get(result.chunkId);
      if (!existing || result.score > existing.score) {
        deduped.set(result.chunkId, result);
      }
    }

    const final = Array.from(deduped.values());
    final.sort((a, b) => b.score - a.score);

    log.debug(`Multi-query: ${allQueries.length} queries → ${final.length} deduplicated results`);

    return final.slice(0, topK);
  }

  /**
   * Check if BM25 index is ready.
   */
  get isReady(): boolean {
    return this.bm25Scorer.isReady;
  }

  /**
   * Get BM25 index version.
   */
  get indexVersion(): string {
    return this.bm25Scorer.version;
  }

  /**
   * Get indexed document count.
   */
  get docCount(): number {
    return this.bm25Scorer.docCount;
  }
}

// ---------------------------------------------------------------------------
// Index Versioning
// ---------------------------------------------------------------------------

export interface IndexVersion {
  version: string;
  createdAt: string;
  docCount: number;
  termCount: number;
}

/**
 * Simple in-memory index version tracker.
 * In production, this would persist to disk or database.
 */
export class IndexVersionTracker {
  private versions: IndexVersion[] = [];
  private currentVersion: string = '';

  record(version: string, docCount: number, termCount: number): void {
    this.versions.push({
      version,
      createdAt: new Date().toISOString(),
      docCount,
      termCount,
    });
    this.currentVersion = version;
    log.info(`Index version recorded: ${version} (${docCount} docs, ${termCount} terms)`);
  }

  get current(): string {
    return this.currentVersion;
  }

  get history(): IndexVersion[] {
    return [...this.versions];
  }

  /**
   * Check if the index needs rebuilding based on document changes.
   */
  needsRebuild(currentDocCount: number, threshold: number = 0.1): boolean {
    const last = this.versions[this.versions.length - 1];
    if (!last) return true;

    const changeRatio = Math.abs(currentDocCount - last.docCount) / Math.max(last.docCount, 1);
    return changeRatio > threshold;
  }
}
