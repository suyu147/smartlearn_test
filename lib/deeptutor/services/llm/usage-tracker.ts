/**
 * UsageTracker - LLM Token Usage Tracking
 *
 * Tracks token usage across LLM calls within a turn.
 * Based on DeepTutor's token tracking patterns, adapted for Vercel AI SDK v5.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('UsageTracker');

export interface UsageRecord {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
}

/**
 * Response shape from Vercel AI SDK v5 generateText/streamText.
 * Handles both camelCase (AI SDK native) and snake_case (some providers).
 */
interface AIResponseUsage {
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    // snake_case variants from some providers
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  modelId?: string;
}

export class UsageTracker {
  private records: UsageRecord[] = [];

  /**
   * Record usage from a Vercel AI SDK response object.
   * Handles both camelCase and snake_case token fields.
   */
  recordFromResponse(response: AIResponseUsage, provider: string): void {
    const usage = response.usage;
    if (!usage) {
      log.debug('No usage data in response');
      return;
    }

    const promptTokens = usage.promptTokens ?? usage.prompt_tokens ?? 0;
    const completionTokens = usage.completionTokens ?? usage.completion_tokens ?? 0;
    const totalTokens = usage.totalTokens ?? usage.total_tokens ?? (promptTokens + completionTokens);

    const model = response.modelId ?? response.model ?? 'unknown';

    const record: UsageRecord = {
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      timestamp: Date.now(),
    };

    this.record(record);
  }

  /**
   * Record usage manually.
   */
  record(usage: UsageRecord): void {
    this.records.push(usage);
    log.debug(
      `Recorded usage: ${usage.provider}/${usage.model} - ` +
        `prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens}`,
    );
  }

  /**
   * Get accumulated totals across all recorded calls.
   */
  getTotals(): { promptTokens: number; completionTokens: number; totalTokens: number } {
    return this.records.reduce(
      (acc, r) => ({
        promptTokens: acc.promptTokens + r.promptTokens,
        completionTokens: acc.completionTokens + r.completionTokens,
        totalTokens: acc.totalTokens + r.totalTokens,
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    );
  }

  /**
   * Get all recorded usage entries.
   */
  getRecords(): UsageRecord[] {
    return [...this.records];
  }

  /**
   * Reset tracker, clearing all recorded usage.
   */
  reset(): void {
    this.records = [];
    log.debug('Usage tracker reset');
  }
}
