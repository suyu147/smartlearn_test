/**
 * Meta — Incremental tracking for consolidator runs.
 *
 * Keeps track of which entities / L2 entries have already been processed,
 * so subsequent consolidate runs only process new data.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { Surface } from '@/lib/deeptutor/services/memory';
import { getDataDir } from '@/lib/paths';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface L2Meta {
  /** Set of entity refs that have been processed into L2 */
  seenEntityRefs: string[];
  /** ISO timestamp of last successful L2 update */
  lastUpdateAt: string;
}

export interface L3Meta {
  /** Surface name → list of L2 entry IDs already processed into L3 */
  seenL2EntryIds: Record<string, string[]>;
  /** ISO timestamp of last successful L3 update */
  lastUpdateAt: string;
}

// ---------------------------------------------------------------------------
// L2 Meta
// ---------------------------------------------------------------------------

export class MetaStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? getDataDir('memory');
  }

  async readL2Meta(userId: string, surface: Surface): Promise<L2Meta> {
    const filePath = join(this.baseDir, userId, 'snapshot', surface, 'l2-meta.json');
    try {
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as L2Meta;
    } catch {
      return { seenEntityRefs: [], lastUpdateAt: '' };
    }
  }

  async writeL2Meta(userId: string, surface: Surface, meta: L2Meta): Promise<void> {
    const dir = join(this.baseDir, userId, 'snapshot', surface);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, 'l2-meta.json');
    await writeFile(filePath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  async readL3Meta(userId: string): Promise<L3Meta> {
    const filePath = join(this.baseDir, userId, 'L3-meta.json');
    try {
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as L3Meta;
    } catch {
      return { seenL2EntryIds: {}, lastUpdateAt: '' };
    }
  }

  async writeL3Meta(userId: string, meta: L3Meta): Promise<void> {
    const dir = join(this.baseDir, userId);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, 'L3-meta.json');
    await writeFile(filePath, JSON.stringify(meta, null, 2), 'utf-8');
  }
}
