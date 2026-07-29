/**
 * TrafficController - Dual-Layer Rate Limiting
 *
 * Based on DeepTutor's dual-layer protection:
 * - Semaphore: limits concurrent in-flight requests
 * - TokenBucket: smooths request rate over time
 *
 * Both layers must grant before a request proceeds.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('TrafficController');

// ---------------------------------------------------------------------------
// Semaphore - counter-based concurrency limiter with async wait queue
// ---------------------------------------------------------------------------

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  /**
   * Acquire a semaphore slot. Resolves immediately if under the limit,
   * otherwise queues until a slot is released.
   *
   * @param timeout - Max ms to wait before throwing. 0 = no timeout.
   */
  acquire(timeout: number): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const onGrant = () => {
        if (timer) clearTimeout(timer);
        this.active++;
        resolve();
      };

      if (timeout > 0) {
        timer = setTimeout(() => {
          // Remove from queue
          const idx = this.queue.indexOf(onGrant);
          if (idx !== -1) this.queue.splice(idx, 1);
          reject(new Error(`Semaphore acquisition timed out after ${timeout}ms`));
        }, timeout);
      }

      this.queue.push(onGrant);
    });
  }

  /**
   * Release a semaphore slot, granting the next waiter if any.
   */
  release(): void {
    if (this.active > 0) {
      this.active--;
    }

    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  get currentActive(): number {
    return this.active;
  }

  get maxConcurrency(): number {
    return this.maxConcurrent;
  }
}

// ---------------------------------------------------------------------------
// TokenBucket - smooth rate limiter
// ---------------------------------------------------------------------------

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly refillRate: number; // tokens per millisecond
  private readonly maxTokens: number;

  /**
   * @param requestsPerMinute - Maximum requests per minute
   */
  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.refillRate = requestsPerMinute / 60_000; // tokens/ms
    this.tokens = requestsPerMinute; // start full
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume one token. Returns true if successful, false if bucket empty.
   */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Wait until a token is available, then consume it.
   *
   * @param timeout - Max ms to wait before throwing.
   */
  async consume(timeout: number): Promise<void> {
    if (this.tryConsume()) return;

    // Calculate wait time for next token
    const msPerToken = 1 / this.refillRate;
    const waitTime = Math.min(msPerToken, timeout);

    if (waitTime > timeout) {
      throw new Error(`Token bucket acquisition timed out after ${timeout}ms`);
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.tryConsume()) {
          resolve();
        } else {
          // Refill happened but another consumer took the token; retry
          this.consume(Math.max(0, timeout - waitTime)).then(resolve, reject);
        }
      }, Math.ceil(waitTime));
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  get remaining(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// ---------------------------------------------------------------------------
// TrafficController - composes Semaphore + TokenBucket
// ---------------------------------------------------------------------------

export interface TrafficControllerConfig {
  providerName: string;
  maxConcurrency: number;      // default 20
  requestsPerMinute: number;   // default 600
  acquisitionTimeout: number;  // default 30000ms
}

const DEFAULT_CONFIG: Omit<TrafficControllerConfig, 'providerName'> = {
  maxConcurrency: 20,
  requestsPerMinute: 600,
  acquisitionTimeout: 30_000,
};

export class TrafficController {
  private readonly semaphore: Semaphore;
  private readonly tokenBucket: TokenBucket;
  private readonly config: TrafficControllerConfig;

  constructor(config: Partial<TrafficControllerConfig> & { providerName: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.semaphore = new Semaphore(this.config.maxConcurrency);
    this.tokenBucket = new TokenBucket(this.config.requestsPerMinute);

    log.info(
      `TrafficController for ${this.config.providerName}: ` +
        `maxConcurrency=${this.config.maxConcurrency}, ` +
        `rpm=${this.config.requestsPerMinute}, ` +
        `timeout=${this.config.acquisitionTimeout}ms`,
    );
  }

  /**
   * Acquire both semaphore slot and rate-limit token.
   * Throws on timeout.
   */
  async acquire(): Promise<void> {
    // Acquire semaphore first (concurrency limit)
    await this.semaphore.acquire(this.config.acquisitionTimeout);

    try {
      // Then acquire rate-limit token
      await this.tokenBucket.consume(this.config.acquisitionTimeout);
    } catch (err) {
      // Release the semaphore if token bucket fails
      this.semaphore.release();
      throw err;
    }
  }

  /**
   * Release the semaphore slot after the request completes.
   * Must be called exactly once per successful acquire().
   */
  release(): void {
    this.semaphore.release();
  }

  /**
   * Current controller stats.
   */
  get stats(): { active: number; maxConcurrency: number; tokensRemaining: number } {
    return {
      active: this.semaphore.currentActive,
      maxConcurrency: this.semaphore.maxConcurrency,
      tokensRemaining: this.tokenBucket.remaining,
    };
  }
}
