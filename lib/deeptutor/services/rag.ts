/**
 * RAGService — Knowledge base vector retrieval
 *
 * Performs semantic search across knowledge base documents using
 * pgvector's <=> cosine distance operator for efficient ranking.
 * Embeddings are stored as native vector(1024) columns.
 *
 * BM25 hybrid retrieval is handled by HybridSearchService (Phase 5).
 */

import { prisma } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import { Prisma } from '@prisma/client';
import type { EmbeddingServiceImpl } from './embedding';
import { toVectorString } from './pgvector';
import { RerankerServiceImpl, type RerankCandidate } from './reranker';

const log = createLogger('RAGService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RAGSearchResult {
  /** The original query */
  query: string;
  /** Concatenated context from all retrieved chunks */
  context: string;
  /** Individual retrieved chunks with scores and metadata */
  sources: RAGSource[];
}

export interface RAGSource {
  /** Chunk ID */
  chunkId: string;
  /** Document ID */
  documentId: string;
  /** Document title */
  documentTitle: string;
  /** Chunk text content */
  content: string;
  /** Similarity score (0-1, higher is better) */
  score: number;
  /** Chunk index within document */
  chunkIndex: number;
  /** Additional metadata (page, source, etc.) */
  metadata: Record<string, unknown>;
}

export interface RAGSearchOptions {
  /** Number of results to return (default: 5) */
  topK?: number;
  /** Minimum similarity score threshold (default: 0.3) */
  minScore?: number;
  /** Whether to apply reranking (default: true) */
  rerank?: boolean;
  /** Maximum context length in characters (default: 8000) */
  maxContextLength?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.3;
const DEFAULT_MAX_CONTEXT_LENGTH = 8000;

// ---------------------------------------------------------------------------
// Raw SQL result row from pgvector query
// ---------------------------------------------------------------------------

interface VectorSearchRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Prisma.JsonValue;
  score: number;
  title: string;
}

// ---------------------------------------------------------------------------
// RAGService
// ---------------------------------------------------------------------------

export class RAGServiceImpl {
  private embeddingService: EmbeddingServiceImpl;
  private reranker: RerankerServiceImpl | null;

  constructor(embeddingService: EmbeddingServiceImpl, reranker?: RerankerServiceImpl) {
    this.embeddingService = embeddingService;
    this.reranker = reranker ?? null;
  }

  /**
   * Search knowledge bases for relevant chunks.
   *
   * @param query     — The search query
   * @param kbIds     — Knowledge base IDs to search across
   * @param options   — Search options (topK, minScore, etc.)
   */
  async search(
    query: string,
    kbIds: string[],
    options: RAGSearchOptions = {},
  ): Promise<RAGSearchResult> {
    const topK = options.topK ?? DEFAULT_TOP_K;
    const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
    const maxContextLength = options.maxContextLength ?? DEFAULT_MAX_CONTEXT_LENGTH;
    const shouldRerank = options.rerank !== false && this.reranker !== null;

    if (kbIds.length === 0) {
      return { query, context: '', sources: [] };
    }

    // 1. Embed the query
    const queryEmbedding = await this.embeddingService.embedOne(query);

    // 2. Retrieve candidates from pgvector
    //    When reranking, fetch extra candidates (3x) for better rerank quality
    const retrievalLimit = shouldRerank ? topK * 3 : topK;
    const results = await this.vectorSearch(queryEmbedding, kbIds, retrievalLimit);

    // 3. Filter by minimum score
    let filtered = results.filter((c) => c.score >= minScore);

    if (filtered.length === 0) {
      log.info(`No results above threshold ${minScore} for query: "${query.slice(0, 50)}..."`);
      return { query, context: '', sources: [] };
    }

    // 4. Apply reranking if enabled
    if (shouldRerank && filtered.length > 1) {
      const candidates: RerankCandidate[] = filtered.map((r) => ({
        chunkId: r.chunkId,
        content: r.content,
        score: r.score,
        metadata: r.metadata,
      }));

      const reranked = this.reranker!.rerank(query, candidates, topK);

      // Map reranked results back to RAGSource format
      filtered = reranked.map((r) => {
        const original = filtered.find((f) => f.chunkId === r.chunkId)!;
        return {
          ...original,
          score: r.combinedScore, // Use combined score for ranking
        };
      });

      log.debug(`Reranked ${candidates.length} → ${filtered.length} results`);
    } else {
      // No reranking — just trim to topK
      filtered = filtered.slice(0, topK);
    }

    // 5. Build context string
    const context = this.buildContext(filtered, maxContextLength);

    return {
      query,
      context,
      sources: filtered,
    };
  }

  /**
   * Search a single KB by name. Convenience wrapper.
   */
  async searchByName(
    query: string,
    kbName: string,
    userId: string,
    options: RAGSearchOptions = {},
  ): Promise<RAGSearchResult> {
    const kb = await prisma.dtKnowledgeBase.findFirst({
      where: { userId, name: kbName, status: 'ready' },
    });
    if (!kb) {
      return { query, context: '', sources: [] };
    }
    return this.search(query, [kb.id], options);
  }

  // -------------------------------------------------------------------------
  // Vector Search (pgvector native)
  // -------------------------------------------------------------------------

  /**
   * Search chunks using pgvector's <=> cosine distance operator.
   * The database handles ranking, avoiding the need to load all vectors into memory.
   *
   * Score = 1 - cosine_distance  (converts distance to similarity: higher = better)
   */
  private async vectorSearch(
    queryVector: number[],
    kbIds: string[],
    limit: number,
  ): Promise<RAGSource[]> {
    try {
      const vectorStr = toVectorString(queryVector);

      // Use $queryRawUnsafe for pgvector operations.
      // <=> returns cosine distance (0 = identical, 2 = opposite).
      // We convert to similarity: score = 1 - distance.
      const rows = await prisma.$queryRawUnsafe<VectorSearchRow[]>(
        `SELECT
           c.id,
           c.document_id,
           c.content,
           c.chunk_index,
           c.metadata,
           (1 - (c.embedding <=> $1::vector)) AS score,
           d.title
         FROM dt_document_chunks c
         JOIN dt_documents d ON d.id = c.document_id
         WHERE d.kb_id = ANY($2::text[])
           AND d.status = 'ready'
           AND c.embedding IS NOT NULL
         ORDER BY c.embedding <=> $1::vector
         LIMIT $3`,
        vectorStr,
        kbIds,
        limit,
      );

      return rows.map((row) => ({
        chunkId: row.id,
        documentId: row.document_id,
        documentTitle: row.title,
        content: row.content,
        score: row.score,
        chunkIndex: row.chunk_index,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
      }));
    } catch (err) {
      log.error('Vector search failed:', err);
      throw new RAGError(`Vector search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Context Building
  // -------------------------------------------------------------------------

  /**
   * Build a context string from retrieved chunks.
   * Truncates to maxContextLength if needed.
   */
  private buildContext(sources: RAGSource[], maxLength: number): string {
    const parts: string[] = [];
    let totalLength = 0;

    for (const source of sources) {
      const header = `[Source: ${source.documentTitle}, Chunk ${source.chunkIndex + 1}]`;
      const block = `${header}\n${source.content}\n`;

      if (totalLength + block.length > maxLength) {
        // Truncate this chunk to fit
        const remaining = maxLength - totalLength;
        if (remaining > 100) {
          parts.push(block.slice(0, remaining) + '\n[... truncated]');
        }
        break;
      }

      parts.push(block);
      totalLength += block.length;
    }

    return parts.join('\n---\n\n');
  }
}

// ---------------------------------------------------------------------------
// Cosine Similarity (fallback for non-pgvector environments)
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two vectors in JavaScript.
 * Used as fallback when pgvector is not available.
 * Returns a value between -1 and 1 (higher = more similar).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class RAGError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RAGError';
  }
}

// Re-export interface for backward compatibility
export interface RAGService {
  search(query: string, kbNames: string[], topK?: number): Promise<Record<string, unknown>[]>;
}
