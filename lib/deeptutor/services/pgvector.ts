/**
 * pgvector helpers — Convert between TypeScript number[] and PostgreSQL vector format.
 *
 * Used by knowledge.ts (write) and rag.ts (read/search) for native pgvector operations.
 */

/**
 * Convert a number[] embedding to pgvector string format: "[0.1,0.2,0.3]".
 * This is the format PostgreSQL's vector type expects for INSERT/UPDATE.
 */
export function toVectorString(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Parse a pgvector result string "[0.1,0.2,0.3]" back to number[].
 * Used when reading vector columns via $queryRaw.
 */
export function fromVectorString(vec: string): number[] {
  if (!vec || vec === '[]') return [];
  // Remove brackets and split
  const inner = vec.slice(1, -1);
  return inner.split(',').map(Number);
}
