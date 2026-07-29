/**
 * Think Filter — Strip thinking/reasoning tags from LLM output.
 *
 * Based on DeepTutor's clean_thinking_tags() in services/llm/utils.py.
 * Some reasoning models (DeepSeek-R1, QwQ, etc.) wrap their internal
 * chain-of-thought in <think>…</think> or <thinking>…</thinking> tags.
 * These should be removed before presenting the response to the user.
 */

/**
 * Remove thinking/reasoning tags from model output.
 *
 * Three-pass regex strategy:
 * 1. Closed tags: `<think>…</think>` (with optional backtick wrapping)
 * 2. Unclosed tags: `<think>…$` (trailing partial at end of stream)
 * 3. Orphan close tags: stray `</think>` or `</thinking>`
 */
export function cleanThinkingTags(content: string): string {
  return content
    // Pass 1: Closed <think>…</think> and <thinking>…</thinking>
    .replace(/`?<think[^>]*>`?[\s\S]*?`?<\/think>`?/gi, '')
    .replace(/`?<thinking[^>]*>`?[\s\S]*?`?<\/thinking>`?/gi, '')
    // Pass 2: Unclosed — <think>…$ (streaming may cut off before close tag)
    .replace(/`?<think[^>]*>`?[\s\S]*$/gi, '')
    .replace(/`?<thinking[^>]*>`?[\s\S]*$/gi, '')
    // Pass 3: Orphan close tags
    .replace(/`?<\/think>`?/gi, '')
    .replace(/`?<\/thinking>`?/gi, '')
    .trim();
}
