/**
 * Tool Context — AsyncLocalStorage-based request-scoped context
 *
 * Provides per-request userId / sessionId / turnId isolation for tools.
 * Replaces the unsafe pattern of module-level `_userId` variables that
 * suffer from race conditions under concurrent requests.
 *
 * Usage:
 *   // In the request handler (turns route):
 *   await runWithToolContext({ userId, sessionId, turnId }, async () => {
 *     // All tool calls within this closure read the correct userId
 *   });
 *
 *   // Inside tool execute():
 *   const userId = getCurrentUserId();
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolContext {
  userId: string;
  sessionId?: string;
  turnId?: string;
}

// ---------------------------------------------------------------------------
// AsyncLocalStorage singleton
// ---------------------------------------------------------------------------

// Edge Runtime may not have AsyncLocalStorage; fall back gracefully.
// turns route should always run on Node.js runtime, so this is defensive.
let store: AsyncLocalStorage<ToolContext> | null = null;

try {
  store = new AsyncLocalStorage<ToolContext>();
} catch {
  // Edge Runtime — should not happen for our use case
  console.warn('[ToolContext] AsyncLocalStorage not available, userId isolation disabled');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a function within a request-scoped tool context.
 * All `getCurrentUserId()` / `getToolContext()` calls inside `fn`
 * will return the values from `context`.
 */
export function runWithToolContext<T>(context: ToolContext, fn: () => T): T {
  if (!store) {
    // Fallback: just run the function without context isolation
    return fn();
  }
  return store.run(context, fn);
}

/**
 * Get the current tool context (userId, sessionId, turnId).
 * Returns undefined if called outside a `runWithToolContext` scope.
 */
export function getToolContext(): ToolContext | undefined {
  return store?.getStore();
}

/**
 * Get the current userId from the tool context.
 * Falls back to 'anonymous' if no context is set.
 */
export function getCurrentUserId(): string {
  return store?.getStore()?.userId ?? 'anonymous';
}
