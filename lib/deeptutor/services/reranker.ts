/**
 * RerankerService — Lightweight cross-encoder style reranking
 *
 * Combines vector similarity with keyword overlap scoring to produce
 * a more accurate relevance ranking than cosine distance alone.
 *
 * Strategy:
 * 1. Take candidates from vector search (pre-filtered by minScore)
 * 2. Compute keyword overlap score (term frequency based)
 * 3. Combine: final_score = vectorWeight * vectorScore + keywordWeight * keywordScore
 * 4. Re-sort by combined score and return topK
 *
 * No external API dependency — uses pure JS scoring.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('RerankerService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RerankCandidate {
  chunkId: string;
  content: string;
  score: number; // Original vector similarity score (0-1)
  metadata: Record<string, unknown>;
}

export interface RerankResult extends RerankCandidate {
  keywordScore: number;
  combinedScore: number;
}

export interface RerankerOptions {
  /** Weight for vector similarity score (default: 0.6) */
  vectorWeight?: number;
  /** Weight for keyword score (default: 0.4) */
  keywordWeight?: number;
}

// ---------------------------------------------------------------------------
// RerankerService
// ---------------------------------------------------------------------------

export class RerankerServiceImpl {
  /**
   * Rerank candidates using combined vector + keyword scoring.
   *
   * @param query       — The original search query
   * @param candidates  — Pre-retrieved candidates from vector search
   * @param topK        — Number of results to return after reranking
   * @param options     — Scoring weights
   */
  rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number,
    options: RerankerOptions = {},
  ): RerankResult[] {
    if (candidates.length === 0) return [];

    const vectorWeight = options.vectorWeight ?? 0.6;
    const keywordWeight = options.keywordWeight ?? 0.4;

    // Tokenize query for keyword scoring
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      // No meaningful tokens — fall back to vector score only
      return candidates
        .map((c) => ({ ...c, keywordScore: 0, combinedScore: c.score }))
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, topK);
    }

    // Score each candidate
    const results: RerankResult[] = candidates.map((candidate) => {
      const keywordScore = computeKeywordScore(queryTokens, candidate.content);
      const combinedScore = vectorWeight * candidate.score + keywordWeight * keywordScore;

      return {
        ...candidate,
        keywordScore,
        combinedScore,
      };
    });

    // Sort by combined score descending
    results.sort((a, b) => b.combinedScore - a.combinedScore);

    log.debug(
      `Reranked ${candidates.length} candidates → top ${Math.min(topK, results.length)} (query: "${query.slice(0, 40)}...")`,
    );

    return results.slice(0, topK);
  }
}

// ---------------------------------------------------------------------------
// Tokenization and Scoring
// ---------------------------------------------------------------------------

/** Common English/Chinese stop words to exclude from scoring */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them',
  'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
  '会', '着', '没有', '看', '好', '自己', '这',
]);

/**
 * Tokenize a string into lowercase terms, filtering stop words and short tokens.
 * Handles both English (space-separated) and Chinese (character-bigram) text.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const normalized = text.toLowerCase().trim();

  // English tokens (space-separated)
  const words = normalized.split(/[\s,.;:!?()[\]{}"'`/\\|@#$%^&*+=<>~]+/).filter(Boolean);
  for (const word of words) {
    if (word.length >= 2 && !STOP_WORDS.has(word)) {
      tokens.push(word);
    }
  }

  // Chinese character bigrams (for CJK text)
  const cjkChars = normalized.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  if (cjkChars && cjkChars.length >= 2) {
    for (let i = 0; i < cjkChars.length - 1; i++) {
      const bigram = cjkChars[i] + cjkChars[i + 1];
      if (!STOP_WORDS.has(bigram)) {
        tokens.push(bigram);
      }
    }
  }

  return tokens;
}

/**
 * Compute keyword relevance score between query tokens and document content.
 * Uses a simplified TF-based approach:
 * - Count how many query tokens appear in the document
 * - Weight by token frequency in document (diminishing returns)
 * - Normalize to 0-1 range
 */
function computeKeywordScore(queryTokens: string[], content: string): number {
  const lowerContent = content.toLowerCase();
  let matchedTokens = 0;
  let totalScore = 0;

  for (const token of queryTokens) {
    // Count occurrences in content
    let count = 0;
    let pos = lowerContent.indexOf(token);
    while (pos !== -1 && count < 10) {
      count++;
      pos = lowerContent.indexOf(token, pos + 1);
    }

    if (count > 0) {
      matchedTokens++;
      // Diminishing returns: sqrt(count) / sqrt(max_expected_count)
      totalScore += Math.sqrt(count) / Math.sqrt(10);
    }
  }

  if (matchedTokens === 0) return 0;

  // Normalize: coverage (what fraction of query tokens matched) * average TF score
  const coverage = matchedTokens / queryTokens.length;
  const avgTF = totalScore / queryTokens.length;

  return Math.min(1, coverage * 0.7 + avgTF * 0.3);
}
