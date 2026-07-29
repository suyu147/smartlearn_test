/**
 * LabelProtocol — Parsing for streaming LLM responses
 *
 * The agentic engine drives LLM calls with a ``LABEL``+content protocol:
 * prompts require one allowed label, backtick-wrapped, on the first line.
 *
 * Migrated from: deeptutor/core/agentic/labels.py
 */

export const LABEL_UNKNOWN = 'UNKNOWN';
export const LABEL_PROBE_MAX_CHARS = 64;

const INVISIBLE_PREFIX_CHARS = '\ufeff\u200b\u200c\u200d';
const LABEL_SEPARATOR_CHARS = '\n\r \t:：-–—';

/** Strip leading whitespace and zero-width chars */
export function stripLabelProbePrefix(buffer: string): string {
  let stripped = String(buffer || '');
  let previous: string | null = null;
  while (stripped !== previous) {
    previous = stripped;
    while (stripped.length > 0 && (stripped[0] === ' ' || stripped[0] === '\t' || stripped[0] === '\n' || stripped[0] === '\r')) {
      stripped = stripped.slice(1);
    }
    while (stripped.length > 0 && INVISIBLE_PREFIX_CHARS.includes(stripped[0])) {
      stripped = stripped.slice(1);
    }
  }
  return stripped;
}

/**
 * Inspect a content buffer for a leading ``LABEL`` prefix.
 * Returns [label, afterText] once detected, or null while still buffering.
 */
export function classifyLabel(
  buffer: string,
  allowedLabels: readonly string[],
  final: boolean = false,
): [string, string] | null {
  const stripped = stripLabelProbePrefix(buffer);

  for (const label of allowedLabels) {
    // Try wrapped form: ```LABEL``` or `LABEL`
    const wrappedMatch = stripped.match(
      new RegExp(`^(\`+)\\s*${escapeRegex(label)}\\s*\\1(.*)$`, 's'),
    );
    if (wrappedMatch) {
      let after = wrappedMatch[2];
      // Avoid accepting over-closed wrappers
      if (after && after[0] === '`') continue;
      // Eat separating chars after label
      after = stripLeadingSeparators(after);
      return [label, after];
    }

    // Bare-label fallback
    if (stripped.startsWith(label)) {
      const tail = stripped.slice(label.length);
      if (tail && LABEL_SEPARATOR_CHARS.includes(tail[0])) {
        return [label, stripLeadingSeparators(tail)];
      }
      if (final && !tail) {
        return [label, ''];
      }
    }
  }

  return null;
}

/** Find labels that appear inside post-label body text */
export function findInlineLabels(
  text: string,
  allowedLabels: readonly string[],
): string[] {
  if (!allowedLabels.length) return [];

  const pattern = allowedLabels.map(escapeRegex).join('|');
  const raw = String(text || '');
  const escapedSeparators = escapeRegex(LABEL_SEPARATOR_CHARS);
  const results: string[] = [];

  // Wrapped form at start of line
  const wrappedRegex = new RegExp(
    `^[^\\S\\r\\n]*(\`+)\\s*(?<label>${pattern})\\s*\\1(?=$|[${escapedSeparators}])`,
    'gm',
  );
  let match: RegExpExecArray | null;
  while ((match = wrappedRegex.exec(raw)) !== null) {
    if (match.groups?.label) results.push(match.groups.label);
  }

  // Bare form at start of line
  const bareRegex = new RegExp(
    `^[^\\S\\r\\n]*(${pattern})(?=$|[${escapedSeparators}])`,
    'gm',
  );
  while ((match = bareRegex.exec(raw)) !== null) {
    if (match[1]) results.push(match[1]);
  }

  return results;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripLeadingSeparators(str: string): string {
  let i = 0;
  while (i < str.length && LABEL_SEPARATOR_CHARS.includes(str[i])) {
    i++;
  }
  return str.slice(i);
}
