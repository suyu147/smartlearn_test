/**
 * BM25Scorer — Okapi BM25 keyword-based relevance scoring
 *
 * Implements the BM25 (Best Matching 25) ranking function for
 * full-text keyword search across document chunks. Used in
 * conjunction with vector similarity for hybrid retrieval.
 *
 * Parameters (tuned for educational content):
 *   k1 = 1.2  — term frequency saturation
 *   b  = 0.75 — document length normalization
 *
 * Migrated from: deeptutor/services/rag/pipelines/llamaindex/retrievers.py
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('BM25');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BM25Document {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface BM25Result {
  id: string;
  score: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface BM25Index {
  /** Average document length (in tokens) */
  avgDocLen: number;
  /** Total number of documents */
  docCount: number;
  /** Document frequency: how many docs contain each term */
  docFreq: Map<string, number>;
  /** Per-document token frequencies */
  docTermFreqs: Map<string, Map<string, number>>;
  /** Document lengths (in tokens) */
  docLengths: Map<string, number>;
  /** Document content lookup */
  docContents: Map<string, { content: string; metadata: Record<string, unknown> }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const K1 = 1.2;
const B = 0.75;

// Common stop words to skip during indexing (English + Chinese particles)
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
  'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom',
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
  '会', '着', '没有', '看', '好', '自己', '这',
]);

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize text into lowercase terms.
 * Supports mixed CJK and Latin text.
 * - Latin words are split on non-alphanumeric boundaries
 * - CJK characters are emitted as individual unigrams
 * - Stop words are removed
 * - Terms shorter than 2 characters are skipped (except CJK)
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // Split CJK characters individually
  const cjkPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
  const cjkChars = text.match(cjkPattern);
  if (cjkChars) {
    for (const ch of cjkChars) {
      if (!STOP_WORDS.has(ch)) {
        tokens.push(ch);
      }
    }
  }

  // Extract Latin/word tokens
  const wordPattern = /[a-zA-Z0-9]+(?:'[a-zA-Z]+)?/g;
  const words = text.match(wordPattern);
  if (words) {
    for (const word of words) {
      const lower = word.toLowerCase();
      if (lower.length >= 2 && !STOP_WORDS.has(lower)) {
        tokens.push(lower);
      }
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Index Builder
// ---------------------------------------------------------------------------

/**
 * Build a BM25 index from a set of documents.
 */
export function buildBM25Index(docs: BM25Document[]): BM25Index {
  const docFreq = new Map<string, number>();
  const docTermFreqs = new Map<string, Map<string, number>>();
  const docLengths = new Map<string, number>();
  const docContents = new Map<string, { content: string; metadata: Record<string, unknown> }>();

  let totalLen = 0;

  for (const doc of docs) {
    const terms = tokenize(doc.content);
    docLengths.set(doc.id, terms.length);
    docContents.set(doc.id, { content: doc.content, metadata: doc.metadata });
    totalLen += terms.length;

    // Term frequency within this document
    const tf = new Map<string, number>();
    for (const term of terms) {
      tf.set(term, (tf.get(term) ?? 0) + 1);
    }
    docTermFreqs.set(doc.id, tf);

    // Document frequency (unique terms per doc)
    const uniqueTerms = new Set(terms);
    for (const term of uniqueTerms) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const avgDocLen = docs.length > 0 ? totalLen / docs.length : 0;

  log.debug(`Built BM25 index: ${docs.length} docs, ${docFreq.size} unique terms, avgLen=${avgDocLen.toFixed(1)}`);

  return {
    avgDocLen,
    docCount: docs.length,
    docFreq,
    docTermFreqs,
    docLengths,
    docContents,
  };
}

// ---------------------------------------------------------------------------
// BM25 Scorer
// ---------------------------------------------------------------------------

/**
 * Compute BM25 score for a query against the index.
 * Returns results sorted by score descending.
 */
export function bm25Search(
  index: BM25Index,
  query: string,
  topK: number = 10,
): BM25Result[] {
  const queryTerms = tokenize(query);

  if (queryTerms.length === 0 || index.docCount === 0) {
    return [];
  }

  const scores = new Map<string, number>();

  for (const term of queryTerms) {
    const df = index.docFreq.get(term) ?? 0;
    if (df === 0) continue;

    // IDF component: log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = Math.log((index.docCount - df + 0.5) / (df + 0.5) + 1);

    // Score each document that contains this term
    for (const [docId, termFreqs] of index.docTermFreqs) {
      const tf = termFreqs.get(term) ?? 0;
      if (tf === 0) continue;

      const docLen = index.docLengths.get(docId) ?? 0;
      const lenNorm = 1 - B + B * (docLen / index.avgDocLen);

      // BM25 term score: IDF * (tf * (k1 + 1)) / (tf + k1 * lenNorm)
      const termScore = idf * (tf * (K1 + 1)) / (tf + K1 * lenNorm);

      scores.set(docId, (scores.get(docId) ?? 0) + termScore);
    }
  }

  // Convert to sorted results
  const results: BM25Result[] = [];
  for (const [docId, score] of scores) {
    const docInfo = index.docContents.get(docId);
    if (docInfo) {
      results.push({
        id: docId,
        score,
        content: docInfo.content,
        metadata: docInfo.metadata,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// ---------------------------------------------------------------------------
// BM25 Retriever Class
// ---------------------------------------------------------------------------

export class BM25Scorer {
  private index: BM25Index | null = null;
  private indexVersion: string = '';

  /**
   * Build or rebuild the index from documents.
   */
  buildIndex(docs: BM25Document[], version?: string): void {
    this.index = buildBM25Index(docs);
    this.indexVersion = version ?? `v${Date.now()}`;
    log.info(`BM25 index built: ${docs.length} docs, version=${this.indexVersion}`);
  }

  /**
   * Search the index.
   */
  search(query: string, topK: number = 10): BM25Result[] {
    if (!this.index) {
      log.warn('BM25 search called before index was built');
      return [];
    }
    return bm25Search(this.index, query, topK);
  }

  /**
   * Check if index is ready.
   */
  get isReady(): boolean {
    return this.index !== null && this.index.docCount > 0;
  }

  /**
   * Get current index version.
   */
  get version(): string {
    return this.indexVersion;
  }

  /**
   * Get document count in index.
   */
  get docCount(): number {
    return this.index?.docCount ?? 0;
  }
}
