/**
 * Co-Writer Service — Document storage + AI editing agent
 *
 * Ported from DeepTutor Python co_writer module.
 * Provides document CRUD (file-system), AI-powered text editing
 * (rewrite/shorten/expand), and operation history tracking.
 */

import { createLogger } from '@/lib/logger';
import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import { getDataDir } from '@/lib/paths';
import {
  writeFile,
  readFile,
  mkdir,
  readdir,
  rm,
  stat,
} from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';

const log = createLogger('CoWriterService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoWriterDocument {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoWriterDocumentSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
}

export interface EditRequest {
  text: string;
  instruction: string;
  action: 'rewrite' | 'shorten' | 'expand' | 'summarize';
  /** Optional source for RAG/web context enrichment */
  source?: 'rag' | 'web' | null;
  /** Knowledge base name for RAG source */
  kbName?: string;
  /** Language for the editing */
  language?: string;
}

export interface EditResult {
  editedText: string;
  operationId: string;
}

export interface OperationRecord {
  id: string;
  action: string;
  instruction: string;
  originalLength: number;
  editedLength: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// CoWriterStorage — File-system CRUD
// ---------------------------------------------------------------------------

const DATA_ROOT = getDataDir('co-writer');

function docsRoot(): string {
  return join(DATA_ROOT, 'documents');
}

function docRoot(docId: string): string {
  return join(docsRoot(), `doc_${docId}`);
}

function manifestPath(docId: string): string {
  return join(docRoot(docId), 'manifest.json');
}

function historyPath(): string {
  return join(DATA_ROOT, 'history.json');
}

function generateId(): string {
  return randomBytes(6).toString('hex');
}

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function atomicWriteJSON(path: string, data: unknown): Promise<void> {
  const tmpPath = path + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  const { rename } = await import('fs/promises');
  await rename(tmpPath, path);
}

async function atomicWriteText(path: string, text: string): Promise<void> {
  const tmpPath = path + '.tmp';
  await writeFile(tmpPath, text, 'utf-8');
  const { rename } = await import('fs/promises');
  await rename(tmpPath, path);
}

export class CoWriterStorage {
  /** List all document IDs */
  async listDocIds(): Promise<string[]> {
    await ensureDir(docsRoot());
    const entries = await readdir(docsRoot(), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith('doc_'))
      .map((e) => e.name.replace('doc_', ''));
  }

  /** List all documents (summary view, sorted by updatedAt desc) */
  async listDocuments(): Promise<CoWriterDocumentSummary[]> {
    const ids = await this.listDocIds();
    const docs: CoWriterDocumentSummary[] = [];

    for (const id of ids) {
      try {
        const doc = await this.loadDocument(id);
        if (doc) {
          docs.push({
            id: doc.id,
            title: doc.title,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
            preview: doc.content.slice(0, 200),
          });
        }
      } catch {
        log.warn(`Failed to load document ${id} for listing`);
      }
    }

    return docs.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  /** Create a new document */
  async createDocument(
    title: string,
    content: string,
  ): Promise<CoWriterDocument> {
    const id = generateId();
    await ensureDir(docRoot(id));

    // Derive title from first heading if empty
    const effectiveTitle =
      title ||
      content.match(/^#\s+(.+)$/m)?.[1] ||
      `Untitled ${new Date().toLocaleDateString()}`;

    const now = new Date().toISOString();
    const doc: CoWriterDocument = {
      id,
      title: effectiveTitle,
      content,
      createdAt: now,
      updatedAt: now,
    };

    await atomicWriteJSON(manifestPath(id), doc);
    log.info(`Created document ${id}: ${effectiveTitle}`);
    return doc;
  }

  /** Load a single document */
  async loadDocument(
    docId: string,
  ): Promise<CoWriterDocument | null> {
    const path = manifestPath(docId);
    if (!existsSync(path)) return null;

    try {
      const raw = await readFile(path, 'utf-8');
      return JSON.parse(raw) as CoWriterDocument;
    } catch (err) {
      log.error(`Failed to load document ${docId}:`, err);
      return null;
    }
  }

  /** Update document title and/or content */
  async updateDocument(
    docId: string,
    updates: { title?: string; content?: string },
  ): Promise<CoWriterDocument | null> {
    const doc = await this.loadDocument(docId);
    if (!doc) return null;

    if (updates.content !== undefined) {
      doc.content = updates.content;
    }
    if (updates.title !== undefined) {
      doc.title = updates.title;
    } else if (
      updates.content !== undefined &&
      doc.title.startsWith('Untitled')
    ) {
      // Auto-derive title from content heading
      const heading = updates.content.match(/^#\s+(.+)$/m)?.[1];
      if (heading) doc.title = heading;
    }

    doc.updatedAt = new Date().toISOString();
    await atomicWriteJSON(manifestPath(docId), doc);
    return doc;
  }

  /** Delete a document */
  async deleteDocument(docId: string): Promise<boolean> {
    const dir = docRoot(docId);
    if (!existsSync(dir)) return false;
    await rm(dir, { recursive: true, force: true });
    log.info(`Deleted document ${docId}`);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Operation History
// ---------------------------------------------------------------------------

export class OperationHistory {
  private history: OperationRecord[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    await ensureDir(DATA_ROOT);
    const path = historyPath();
    if (existsSync(path)) {
      try {
        const raw = await readFile(path, 'utf-8');
        this.history = JSON.parse(raw);
      } catch {
        this.history = [];
      }
    }
    this.loaded = true;
  }

  async add(record: OperationRecord): Promise<void> {
    await this.load();
    this.history.unshift(record);
    // Keep last 100 operations
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }
    await atomicWriteJSON(historyPath(), this.history);
  }

  async list(): Promise<OperationRecord[]> {
    await this.load();
    return [...this.history];
  }

  async get(operationId: string): Promise<OperationRecord | null> {
    await this.load();
    return this.history.find((r) => r.id === operationId) ?? null;
  }
}

// ---------------------------------------------------------------------------
// EditAgent — AI-powered text editing
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  rewrite: 'Rewrite',
  shorten: 'Shorten',
  expand: 'Expand',
  summarize: 'Summarize',
};

export class EditAgent {
  private providerId: ProviderId;
  private modelId: string;
  private apiKey: string;
  private baseUrl?: string;

  constructor(config?: {
    providerId?: string;
    modelId?: string;
    apiKey?: string;
    baseUrl?: string;
  }) {
    this.providerId = (config?.providerId ??
      process.env.DT_DEFAULT_PROVIDER ??
      'openai') as ProviderId;
    this.modelId =
      config?.modelId ?? process.env.DT_DEFAULT_MODEL ?? 'gpt-4o-mini';
    this.apiKey =
      config?.apiKey ??
      process.env.DT_DEFAULT_API_KEY ??
      process.env.OPENAI_API_KEY ??
      '';
    this.baseUrl = config?.baseUrl;
  }

  /**
   * Main editing entry point.
   * Applies the specified action (rewrite/shorten/expand/summarize) to the text.
   */
  async edit(request: EditRequest): Promise<EditResult> {
    const { text, instruction, action, language = 'en' } = request;

    if (!this.apiKey) {
      return {
        editedText: `[LLM not configured — set API key in settings]`,
        operationId: '',
      };
    }

    const systemPrompt = this.buildSystemPrompt(action, language);
    const userPrompt = this.buildUserPrompt(text, instruction, action);

    try {
      const { model } = getModel({
        providerId: this.providerId,
        modelId: this.modelId,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
      });

      const result = await callLLM(
        {
          model,
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
        'co-writer-edit',
      );

      let editedText = result.text;
      // Clean up potential markdown fences
      editedText = this.stripMarkdownFence(editedText);

      return {
        editedText,
        operationId: generateId(),
      };
    } catch (err) {
      log.error('EditAgent failed:', err);
      return {
        editedText: `[Edit failed: ${err instanceof Error ? err.message : String(err)}]`,
        operationId: '',
      };
    }
  }

  private buildSystemPrompt(action: string, language: string): string {
    const langLabel = language === 'zh' ? 'Chinese' : language === 'ja' ? 'Japanese' : language === 'ru' ? 'Russian' : 'English';
    const actionLabel = ACTION_LABELS[action] ?? 'Edit';

    return `You are an expert editor and writing assistant. Your task is to ${actionLabel.toLowerCase()} the given text.

Rules:
- Output ONLY the edited text. No explanations, no markdown fences, no preamble.
- Maintain the original language (${langLabel}) unless the user instructs otherwise.
- Preserve formatting (headings, lists, code blocks) from the original.
- When ${actionLabel === 'Shorten' ? 'shortening' : actionLabel === 'Expand' ? 'expanding' : actionLabel === 'Summarize' ? 'summarizing' : 'rewriting'}, focus on clarity and coherence.
- If the instruction is specific, follow it precisely.
- If the instruction is vague, improve overall quality: grammar, clarity, structure.`;
  }

  private buildUserPrompt(
    text: string,
    instruction: string,
    action: string,
  ): string {
    const parts: string[] = [];

    if (instruction) {
      parts.push(`Instruction: ${instruction}`);
    }

    parts.push(`Action: ${ACTION_LABELS[action] ?? 'Edit'}`);
    parts.push(`\nOriginal text:\n${text}`);
    parts.push(`\nOutput the edited text:`);

    return parts.join('\n');
  }

  private stripMarkdownFence(text: string): string {
    // Remove wrapping ```markdown or ``` fences
    const trimmed = text.trim();
    if (trimmed.startsWith('```')) {
      const lines = trimmed.split('\n');
      // Remove first line (```markdown or ```)
      lines.shift();
      // Remove last line if it's ```
      if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
        lines.pop();
      }
      return lines.join('\n').trim();
    }
    return trimmed;
  }
}
