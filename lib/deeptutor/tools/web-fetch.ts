/**
 * WebFetchTool — Fetch a web page and extract its readable content
 *
 * Migrated from DeepTutor Python: deeptutor/tools/web_fetch.py
 * Uses only built-in APIs (globalThis.fetch) and string manipulation —
 * no external HTML parsing dependencies.
 */

import { BaseTool, createToolResult } from '@/lib/deeptutor/core/tool-protocol';
import type { ToolDefinition, ToolResult } from '@/lib/deeptutor/core/tool-protocol';
import { createLogger } from '@/lib/logger';

const log = createLogger('WebFetchTool');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024; // 4 MB

// Private / reserved IPv4 ranges (simplified check)
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
];

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

function isPrivateHost(hostname: string): boolean {
  // Strip brackets from IPv6 literals
  const clean = hostname.replace(/^\[|\]$/g, '');

  // localhost
  if (clean === 'localhost' || clean === 'localhost.localdomain') return true;

  // IPv4 private ranges
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) {
    return PRIVATE_IP_PATTERNS.some((re) => re.test(clean));
  }

  // IPv6 loopback
  if (clean === '::1' || clean === '::') return true;

  return false;
}

function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: "${raw}"`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol "${url.protocol}". Only http and https are allowed.`);
  }

  if (isPrivateHost(url.hostname)) {
    throw new Error(`Access to private or reserved addresses is not allowed: "${url.hostname}"`);
  }

  return url;
}

// ---------------------------------------------------------------------------
// HTML extraction helpers (no external deps)
// ---------------------------------------------------------------------------

/** Extract text content from the <title> tag, if present. */
function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return '';
  return decodeEntities(match[1]).trim();
}

/** Remove all <script> and <style> blocks (including their content). */
function stripBlocks(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/** Strip all HTML tags, leaving only text content. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

/** Decode common HTML entities. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Collapse runs of whitespace into single spaces / newlines. */
function normalizeWhitespace(text: string): string {
  // Collapse horizontal whitespace (spaces, tabs) but preserve newlines
  const lines = text.split(/\r?\n/);
  const cleaned = lines.map((line) => line.replace(/[ \t]+/g, ' ').trim());
  // Collapse multiple blank lines into at most two
  const result: string[] = [];
  let blankCount = 0;
  for (const line of cleaned) {
    if (line === '') {
      blankCount++;
      if (blankCount <= 2) result.push(line);
    } else {
      blankCount = 0;
      result.push(line);
    }
  }
  return result.join('\n').trim();
}

/** Full pipeline: HTML → readable text. */
function extractReadableContent(html: string): { text: string; title: string } {
  const title = extractTitle(html);
  const noScripts = stripBlocks(html);
  const noTags = stripTags(noScripts);
  const decoded = decodeEntities(noTags);
  const text = normalizeWhitespace(decoded);
  return { text, title };
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchPage(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SmartLearn/1.0 (DeepTutor WebFetch)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  // Read body with a size limit
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response has no readable body');
  }

  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_RESPONSE_BYTES) {
        reader.cancel();
        throw new Error(
          `Response exceeds maximum size of ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const total = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    total.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return decoder.decode(total);
}

// ---------------------------------------------------------------------------
// WebFetchTool
// ---------------------------------------------------------------------------

export class WebFetchTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'web_fetch',
      description:
        'Fetch a web page and extract its readable content as text. ' +
        'Use this to read articles, documentation, or any web page.',
      parameters: [
        {
          name: 'url',
          type: 'string',
          description: 'The URL to fetch',
          required: true,
          default: null,
          enum: null,
          items: null,
        },
        {
          name: 'max_chars',
          type: 'integer',
          description: 'Maximum characters to extract (default: 50000)',
          required: false,
          default: 50000,
          enum: null,
          items: null,
        },
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const url = kwargs.url as string;
    const maxChars = (kwargs.max_chars as number) ?? 50000;

    if (!url || typeof url !== 'string') {
      return createToolResult({
        content: 'Error: "url" is required and must be a non-empty string.',
        success: false,
      });
    }

    // Validate URL and check for private IPs
    let parsed: URL;
    try {
      parsed = validateUrl(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return createToolResult({
        content: `URL validation failed: ${message}`,
        success: false,
      });
    }

    log.info('Fetching URL:', parsed.toString());

    try {
      const html = await fetchPage(parsed);
      const { text, title } = extractReadableContent(html);

      // Truncate to maxChars
      const truncated =
        text.length > maxChars
          ? text.slice(0, maxChars) + '\n\n[... content truncated at ' + maxChars + ' characters]'
          : text;

      const displayTitle = title || parsed.hostname;

      return createToolResult({
        content: truncated,
        sources: [{ type: 'web', url: parsed.toString(), title: displayTitle }],
        metadata: { url: parsed.toString(), title: displayTitle, charsExtracted: truncated.length },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('WebFetch failed:', message);
      return createToolResult({
        content: `Failed to fetch "${url}": ${message}`,
        success: false,
        metadata: { url },
      });
    }
  }
}

export default WebFetchTool;
