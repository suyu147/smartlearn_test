/**
 * registerSimpleTools — Batch-register all 5 simple tools into a ToolRegistry
 *
 * Convenience helper used during agent bootstrap to mount the built-in tool set
 * without requiring individual imports at every call site.
 */

import { ToolRegistry } from './registry';
import { BrainstormTool } from './brainstorm';
import type { LLMCallFn } from './brainstorm';
import { ReasonTool } from './reason';
import { WebFetchTool } from './web-fetch';
import { AskUserTool } from './ask-user';
import { WebSearchTool } from './web-search';

export interface RegisterSimpleToolsOptions {
  /**
   * Optional LLM call function injected into tools that need LLM access
   * (brainstorm, reason). If omitted, those tools return a placeholder message.
   */
  llmCall?: LLMCallFn;
}

/**
 * Register all 5 simple tools into the given ToolRegistry.
 *
 * Tools registered:
 * - brainstorm (LLM-backed)
 * - reason     (LLM-backed)
 * - web_fetch  (no LLM needed)
 * - ask_user   (no LLM needed)
 * - web_search (Tavily + Brave + DuckDuckGo with fallback)
 */
export function registerSimpleTools(
  registry: ToolRegistry,
  options?: RegisterSimpleToolsOptions,
): void {
  const llmCall = options?.llmCall;

  registry.register(new BrainstormTool(llmCall));
  registry.register(new ReasonTool(llmCall));
  registry.register(new WebFetchTool());
  registry.register(new AskUserTool());
  registry.register(new WebSearchTool());
}

// Re-export individual tools for direct use
export { BrainstormTool, ReasonTool, WebFetchTool, AskUserTool, WebSearchTool };
export type { LLMCallFn };
