/**
 * Path Resolver — Unified data & prompts directory resolution
 *
 * In Docker standalone mode, the working directory only contains:
 *   server.js  .next/  node_modules/  public/  prisma/  data/  entrypoint.sh
 *
 * This module ensures:
 * 1. Data paths respect the `DT_DATA_DIR` env var (set to `/app/data` in Docker)
 * 2. Prompt paths fall back to `.next/server/lib/...` in standalone mode
 *    (Next.js traces and copies server-side files into the standalone output)
 */

import path from 'path';
import { existsSync } from 'fs';

// ---------------------------------------------------------------------------
// Data directory
// ---------------------------------------------------------------------------

/**
 * Resolve the root data directory.
 *
 * Priority:
 * 1. `DT_DATA_DIR` env var (Docker: `/app/data`)
 * 2. `{cwd}/data` (local dev)
 */
export function getDataDir(...segments: string[]): string {
  const root = process.env.DT_DATA_DIR || path.join(process.cwd(), 'data');
  return segments.length > 0 ? path.join(root, ...segments) : root;
}

// ---------------------------------------------------------------------------
// Prompt directory
// ---------------------------------------------------------------------------

/** Cached prompts directory path (resolved once) */
let cachedPromptsDir: string | null = null;

/**
 * Resolve the prompts directory.
 *
 * In standalone mode, Next.js traces server-side imports and copies
 * referenced files (like our .md prompt templates) into `.next/server/`.
 * We check both locations and cache the result.
 */
export function getPromptsDir(): string {
  if (cachedPromptsDir) return cachedPromptsDir;

  // 1. Try standard project layout (local dev)
  const devPath = path.join(process.cwd(), 'lib', 'generation', 'prompts');
  if (existsSync(devPath)) {
    cachedPromptsDir = devPath;
    return devPath;
  }

  // 2. Try standalone layout (Docker production)
  const standalonePath = path.join(process.cwd(), '.next', 'server', 'lib', 'generation', 'prompts');
  if (existsSync(standalonePath)) {
    cachedPromptsDir = standalonePath;
    return standalonePath;
  }

  // Fallback to dev path (will produce clear errors if missing)
  cachedPromptsDir = devPath;
  return devPath;
}
