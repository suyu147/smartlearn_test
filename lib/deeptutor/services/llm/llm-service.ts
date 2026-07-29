/**
 * LLM Service - Bridge between DeepTutor's LLM patterns and SmartLearn's callLLM/streamLLM
 *
 * Wraps the existing AI layer with:
 * - TrafficController acquire/release for dual-layer rate limiting
 * - UsageTracker recording for token usage tracking
 * - Unified model resolution via getModel()
 */

import { createLogger } from '@/lib/logger';
import { getModel, PROVIDERS } from '@/lib/ai/providers';
import { callLLM, streamLLM } from '@/lib/ai/llm';
import type { ProviderId, ModelInfo } from '@/lib/types/provider';
import { UsageTracker, type UsageRecord } from './usage-tracker';
import { TrafficController } from './traffic-controller';

const log = createLogger('LLMService');

export interface LLMCallOptions {
  providerId: string;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  usageTracker?: UsageTracker;
  trafficController?: TrafficController;
}

/** Result from a non-streaming LLM call */
export interface LLMCompleteResult {
  text: string;
  usage: UsageRecord;
}

/** Chunk yielded from a streaming LLM call */
export interface LLMStreamChunk {
  delta: string;
  done: boolean;
  usage?: UsageRecord;
}

export class LLMService {
  /**
   * Non-streaming LLM call with usage tracking and traffic control.
   */
  async complete(options: LLMCallOptions): Promise<LLMCompleteResult> {
    const { providerId, modelId, apiKey, baseUrl, messages, tools, temperature, maxTokens } = options;
    const { usageTracker, trafficController } = options;

    // Acquire traffic controller slot
    if (trafficController) {
      await trafficController.acquire();
    }

    try {
      // Resolve model instance via existing provider layer
      const { model } = getModel({
        providerId: providerId as ProviderId,
        modelId,
        apiKey,
        baseUrl,
      });

      // Build AI SDK params
      const params: Record<string, unknown> = {
        model,
        messages,
      };

      if (tools) params.tools = tools;
      if (temperature !== undefined) params.temperature = temperature;
      if (maxTokens !== undefined) params.maxOutputTokens = maxTokens;

      const source = `deeptutor:${providerId}/${modelId}`;
      const result = await callLLM(params as Parameters<typeof callLLM>[0], source);

      // Extract usage from AI SDK v5 result.
      // AI SDK v5 uses inputTokens/outputTokens; we map to promptTokens/completionTokens.
      const usage = result.usage;
      const promptTokens = usage?.inputTokens ?? 0;
      const completionTokens = usage?.outputTokens ?? 0;
      const totalTokens = usage?.totalTokens ?? (promptTokens + completionTokens);

      const usageRecord: UsageRecord = {
        provider: providerId,
        model: modelId,
        promptTokens,
        completionTokens,
        totalTokens,
        timestamp: Date.now(),
      };

      if (usageTracker) {
        usageTracker.record(usageRecord);
      }

      log.debug(`Complete: ${providerId}/${modelId} - ${totalTokens} tokens`);

      return {
        text: result.text,
        usage: usageRecord,
      };
    } finally {
      if (trafficController) {
        trafficController.release();
      }
    }
  }

  /**
   * Streaming LLM call with usage tracking and traffic control.
   * Yields chunks as they arrive, with final usage on the last chunk.
   */
  async *stream(options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    const { providerId, modelId, apiKey, baseUrl, messages, tools, temperature, maxTokens } = options;
    const { usageTracker, trafficController } = options;

    // Acquire traffic controller slot
    if (trafficController) {
      await trafficController.acquire();
    }

    try {
      // Resolve model instance
      const { model } = getModel({
        providerId: providerId as ProviderId,
        modelId,
        apiKey,
        baseUrl,
      });

      // Build AI SDK params
      const params: Record<string, unknown> = {
        model,
        messages,
      };

      if (tools) params.tools = tools;
      if (temperature !== undefined) params.temperature = temperature;
      if (maxTokens !== undefined) params.maxOutputTokens = maxTokens;

      const source = `deeptutor:${providerId}/${modelId}`;
      const result = streamLLM(params as Parameters<typeof streamLLM>[0], source);

      // Stream text deltas
      let accumulatedText = '';
      for await (const chunk of result.textStream) {
        accumulatedText += chunk;
        yield { delta: chunk, done: false };
      }

      // After stream completes, extract usage (available as a promise on StreamTextResult)
      let usageRecord: UsageRecord | undefined;
      try {
        const usage = await result.usage;
        if (usage) {
          const promptTokens = usage.inputTokens ?? 0;
          const completionTokens = usage.outputTokens ?? 0;
          const totalTokens = usage.totalTokens ?? (promptTokens + completionTokens);

          usageRecord = {
            provider: providerId,
            model: modelId,
            promptTokens,
            completionTokens,
            totalTokens,
            timestamp: Date.now(),
          };

          if (usageTracker) {
            usageTracker.record(usageRecord);
          }

          log.debug(`Stream complete: ${providerId}/${modelId} - ${totalTokens} tokens`);
        }
      } catch (usageErr) {
        log.warn(`Failed to get usage for stream: ${usageErr}`);
      }

      yield { delta: '', done: true, usage: usageRecord };
    } finally {
      if (trafficController) {
        trafficController.release();
      }
    }
  }

  /**
   * Get available models for a provider from the built-in registry.
   */
  getModels(providerId: string): ModelInfo[] {
    const provider = PROVIDERS[providerId as ProviderId];
    if (!provider) {
      log.warn(`Unknown provider: ${providerId}`);
      return [];
    }
    return provider.models;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: LLMService | null = null;

export function getLLMService(): LLMService {
  if (!instance) {
    instance = new LLMService();
  }
  return instance;
}
