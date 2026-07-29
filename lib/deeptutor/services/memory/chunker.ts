/**
 * Chunker — Split text into bounded chunks for LLM processing.
 *
 * Splits text at paragraph boundaries (double newline), then merges
 * paragraphs back into chunks that don't exceed the character budget.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Chunk {
  index: number;    // 1-based chunk number
  text: string;     // The chunk content
  startChar: number; // Character offset in the original text
  endChar: number;   // Character offset in the original text
}

export interface ChunkBoundary {
  type: 'paragraph';
  index: number; // Paragraph index
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/** Break text at paragraph boundaries (double newline) */
function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
}

/**
 * Chunk text into pieces ≤ maxChars each.
 *
 * Strategy:
 * 1. Split at paragraph boundaries
 * 2. Greedily merge paragraphs until adding the next one would exceed maxChars
 * 3. If a single paragraph exceeds maxChars, split it at sentence boundaries
 *
 * @param text   - The full text to chunk
 * @param maxChars - Maximum characters per chunk (default 4000)
 * @returns Array of Chunk objects
 */
export function chunkWithBoundary(
  text: string,
  maxChars: number = 4000,
  boundary: ChunkBoundary = { type: 'paragraph', index: 0 },
): Chunk[] {
  void boundary; // Reserved for future use (e.g., sentence-level splitting)

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  const chunks: Chunk[] = [];
  let currentChunkParts: string[] = [];
  let currentLen = 0;
  let charOffset = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraLen = para.length + 2; // +2 for the "\n\n" separator

    // If adding this paragraph would exceed the budget, finalize current chunk
    if (currentLen + paraLen > maxChars && currentChunkParts.length > 0) {
      const chunkText = currentChunkParts.join('\n\n');
      chunks.push({
        index: chunks.length + 1,
        text: chunkText,
        startChar: charOffset - chunkText.length,
        endChar: charOffset,
      });

      currentChunkParts = [];
      currentLen = 0;
    }

    // If a single paragraph exceeds maxChars, split it at sentence boundaries
    if (para.length > maxChars) {
      const sentences = para.split(/(?<=[.!?。！？\n])\s+/);
      for (const sentence of sentences) {
        if (sentence.trim().length === 0) continue;

        if (currentLen + sentence.length > maxChars && currentChunkParts.length > 0) {
          const chunkText = currentChunkParts.join('\n\n');
          chunks.push({
            index: chunks.length + 1,
            text: chunkText,
            startChar: charOffset - chunkText.length,
            endChar: charOffset,
          });
          currentChunkParts = [];
          currentLen = 0;
        }

        currentChunkParts.push(sentence);
        currentLen += sentence.length;
        charOffset += sentence.length;
      }
    } else {
      currentChunkParts.push(para);
      currentLen += paraLen;
      charOffset += paraLen;
    }
  }

  // Finalize the last chunk
  if (currentChunkParts.length > 0) {
    const chunkText = currentChunkParts.join('\n\n');
    chunks.push({
      index: chunks.length + 1,
      text: chunkText,
      startChar: charOffset - currentChunkParts.join('\n\n').length,
      endChar: charOffset,
    });
  }

  return chunks;
}

/**
 * Convenience: render entity content as a single text block.
 * Prepends entity metadata for LLM context.
 */
export function renderTracesForConcat(
  entities: Array<{ id: string; label: string; content: string }>,
): string {
  return entities
    .map((e) => `@entity ${e.id}:${e.label}\n${e.content}`)
    .join('\n\n---\n\n');
}
