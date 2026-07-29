/**
 * Storage Service — Local disk storage adapter
 *
 * Provides a StorageAdapter abstraction over local filesystem with:
 * - Atomic writes (write to .tmp then rename)
 * - Directory traversal protection
 * - Path-safe key resolution
 * - Public URL generation for API-served files
 *
 * Phase 1: local disk only. Phase 5+: S3/MinIO/GCS adapters.
 */

import { createLogger } from '@/lib/logger';
import { getDataDir } from '@/lib/paths';
import {
  readFile,
  writeFile,
  unlink,
  readdir,
  rename,
  mkdir,
  stat,
  access,
} from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const log = createLogger('StorageService');

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  /** Initialize the adapter (e.g. create directories). Optional. */
  init?(): Promise<void>;

  /** Read a file by key. Returns null if not found. */
  read(key: string): Promise<Buffer | null>;

  /** Write content to a key. Returns the relative key path. */
  write(key: string, content: string | Buffer): Promise<string>;

  /** Delete a file by key. Returns true if deleted, false if not found. */
  delete(key: string): Promise<boolean>;

  /** List all keys matching a prefix. */
  list(prefix: string): Promise<string[]>;

  /** Check if a key exists on disk. */
  exists(key: string): Promise<boolean>;

  /** Resolve a key to an absolute filesystem path, or null if unsafe. */
  resolvePath(key: string): string | null;

  /** Return the public API URL for a key. */
  getPublicUrl(key: string): string;
}

// ---------------------------------------------------------------------------
// LocalDiskAdapter
// ---------------------------------------------------------------------------

export class LocalDiskAdapter implements StorageAdapter {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = path.resolve(
      rootDir ??
        process.env.DT_STORAGE_ROOT ??
        getDataDir('storage'),
    );
  }

  /** Ensure the root directory exists. Call once at startup. */
  async init(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    log.debug(`Storage root initialized: ${this.rootDir}`);
  }

  // --- read ---------------------------------------------------------------

  async read(key: string): Promise<Buffer | null> {
    const absPath = this.resolvePath(key);
    if (!absPath) return null;

    try {
      return await readFile(absPath);
    } catch (err: unknown) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  // --- write (atomic) -----------------------------------------------------

  async write(key: string, content: string | Buffer): Promise<string> {
    const absPath = this.resolvePath(key);
    if (!absPath) {
      throw new Error(`Unsafe storage key: ${key}`);
    }

    // Ensure parent directory exists
    const dir = path.dirname(absPath);
    await mkdir(dir, { recursive: true });

    // Write to a temporary file first, then rename (atomic on same filesystem)
    const tmpSuffix = `.tmp-${randomBytes(4).toString('hex')}`;
    const tmpPath = absPath + tmpSuffix;

    try {
      const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
      await writeFile(tmpPath, buf);
      await rename(tmpPath, absPath);
    } catch (err) {
      // Clean up temp file on failure
      try {
        await unlink(tmpPath);
      } catch {
        // ignore cleanup errors
      }
      throw err;
    }

    log.debug(`Written: ${key} (${typeof content === 'string' ? content.length : content.length} bytes)`);
    return key;
  }

  // --- delete -------------------------------------------------------------

  async delete(key: string): Promise<boolean> {
    const absPath = this.resolvePath(key);
    if (!absPath) return false;

    try {
      await unlink(absPath);
      log.debug(`Deleted: ${key}`);
      return true;
    } catch (err: unknown) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  // --- list ---------------------------------------------------------------

  async list(prefix: string): Promise<string[]> {
    const absDir = this.resolvePath(prefix);
    if (!absDir) return [];

    // If the prefix points to a directory, list its contents
    try {
      const s = await stat(absDir);
      if (s.isDirectory()) {
        return this.listDirectory(absDir, prefix);
      }
    } catch {
      // not a directory — try listing parent with prefix filter
    }

    // Otherwise, treat prefix as a key prefix and scan the root
    return this.listByPrefix(prefix);
  }

  // --- exists -------------------------------------------------------------

  async exists(key: string): Promise<boolean> {
    const absPath = this.resolvePath(key);
    if (!absPath) return false;

    try {
      await access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  // --- resolvePath --------------------------------------------------------

  resolvePath(key: string): string | null {
    if (!key) return null;

    // Normalize: strip leading slashes, normalize separators
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');

    // Reject obviously malicious keys
    if (normalized.includes('..')) return null;
    if (normalized.includes('\0')) return null;

    const absPath = path.resolve(this.rootDir, normalized);

    // Verify the resolved path is still within rootDir
    const relative = path.relative(this.rootDir, absPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      log.warn(`Path traversal blocked: ${key}`);
      return null;
    }

    return absPath;
  }

  // --- getPublicUrl -------------------------------------------------------

  getPublicUrl(key: string): string {
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
    return `/api/v1/storage/${normalized}`;
  }

  // --- private helpers ----------------------------------------------------

  private async listDirectory(absDir: string, prefix: string): Promise<string[]> {
    const entries = await readdir(absDir, { withFileTypes: true });
    const keys: string[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const relKey = prefix ? `${prefix.replace(/\/+$/, '')}/${entry.name}` : entry.name;
        keys.push(relKey);
      }
    }

    return keys.sort();
  }

  private async listByPrefix(prefix: string): Promise<string[]> {
    const results: string[] = [];
    const normalized = prefix.replace(/\\/g, '/').replace(/^\/+/, '');

    // Walk the root directory recursively, collecting files matching prefix
    await this.walkDir(this.rootDir, '', normalized, results);
    return results.sort();
  }

  private async walkDir(
    baseDir: string,
    currentRel: string,
    prefix: string,
    results: string[],
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(path.join(baseDir, currentRel), { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryRel = currentRel ? `${currentRel}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip hidden directories and temp files
        if (entry.name.startsWith('.')) continue;
        await this.walkDir(baseDir, entryRel, prefix, results);
      } else if (entry.isFile()) {
        if (entryRel.startsWith(prefix)) {
          results.push(entryRel);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let storageInstance: StorageAdapter | null = null;

/** Get the singleton storage adapter (creates LocalDiskAdapter on first call). */
export function getStorageAdapter(): StorageAdapter {
  if (!storageInstance) {
    storageInstance = new LocalDiskAdapter();
    // Fire-and-forget init; errors logged internally
    storageInstance.init?.().catch((err: unknown) => {
      log.error('Failed to init storage root:', err);
    });
  }
  return storageInstance;
}

/** Replace the singleton (useful for testing). */
export function setStorageAdapter(adapter: StorageAdapter): void {
  storageInstance = adapter;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    ('code' in err ? (err as NodeJS.ErrnoException).code === 'ENOENT' : false)
  );
}

// ---------------------------------------------------------------------------
// Backward compat re-exports
// ---------------------------------------------------------------------------

export const StorageService = {
  getStorageAdapter,
  setStorageAdapter,
} as const;
