/**
 * Prompt Renderer — Handlebars-compatible template rendering
 *
 * Replaces Python's Jinja2 with a lightweight Handlebars-compatible engine.
 * The {{variable}} syntax is compatible between both engines.
 *
 * Supports:
 * - {{variable}} — simple substitution
 * - {{variable.property}} — nested property access
 * - {{helper variable}} — built-in helper functions
 * - {{#if condition}}...{{else}}...{{/if}} — conditional blocks
 * - {{#each list}}...{{/each}} — iteration blocks
 * - {{^variable}}...{{/variable}} — inverted sections (render when falsy)
 *
 * All block constructs support arbitrary nesting.
 */

import type { RenderOptions } from './types';

// ---------------------------------------------------------------------------
// Built-in helpers
// ---------------------------------------------------------------------------

/** Built-in helper functions */
const HELPERS: Record<string, (value: unknown, ...args: unknown[]) => string> = {
  upper: (v) => String(v ?? '').toUpperCase(),
  lower: (v) => String(v ?? '').toLowerCase(),
  json: (v) => JSON.stringify(v, null, 2),
  default: (v, fallback) => String(v ?? fallback ?? ''),
};

// ---------------------------------------------------------------------------
// Truthiness evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a value is "truthy" in the Handlebars sense:
 * - undefined / null → falsy
 * - false → falsy
 * - 0 → falsy
 * - "" (empty string) → falsy
 * - [] (empty array) → falsy
 * - Everything else → truthy
 */
function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (value === false) return false;
  if (value === 0) return false;
  if (value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Nested property resolution
// ---------------------------------------------------------------------------

/** Resolve a dot-separated property path from an object */
function resolveNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// Block-level tag matching (handles nesting)
// ---------------------------------------------------------------------------

/**
 * Find the matching close tag for a block, respecting nesting.
 *
 * @param template - The template string to search in
 * @param startIndex - The index to start searching from (after the open tag)
 * @param openPattern - Regex pattern that matches an opening tag (must not have `g` flag)
 * @param closeTag - The exact close tag string (e.g. "{{/if}}")
 * @returns The index of the start of the matching close tag, or -1 if not found
 */
function findMatchingClose(
  template: string,
  startIndex: number,
  openPattern: RegExp,
  closeTag: string,
): number {
  let depth = 1;
  let pos = startIndex;

  while (pos < template.length && depth > 0) {
    // Find the next occurrence of either an open or close tag
    const nextOpen = template.slice(pos).search(openPattern);
    const nextClose = template.indexOf(closeTag, pos);

    if (nextClose === -1) {
      // No close tag found — malformed template
      return -1;
    }

    const absoluteOpen = nextOpen === -1 ? Infinity : pos + nextOpen;

    if (absoluteOpen < nextClose) {
      // Found another opening tag before the next close — increase depth
      depth++;
      // Move past this open tag to continue searching
      const openMatch = template.slice(absoluteOpen).match(openPattern);
      pos = absoluteOpen + (openMatch ? openMatch[0].length : 1);
    } else {
      // Found a close tag
      depth--;
      if (depth === 0) {
        return nextClose;
      }
      pos = nextClose + closeTag.length;
    }
  }

  return -1;
}

/**
 * Find an `{{else}}` tag at the current nesting depth within a block body.
 * Only considers `{{else}}` that is not inside a nested block.
 *
 * @param body - The inner content of the block (between open and close tags)
 * @returns The index of `{{else}}` at depth 0, or -1 if not found
 */
function findElseAtDepth0(body: string): number {
  // Track nesting depth for #if blocks within this body
  let depth = 0;
  let pos = 0;
  const ifOpen = /\{\{#if\s+[^}]+\}\}/;
  const ifClose = '{{/if}}';
  const elseTag = '{{else}}';

  while (pos < body.length) {
    // Check for {{else}} at current position
    if (depth === 0 && body.startsWith(elseTag, pos)) {
      return pos;
    }

    // Find next tag of interest
    const nextIfOpen = body.slice(pos).search(ifOpen);
    const nextIfClose = body.indexOf(ifClose, pos);
    const nextElse = body.indexOf(elseTag, pos);

    // Collect candidate positions
    const candidates: Array<{ pos: number; type: 'open' | 'close' | 'else' }> = [];
    if (nextIfOpen !== -1) candidates.push({ pos: pos + nextIfOpen, type: 'open' });
    if (nextIfClose !== -1) candidates.push({ pos: nextIfClose, type: 'close' });
    if (nextElse !== -1) candidates.push({ pos: nextElse, type: 'else' });

    if (candidates.length === 0) break;

    // Sort by position
    candidates.sort((a, b) => a.pos - b.pos);
    const next = candidates[0];

    if (next.type === 'open') {
      depth++;
      const match = body.slice(next.pos).match(ifOpen);
      pos = next.pos + (match ? match[0].length : 1);
    } else if (next.type === 'close') {
      depth--;
      pos = next.pos + ifClose.length;
    } else {
      // else tag — only return if at depth 0
      if (depth === 0) return next.pos;
      pos = next.pos + elseTag.length;
    }
  }

  return -1;
}

// ---------------------------------------------------------------------------
// Block processing (recursive)
// ---------------------------------------------------------------------------

/**
 * Process all block-level constructs (#if, #each, ^inverted) in a template.
 * This runs before simple variable substitution so that the correct branches
 * are selected and iterated content is expanded first.
 */
function processBlocks(
  template: string,
  variables: Record<string, unknown>,
): string {
  let result = template;

  // Process {{#if condition}}...{{else}}...{{/if}} blocks
  result = processIfBlocks(result, variables);

  // Process {{#each list}}...{{/each}} blocks
  result = processEachBlocks(result, variables);

  // Process {{^variable}}...{{/variable}} inverted sections
  result = processInvertedSections(result, variables);

  return result;
}

/**
 * Process all {{#if condition}}...{{else}}...{{/if}} blocks.
 * Handles nesting by processing outermost blocks first, then recursing
 * into the selected branch.
 */
function processIfBlocks(
  template: string,
  variables: Record<string, unknown>,
): string {
  const ifOpenPattern = /\{\{#if\s+([^}]+)\}\}/;

  let result = '';
  let remaining = template;

  while (remaining.length > 0) {
    const match = remaining.match(ifOpenPattern);
    if (!match || match.index === undefined) {
      result += remaining;
      break;
    }

    const openTagFull = match[0];
    const conditionVar = match[1].trim();
    const openEnd = match.index + openTagFull.length;

    // Add everything before this block
    result += remaining.slice(0, match.index);

    // Find matching {{/if}}
    const closeIndex = findMatchingClose(
      remaining,
      openEnd,
      /\{\{#if\s+[^}]+\}\}/,
      '{{/if}}',
    );

    if (closeIndex === -1) {
      // Malformed — output as-is
      result += openTagFull;
      remaining = remaining.slice(openEnd);
      continue;
    }

    // Extract the inner body
    const body = remaining.slice(openEnd, closeIndex);
    const afterClose = remaining.slice(closeIndex + '{{/if}}'.length);

    // Find {{else}} at depth 0 within the body
    const elseIndex = findElseAtDepth0(body);

    let ifBody: string;
    let elseBody: string;

    if (elseIndex !== -1) {
      ifBody = body.slice(0, elseIndex);
      elseBody = body.slice(elseIndex + '{{else}}'.length);
    } else {
      ifBody = body;
      elseBody = '';
    }

    // Evaluate condition and select branch
    const conditionValue = resolveNested(variables, conditionVar);
    const selectedBranch = isTruthy(conditionValue) ? ifBody : elseBody;

    // Recursively process the selected branch (it may contain nested blocks)
    result += processBlocks(selectedBranch, variables);

    remaining = afterClose;
  }

  return result;
}

/**
 * Process all {{#each list}}...{{/each}} blocks.
 * Inside the block, {{this}} refers to the current item,
 * {{@index}} is the 0-based index, {{@first}} and {{@last}} are booleans.
 */
function processEachBlocks(
  template: string,
  variables: Record<string, unknown>,
): string {
  const eachOpenPattern = /\{\{#each\s+([^}]+)\}\}/;

  let result = '';
  let remaining = template;

  while (remaining.length > 0) {
    const match = remaining.match(eachOpenPattern);
    if (!match || match.index === undefined) {
      result += remaining;
      break;
    }

    const openTagFull = match[0];
    const listVar = match[1].trim();
    const openEnd = match.index + openTagFull.length;

    result += remaining.slice(0, match.index);

    const closeIndex = findMatchingClose(
      remaining,
      openEnd,
      /\{\{#each\s+[^}]+\}\}/,
      '{{/each}}',
    );

    if (closeIndex === -1) {
      result += openTagFull;
      remaining = remaining.slice(openEnd);
      continue;
    }

    const body = remaining.slice(openEnd, closeIndex);
    const afterClose = remaining.slice(closeIndex + '{{/each}}'.length);

    // Resolve the list variable
    const list = resolveNested(variables, listVar);

    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        // Build iteration context — merge parent variables with iteration vars
        const iterVars: Record<string, unknown> = {
          ...variables,
          this: item,
          '@index': i,
          '@first': i === 0,
          '@last': i === list.length - 1,
        };

        // If the item is an object, spread its properties into scope
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          Object.assign(iterVars, item);
        }

        // Recursively process the body with iteration variables
        result += processBlocks(body, iterVars);
      }
    }
    // If list is not an array, render nothing (like Handlebars)

    remaining = afterClose;
  }

  return result;
}

/**
 * Process all {{^variable}}...{{/variable}} inverted sections.
 * Renders the inner content only when the variable is falsy.
 */
function processInvertedSections(
  template: string,
  variables: Record<string, unknown>,
): string {
  // Match {{^variableName}} — variable name is alphanumeric, dots, underscores, hyphens
  const invertedOpenPattern = /\{\{\^([a-zA-Z0-9_.@-]+)\}\}/;

  let result = '';
  let remaining = template;

  while (remaining.length > 0) {
    const match = remaining.match(invertedOpenPattern);
    if (!match || match.index === undefined) {
      result += remaining;
      break;
    }

    const openTagFull = match[0];
    const varName = match[1].trim();
    const openEnd = match.index + openTagFull.length;

    result += remaining.slice(0, match.index);

    // The close tag uses the same variable name: {{/variableName}}
    const closeTag = `{{/${varName}}}`;

    const closeIndex = findMatchingClose(
      remaining,
      openEnd,
      new RegExp(`\\{\\{\\^${escapeRegex(varName)}\\}\\}`),
      closeTag,
    );

    if (closeIndex === -1) {
      result += openTagFull;
      remaining = remaining.slice(openEnd);
      continue;
    }

    const body = remaining.slice(openEnd, closeIndex);
    const afterClose = remaining.slice(closeIndex + closeTag.length);

    // Evaluate the variable — render body if falsy
    const value = resolveNested(variables, varName);

    if (!isTruthy(value)) {
      // Recursively process the body (may contain nested blocks)
      result += processBlocks(body, variables);
    }
    // If truthy, render nothing (inverted section)

    remaining = afterClose;
  }

  return result;
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Simple variable substitution (leaf-level)
// ---------------------------------------------------------------------------

/**
 * Perform simple {{variable}}, {{variable.property}}, and {{helper variable}}
 * substitution on a template that has already had all block constructs resolved.
 */
function substituteVariables(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();

    // Skip block-level tags that might remain (shouldn't happen, but be safe)
    if (trimmed.startsWith('#') || trimmed.startsWith('^') || trimmed.startsWith('/')) {
      return '';
    }

    // Check for helper syntax: {{helperName arg}}
    const parts = trimmed.split(/\s+/);
    if (parts.length === 2 && HELPERS[parts[0]]) {
      const value = resolveNested(variables, parts[1]);
      return HELPERS[parts[0]](value);
    }

    // Simple variable or nested property
    const value = resolveNested(variables, trimmed);
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a Handlebars-compatible template string with variable substitution.
 *
 * Supports:
 * - {{variable}} — simple substitution
 * - {{variable.property}} — nested property access
 * - {{upper variable}} — helper functions (upper, lower, json, default)
 * - {{#if condition}}...{{else}}...{{/if}} — conditional blocks
 * - {{#each list}}...{{/each}} — iteration blocks with {{this}}, {{@index}}, {{@first}}, {{@last}}
 * - {{^variable}}...{{/variable}} — inverted sections (render when variable is falsy)
 *
 * All block constructs support arbitrary nesting.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown> = {},
): string {
  // Phase 1: Process block-level constructs (#if, #each, ^inverted) recursively
  const afterBlocks = processBlocks(template, variables);

  // Phase 2: Simple {{variable}} and {{helper variable}} substitution
  return substituteVariables(afterBlocks, variables);
}
