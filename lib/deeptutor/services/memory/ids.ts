/**
 * ULID-based ID generation for memory entries and trace events.
 *
 * Uses timestamp + random suffix (Date.now + Math.random) to create
 * lexicographically sortable, collision-resistant IDs.
 * No external dependencies required.
 */

/** Base36 alphabet used for encoding */
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

function encodeBase36(num: number, minLen: number = 1): string {
  let result = '';
  let n = Math.abs(num);
  while (n > 0) {
    result = BASE36[n % 36] + result;
    n = Math.floor(n / 36);
  }
  return result.padStart(minLen, '0');
}

function randomBase36(len: number): string {
  let result = '';
  for (let i = 0; i < len; i++) {
    result += BASE36[Math.floor(Math.random() * 36)];
  }
  return result;
}

/**
 * Generate a new entry ID.
 * Format: m_<timestamp_base36><10-char-random>
 * Example: m_lms5q8x3k2a1b
 */
export function newEntryId(): string {
  const ts = encodeBase36(Date.now(), 8);
  const rand = randomBase36(10);
  return `m_${ts}${rand}`;
}

/**
 * Generate a new trace event ID.
 * Format: <surface>:<timestamp_base36><8-char-random>
 * Example: chat:lms5q8x3k2a1b
 */
export function newTraceId(surface: string): string {
  const ts = encodeBase36(Date.now(), 8);
  const rand = randomBase36(8);
  return `${surface}:${ts}${rand}`;
}

/**
 * Validate that a string looks like a valid entry ID.
 */
export function isValidEntryId(id: string): boolean {
  return /^m_[0-9a-z]{18,}$/.test(id);
}

/**
 * Validate that a string looks like a valid trace/source ref.
 * Format: <surface>:<id> or <surface>:<entity_id>
 */
export function isValidRef(ref: string): boolean {
  return /^[a-z_]+:[a-zA-Z0-9_-]+$/.test(ref);
}
