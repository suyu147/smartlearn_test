/**
 * LLM Service — Adapter for SmartLearn's callLLM/streamLLM
 * Phase 1: Adapt SmartLearn's LLM layer, add UsageTracker + TrafficController
 */

export interface LLMService {
  // TODO: Phase 1 implementation
  /** Call LLM with thinking support */
  call(params: Record<string, unknown>): Promise<string>;
  /** Stream LLM response */
  stream(params: Record<string, unknown>): AsyncIterable<string>;
}
