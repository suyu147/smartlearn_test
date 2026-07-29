/**
 * NotebookService — Notebook and note management
 *
 * Storage layout:
 *   data/notebooks/{userId}/
 *     index.json              — notebook list
 *     {notebookId}.json       — per-notebook records
 *
 * Phase 2c: Basic notebook CRUD + note management.
 */

import { createLogger } from '@/lib/logger';
import { getDataDir } from '@/lib/paths';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const log = createLogger('NotebookService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Notebook {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  recordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookRecord {
  id: string;
  type: string;       // 'solve' | 'question' | 'research' | 'chat' | 'note'
  title: string;
  summary: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOTEBOOK_BASE_DIR = getDataDir('notebooks');

// ---------------------------------------------------------------------------
// NotebookService
// ---------------------------------------------------------------------------

export class NotebookServiceImpl {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? NOTEBOOK_BASE_DIR;
  }

  async listNotebooks(userId: string): Promise<Notebook[]> {
    const index = await this.readIndex(userId);
    return index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createNotebook(userId: string, name: string, description?: string): Promise<Notebook> {
    const index = await this.readIndex(userId);

    const notebook: Notebook = {
      id: generateId(),
      name,
      description: description ?? '',
      color: '#3B82F6',
      icon: 'book',
      recordCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    index.push(notebook);
    await this.writeIndex(userId, index);

    // Create empty notebook file
    await this.writeNotebook(userId, notebook.id, []);

    log.info(`Created notebook "${name}" (${notebook.id}) for user ${userId}`);
    return notebook;
  }

  async getNotebook(userId: string, notebookId: string): Promise<Notebook | null> {
    const index = await this.readIndex(userId);
    return index.find((nb) => nb.id === notebookId) ?? null;
  }

  async deleteNotebook(userId: string, notebookId: string): Promise<boolean> {
    const index = await this.readIndex(userId);
    const filtered = index.filter((nb) => nb.id !== notebookId);
    if (filtered.length === index.length) return false;
    await this.writeIndex(userId, filtered);
    log.info(`Deleted notebook ${notebookId} for user ${userId}`);
    return true;
  }

  async addRecord(
    userId: string,
    notebookId: string,
    record: Omit<NotebookRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<NotebookRecord> {
    const records = await this.readNotebook(userId, notebookId);

    const fullRecord: NotebookRecord = {
      ...record,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    records.push(fullRecord);
    await this.writeNotebook(userId, notebookId, records);

    // Update index count
    const index = await this.readIndex(userId);
    const nb = index.find((n) => n.id === notebookId);
    if (nb) {
      nb.recordCount = records.length;
      nb.updatedAt = new Date().toISOString();
      await this.writeIndex(userId, index);
    }

    return fullRecord;
  }

  async getRecords(userId: string, notebookId: string): Promise<NotebookRecord[]> {
    return this.readNotebook(userId, notebookId);
  }

  async deleteRecord(userId: string, notebookId: string, recordId: string): Promise<boolean> {
    const records = await this.readNotebook(userId, notebookId);
    const filtered = records.filter((r) => r.id !== recordId);
    if (filtered.length === records.length) return false;
    await this.writeNotebook(userId, notebookId, filtered);

    // Update index
    const index = await this.readIndex(userId);
    const nb = index.find((n) => n.id === notebookId);
    if (nb) {
      nb.recordCount = filtered.length;
      nb.updatedAt = new Date().toISOString();
      await this.writeIndex(userId, index);
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private userDir(userId: string): string {
    return join(this.baseDir, userId);
  }

  private async readIndex(userId: string): Promise<Notebook[]> {
    try {
      const content = await readFile(join(this.userDir(userId), 'index.json'), 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async writeIndex(userId: string, index: Notebook[]): Promise<void> {
    const dir = this.userDir(userId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');
  }

  private async readNotebook(userId: string, notebookId: string): Promise<NotebookRecord[]> {
    try {
      const content = await readFile(join(this.userDir(userId), `${notebookId}.json`), 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async writeNotebook(userId: string, notebookId: string, records: NotebookRecord[]): Promise<void> {
    const dir = this.userDir(userId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${notebookId}.json`), JSON.stringify(records, null, 2), 'utf-8');
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Re-export for backward compat
export interface NotebookService {
  list(userId: string): Promise<Record<string, unknown>[]>;
  create(userId: string, name: string): Promise<string>;
  addNote(notebookId: string, content: string): Promise<string>;
}
