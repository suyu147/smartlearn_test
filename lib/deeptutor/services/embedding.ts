/**
 * EmbeddingService — OpenAI-compatible embedding API client
 *
 * Supports any OpenAI-compatible embedding endpoint:
 * - OpenAI (text-embedding-3-small/large)
 * - Azure OpenAI
 * - SiliconFlow
 * - Jina
 * - Ollama (local)
 *
 * Phase 2b: basic embedding with batch processing and validation.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('EmbeddingService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmbeddingConfig {
  /** Embedding model ID (e.g., "text-embedding-3-small") */
  model: string;
  /** API key for the embedding provider */
  apiKey: string;
  /** Base URL for the embedding endpoint */
  baseUrl: string;
  /** Optional dimensions parameter (for models that support variable dims) */
  dimensions?: number;
  /** Batch size for embedding calls (default: 10) */
  batchSize?: number;
  /** Delay between batches in ms (default: 0) */
  batchDelay?: number;
  /** Request timeout in ms (default: 60000) */
  timeout?: number;
  /** Max retries on transient errors (default: 2) */
  maxRetries?: number;
}

export interface EmbeddingResult {
  /** The embedding vectors, one per input text */
  embeddings: number[][];
  /** Total token usage across all batches */
  totalTokens: number;
  /** The model that was used */
  model: string;
}

export type ProgressCallback = (batchIndex: number, totalBatches: number) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 2000, 4000]; // ms

// ---------------------------------------------------------------------------
// EmbeddingService
// ---------------------------------------------------------------------------

export class EmbeddingServiceImpl {
  private config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  /**
   * Embed an array of texts, returning one vector per text.
   * Automatically batches according to config.batchSize.
   */
  async embed(
    texts: string[],
    progressCallback?: ProgressCallback,
  ): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokens: 0, model: this.config.model };
    }

    const batchSize = this.config.batchSize ?? DEFAULT_BATCH_SIZE;
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < batches.length; i++) {
      const result = await this.embedBatch(batches[i]);
      allEmbeddings.push(...result.embeddings);
      totalTokens += result.tokens;

      if (progressCallback) {
        progressCallback(i + 1, batches.length);
      }

      // Delay between batches if configured
      if (this.config.batchDelay && i < batches.length - 1) {
        await sleep(this.config.batchDelay);
      }
    }

    // Validate results
    validateEmbeddingResults(allEmbeddings, texts.length);

    return {
      embeddings: allEmbeddings,
      totalTokens,
      model: this.config.model,
    };
  }

  /**
   * Embed a single text. Convenience wrapper around embed().
   */
  async embedOne(text: string): Promise<number[]> {
    const result = await this.embed([text]);
    return result.embeddings[0];
  }

  /**
   * Test connectivity by embedding a short string.
   * Throws on failure.
   */
  async testConnectivity(): Promise<void> {
    await this.embedOne('connectivity test');
    log.info('Embedding connectivity test passed');
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async embedBatch(
    texts: string[],
  ): Promise<{ embeddings: number[][]; tokens: number }> {
    const { model, apiKey, baseUrl, dimensions, timeout, maxRetries } = this.config;

    const body: Record<string, unknown> = {
      input: texts,
      model,
    };
    if (dimensions) {
      body.dimensions = dimensions;
    }

    const url = baseUrl.endsWith('/') ? `${baseUrl}embeddings` : `${baseUrl}/embeddings`;

    let lastError: Error | null = null;
    const retries = maxRetries ?? DEFAULT_MAX_RETRIES;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout ?? DEFAULT_TIMEOUT);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown');
          throw new EmbeddingError(
            `Embedding API returned ${response.status}: ${errorText}`,
            response.status,
          );
        }

        const json = await response.json();
        return parseEmbeddingResponse(json, texts.length);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err instanceof EmbeddingError && err.statusCode >= 400 && err.statusCode < 500) {
          // Client error — don't retry
          throw err;
        }

        if (attempt < retries) {
          const delay = RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
          log.warn(`Embedding attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Embedding failed after all retries');
  }
}

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

function parseEmbeddingResponse(
  json: unknown,
  expectedCount: number,
): { embeddings: number[][]; tokens: number } {
  if (!json || typeof json !== 'object') {
    throw new EmbeddingError('Invalid embedding response: not an object');
  }

  const obj = json as Record<string, unknown>;

  // Parse data array
  const data = obj.data;
  if (!Array.isArray(data)) {
    throw new EmbeddingError('Invalid embedding response: missing data array');
  }

  // Sort by index to maintain input order
  const sorted = [...data].sort((a: unknown, b: unknown) => {
    const aIdx = (a as Record<string, unknown>).index as number ?? 0;
    const bIdx = (b as Record<string, unknown>).index as number ?? 0;
    return aIdx - bIdx;
  });

  const embeddings: number[][] = sorted.map((item: unknown) => {
    const entry = item as Record<string, unknown>;
    const embedding = entry.embedding;
    if (!Array.isArray(embedding)) {
      throw new EmbeddingError('Invalid embedding response: item missing embedding array');
    }
    return embedding as number[];
  });

  // Parse usage
  const usage = obj.usage as Record<string, unknown> | undefined;
  const tokens = (usage?.total_tokens as number) ?? 0;

  return { embeddings, tokens };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateEmbeddingResults(embeddings: number[][], expectedCount: number): void {
  if (embeddings.length !== expectedCount) {
    throw new EmbeddingError(
      `Expected ${expectedCount} embeddings, got ${embeddings.length}`,
    );
  }

  if (embeddings.length === 0) return;

  const dim = embeddings[0].length;
  if (dim === 0) {
    throw new EmbeddingError('Embedding vectors have zero dimensions');
  }

  for (let i = 0; i < embeddings.length; i++) {
    const vec = embeddings[i];
    if (vec.length !== dim) {
      throw new EmbeddingError(
        `Inconsistent embedding dimensions: expected ${dim}, got ${vec.length} at index ${i}`,
      );
    }
    for (let j = 0; j < vec.length; j++) {
      const val = vec[j];
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new EmbeddingError(
          `Invalid embedding value at [${i}][${j}]: ${val} (not a finite number)`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class EmbeddingError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 0) {
    super(message);
    this.name = 'EmbeddingError';
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an EmbeddingServiceImpl from environment variables.
 *
 * Env vars:
 *   DT_EMBEDDING_PROVIDER — provider ID (default: "openai")
 *   DT_EMBEDDING_MODEL   — model ID (default: "text-embedding-3-small")
 *   DT_EMBEDDING_API_KEY — API key (falls back to OPENAI_API_KEY)
 *   DT_EMBEDDING_BASE_URL — base URL (default: "https://api.openai.com/v1")
 *   DT_EMBEDDING_DIMENSIONS — optional dimension override
 */
export function createEmbeddingService(): EmbeddingServiceImpl {
  const provider = process.env.DT_EMBEDDING_PROVIDER ?? 'openai';
  const model = process.env.DT_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const apiKey = process.env.DT_EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? '';

  const PROVIDER_DEFAULTS: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    siliconflow: 'https://api.siliconflow.cn/v1',
    jina: 'https://api.jina.ai/v1',
    ollama: 'http://localhost:11434/v1',
  };

  const baseUrl = process.env.DT_EMBEDDING_BASE_URL
    ?? PROVIDER_DEFAULTS[provider]
    ?? 'https://api.openai.com/v1';

  const dimensions = process.env.DT_EMBEDDING_DIMENSIONS
    ? parseInt(process.env.DT_EMBEDDING_DIMENSIONS, 10)
    : undefined;

  if (!apiKey) {
    log.warn('No API key configured for embedding service — set DT_EMBEDDING_API_KEY or OPENAI_API_KEY');
  }

  return new EmbeddingServiceImpl({
    model,
    apiKey,
    baseUrl,
    dimensions,
    batchSize: DEFAULT_BATCH_SIZE,
  });
}

// Re-export the interface for backward compatibility
export interface EmbeddingService {
  embed(texts: string[], model?: string): Promise<number[][]>;
}
