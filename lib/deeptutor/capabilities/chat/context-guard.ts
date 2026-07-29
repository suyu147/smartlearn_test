/**
 * Context Window Guard — Protect against context overflow.
 *
 * Two strategies:
 * 1. guardContextWindow: snip oldest tool results when near budget
 * 2. truncateHistory: drop older messages to fit within a token budget
 *
 * Based on DeepTutor's context_window_guard.py.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, ToolMessage } from '@langchain/core/messages';

const CONTEXT_WINDOW_GUARD_RATIO = 0.9;

const SNIP_MARKER =
  '[earlier tool result snipped to stay within context window — call the same tool again if the content is still needed]';

/** Rough token estimate: ~4 chars per token */
function estimateTokens(messages: BaseMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
    total += Math.ceil(content.length / 4);
  }
  return total;
}

/**
 * Check whether a message is a tool result (ToolMessage or
 * AIMessage carrying a tool result in additional_kwargs).
 */
function isToolResultMessage(msg: BaseMessage): boolean {
  // LangChain ToolMessage has _getType() returning 'tool'
  if (typeof (msg as { _getType?: () => string })._getType === 'function') {
    const msgType = (msg as { _getType: () => string })._getType();
    if (msgType === 'tool') return true;
  }

  // Fallback: check constructor name
  if (msg.constructor.name === 'ToolMessage') return true;

  // Heuristic: named message with large string content
  if (
    msg.additional_kwargs?.name &&
    typeof msg.content === 'string' &&
    msg.content.length > 200
  ) {
    return true;
  }

  return false;
}

/**
 * Guard context window: if messages exceed 90% of budget, snip oldest
 * tool results first. Returns the (possibly modified) messages array.
 * The original array is never mutated.
 */
export function guardContextWindow(
  messages: BaseMessage[],
  contextWindowTokens: number,
): BaseMessage[] {
  const budget = Math.floor(contextWindowTokens * CONTEXT_WINDOW_GUARD_RATIO);
  const estimated = estimateTokens(messages);

  if (estimated <= budget) return messages;

  // Shallow-copy so we don't mutate the caller's array
  const result = [...messages];

  // Snip oldest tool messages first (skip index 0 which is typically the system message)
  for (let i = 1; i < result.length; i++) {
    const msg = result[i];
    if (isToolResultMessage(msg)) {
      // Replace content with snip marker, preserving message structure
      result[i] = Object.create(Object.getPrototypeOf(msg));
      Object.assign(result[i], msg);
      (result[i] as { content: string }).content = SNIP_MARKER;

      if (estimateTokens(result) <= budget) break;
    }
  }

  return result;
}

/**
 * Truncate conversation history to fit within a token budget.
 * Keeps the system message (index 0) and the most recent messages,
 * dropping older ones from the middle.
 */
export function truncateHistory(
  messages: BaseMessage[],
  maxTokens: number,
): BaseMessage[] {
  if (messages.length <= 2) return messages;

  const systemMsg = messages[0]; // assume first is system
  const rest = messages.slice(1);

  // Keep adding from the end (most recent) until budget exhausted
  const kept: BaseMessage[] = [];
  let usedTokens = estimateTokens([systemMsg]);

  for (let i = rest.length - 1; i >= 0; i--) {
    const msg = rest[i];
    const text = typeof msg.content === 'string' ? msg.content : '';
    const msgTokens = Math.ceil(text.length / 4);
    if (usedTokens + msgTokens > maxTokens) break;
    kept.unshift(msg);
    usedTokens += msgTokens;
  }

  // Post-process: remove orphaned ToolMessages that have no preceding
  // AIMessage with tool_calls (AI SDK v5 requires role:'tool' to be
  // preceded by an assistant with toolCalls).
  const clean: BaseMessage[] = [];
  for (const msg of kept) {
    if (msg instanceof ToolMessage) {
      const prev = clean[clean.length - 1];
      const hasToolCalls =
        prev instanceof AIMessage &&
        ((prev.tool_calls && prev.tool_calls.length > 0) ||
          (prev.additional_kwargs?.tool_calls &&
            Array.isArray(prev.additional_kwargs.tool_calls) &&
            prev.additional_kwargs.tool_calls.length > 0));
      if (!hasToolCalls) {
        continue; // skip orphaned ToolMessage
      }
    }
    clean.push(msg);
  }

  return [systemMsg, ...clean];
}
