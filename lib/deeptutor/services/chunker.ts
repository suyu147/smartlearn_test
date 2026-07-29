/**
 * ChunkerService — Sentence-aware text chunking
 *
 * Splits text into overlapping chunks suitable for embedding.
 * Uses sentence boundaries when possible, falling back to character splitting.
 *
 * Configuration: chunk_size=1024, overlap=200 (per acceptance criteria).
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('ChunkerService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkerConfig {
  /** Maximum characters per chunk (default: 1024) */
  chunkSize?: number;
  /** Overlap between consecutive chunks (default: 200) */
  chunkOverlap?: number;
}

export interface TextChunk {
  /** The chunk text content */
  content: string;
  /** 0-based index within the document */
  index: number;
  /** Character offset in the original text */
  startChar: number;
  /** Character end offset in the original text */
  endChar: number;
  /** Metadata attached to this chunk */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 1024;
const DEFAULT_CHUNK_OVERLAP = 200;

// Sentence-ending patterns (handles CJK, Latin, and common abbreviations)
const SENTENCE_BOUNDARIES = /(?<=[。！？.!?])\s+/;
const PARAGRAPH_BOUNDARY = /\n\s*\n/;

// ---------------------------------------------------------------------------
// ChunkerService
// ---------------------------------------------------------------------------

export class ChunkerService {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(config: ChunkerConfig = {}) {
    this.chunkSize = config.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.chunkOverlap = config.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

    if (this.chunkOverlap >= this.chunkSize) {
      throw new Error(`chunkOverlap (${this.chunkOverlap}) must be less than chunkSize (${this.chunkSize})`);
    }
  }

  /**
   * Split text into overlapping chunks.
   * Tries to respect sentence and paragraph boundaries.
   */
  chunk(text: string, baseMetadata: Record<string, unknown> = {}): TextChunk[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // If text fits in one chunk, return as-is
    if (text.length <= this.chunkSize) {
      return [{
        content: text.trim(),
        index: 0,
        startChar: 0,
        endChar: text.length,
        metadata: { ...baseMetadata, charCount: text.trim().length },
      }];
    }

    const chunks: TextChunk[] = [];
    let position = 0;
    let chunkIndex = 0;

    while (position < text.length) {
      // Determine the end of this chunk
      const targetEnd = Math.min(position + this.chunkSize, text.length);

      let actualEnd: number;

      if (targetEnd >= text.length) {
        // Last chunk — take everything remaining
        actualEnd = text.length;
      } else {
        // Try to find a good break point near targetEnd
        actualEnd = this.findBreakPoint(text, targetEnd, position);
      }

      // Extract the chunk text
      const chunkText = text.slice(position, actualEnd).trim();

      if (chunkText.length > 0) {
        chunks.push({
          content: chunkText,
          index: chunkIndex,
          startChar: position,
          endChar: actualEnd,
          metadata: {
            ...baseMetadata,
            charCount: chunkText.length,
          },
        });
        chunkIndex++;
      }

      // Move position forward, accounting for overlap
      const advance = actualEnd - position - this.chunkOverlap;
      if (advance <= 0) {
        // Prevent infinite loop: advance at least 1 character
        position = position + Math.max(1, actualEnd - position);
      } else {
        position = position + advance;
      }

      // Safety: if position hasn't moved, force forward
      if (position >= text.length) break;
    }

    log.info(`Chunked text into ${chunks.length} chunks (chunkSize=${this.chunkSize}, overlap=${this.chunkOverlap})`);
    return chunks;
  }

  /**
   * Find the best break point near the target position.
   * Priority: paragraph boundary > sentence boundary > word boundary > hard cut.
   */
  private findBreakPoint(text: string, targetEnd: number, start: number): number {
    // Search window: from (targetEnd - chunkOverlap) to targetEnd
    const searchStart = Math.max(start, targetEnd - this.chunkOverlap * 2);
    const window = text.slice(searchStart, targetEnd);

    // 1. Try paragraph boundary (double newline)
    const paraMatch = window.lastIndexOf('\n\n');
    if (paraMatch > window.length * 0.3) {
      return searchStart + paraMatch + 2; // +2 to skip the newlines
    }

    // 2. Try single newline
    const nlMatch = window.lastIndexOf('\n');
    if (nlMatch > window.length * 0.5) {
      return searchStart + nlMatch + 1;
    }

    // 3. Try sentence boundary
    const sentenceMatch = this.findLastSentenceBoundary(window);
    if (sentenceMatch > window.length * 0.3) {
      return searchStart + sentenceMatch;
    }

    // 4. Try word boundary (space)
    const spaceMatch = window.lastIndexOf(' ');
    if (spaceMatch > window.length * 0.5) {
      return searchStart + spaceMatch + 1;
    }

    // 5. Hard cut at target
    return targetEnd;
  }

  /** Find the last sentence boundary in a text window */
  private findLastSentenceBoundary(text: string): number {
    // Check for CJK and Latin sentence endings
    let lastBoundary = -1;

    for (let i = text.length - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '。' || ch === '！' || ch === '？') {
        // CJK sentence end — break after the punctuation
        lastBoundary = i + 1;
        break;
      }
      if ((ch === '.' || ch === '!' || ch === '?') && i > 0) {
        // Latin sentence end — check next char is whitespace or end
        if (i + 1 >= text.length || /\s/.test(text[i + 1])) {
          lastBoundary = i + 1;
          // Skip any trailing whitespace
          while (lastBoundary < text.length && /\s/.test(text[lastBoundary])) {
            lastBoundary++;
          }
          break;
        }
      }
    }

    return lastBoundary;
  }
}
