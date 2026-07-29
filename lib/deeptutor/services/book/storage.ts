/**
 * BookStorage — File-system persistence for Book Engine
 *
 * Ported from DeepTutor Python deeptutor/book/storage.py.
 * Uses atomic writes (write .tmp → rename) for crash safety.
 *
 * Directory layout:
 *   data/books/book_{id}/
 *     manifest.json    — Book metadata
 *     spine.json       — Spine + ConceptGraph
 *     progress.json    — Reader progress
 *     inputs.json      — BookInputs snapshot
 *     exploration.json — ExplorationReport
 *     log.md           — Append-only operation log
 *     pages/
 *       {pageId}.json  — One file per page
 */

import { writeFile, readFile, mkdir, readdir, rm, rename } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { createLogger } from '@/lib/logger';
import { getDataDir } from '@/lib/paths';
import type {
  Book,
  BookSummary,
  Page,
  Spine,
  Progress,
  BookInputs,
} from './models';
import { createBook, createProgress } from './models';

const log = createLogger('BookStorage');
const DATA_ROOT = getDataDir('books');

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function bookRoot(bookId: string): string {
  return join(DATA_ROOT, `book_${bookId}`);
}

function manifestPath(bookId: string): string {
  return join(bookRoot(bookId), 'manifest.json');
}

function spinePath(bookId: string): string {
  return join(bookRoot(bookId), 'spine.json');
}

function progressPath(bookId: string): string {
  return join(bookRoot(bookId), 'progress.json');
}

function inputsPath(bookId: string): string {
  return join(bookRoot(bookId), 'inputs.json');
}

function pagesDir(bookId: string): string {
  return join(bookRoot(bookId), 'pages');
}

function pagePath(bookId: string, pageId: string): string {
  return join(pagesDir(bookId), `${pageId}.json`);
}

function logPath(bookId: string): string {
  return join(bookRoot(bookId), 'log.md');
}

export function generateId(): string {
  return randomBytes(6).toString('hex');
}

export function generatePageId(): string {
  return `pg_${randomBytes(4).toString('hex')}`;
}

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function atomicWriteJSON(path: string, data: unknown): Promise<void> {
  const tmpPath = path + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmpPath, path);
}

async function readJSON<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// BookStorage class
// ---------------------------------------------------------------------------

export class BookStorage {
  // -----------------------------------------------------------------------
  // Book CRUD
  // -----------------------------------------------------------------------

  /** List all book IDs */
  async listBookIds(): Promise<string[]> {
    await ensureDir(DATA_ROOT);
    const entries = await readdir(DATA_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith('book_'))
      .map((e) => e.name.replace('book_', ''));
  }

  /** List all books (summary view) */
  async listBooks(): Promise<BookSummary[]> {
    const ids = await this.listBookIds();
    const summaries: BookSummary[] = [];

    for (const id of ids) {
      try {
        const book = await this.loadManifest(id);
        if (book) {
          const pageIds = await this.listPageIds(id);
          summaries.push({
            id: book.id,
            title: book.proposal?.title ?? `Book ${id.slice(0, 6)}`,
            status: book.status,
            chapterCount: book.spine?.chapters.length ?? 0,
            pageCount: pageIds.length,
            createdAt: book.createdAt,
            updatedAt: book.updatedAt,
          });
        }
      } catch {
        log.warn(`Failed to load book ${id} for listing`);
      }
    }

    return summaries.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  /** Create a new book with the given proposal */
  async createBook(
    proposal: Book['proposal'],
    inputs?: BookInputs,
  ): Promise<Book> {
    const id = generateId();
    const root = bookRoot(id);
    await ensureDir(root);
    await ensureDir(pagesDir(id));

    const book = createBook({
      id,
      status: 'draft',
      proposal,
      inputs: inputs ?? null,
    });

    await atomicWriteJSON(manifestPath(id), book);

    if (inputs) {
      await atomicWriteJSON(inputsPath(id), inputs);
    }

    // Initialize log
    await writeFile(
      logPath(id),
      `# Book Engine Log — ${id}\n\n| Time | Operation | Status | Detail |\n|------|-----------|--------|--------|\n`,
      'utf-8',
    );

    log.info(`Created book ${id}: ${proposal?.title ?? 'untitled'}`);
    return book;
  }

  /** Load book manifest */
  async loadManifest(bookId: string): Promise<Book | null> {
    return readJSON<Book>(manifestPath(bookId));
  }

  /** Save book manifest */
  async saveManifest(book: Book): Promise<void> {
    book.updatedAt = new Date().toISOString();
    await atomicWriteJSON(manifestPath(book.id), book);
  }

  /** Delete a book */
  async deleteBook(bookId: string): Promise<boolean> {
    const dir = bookRoot(bookId);
    if (!existsSync(dir)) return false;
    await rm(dir, { recursive: true, force: true });
    log.info(`Deleted book ${bookId}`);
    return true;
  }

  // -----------------------------------------------------------------------
  // Spine
  // -----------------------------------------------------------------------

  async loadSpine(bookId: string): Promise<Spine | null> {
    return readJSON<Spine>(spinePath(bookId));
  }

  async saveSpine(bookId: string, spine: Spine): Promise<void> {
    await atomicWriteJSON(spinePath(bookId), spine);
  }

  // -----------------------------------------------------------------------
  // Progress
  // -----------------------------------------------------------------------

  async loadProgress(bookId: string): Promise<Progress> {
    const p = await readJSON<Progress>(progressPath(bookId));
    return p ?? createProgress();
  }

  async saveProgress(bookId: string, progress: Progress): Promise<void> {
    await atomicWriteJSON(progressPath(bookId), progress);
  }

  // -----------------------------------------------------------------------
  // Inputs
  // -----------------------------------------------------------------------

  async loadInputs(bookId: string): Promise<BookInputs | null> {
    return readJSON<BookInputs>(inputsPath(bookId));
  }

  // -----------------------------------------------------------------------
  // Pages
  // -----------------------------------------------------------------------

  /** List all page IDs for a book */
  async listPageIds(bookId: string): Promise<string[]> {
    const dir = pagesDir(bookId);
    await ensureDir(dir);
    const entries = await readdir(dir);
    return entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  }

  /** Load a single page */
  async loadPage(bookId: string, pageId: string): Promise<Page | null> {
    return readJSON<Page>(pagePath(bookId, pageId));
  }

  /** Load all pages */
  async loadAllPages(bookId: string): Promise<Page[]> {
    const ids = await this.listPageIds(bookId);
    const pages: Page[] = [];
    for (const id of ids) {
      const page = await this.loadPage(bookId, id);
      if (page) pages.push(page);
    }
    return pages.sort((a, b) => a.chapterOrder - b.chapterOrder);
  }

  /** Save a page */
  async savePage(bookId: string, page: Page): Promise<void> {
    await ensureDir(pagesDir(bookId));
    await atomicWriteJSON(pagePath(bookId, page.id), page);
  }

  /** Delete a page */
  async deletePage(bookId: string, pageId: string): Promise<boolean> {
    const p = pagePath(bookId, pageId);
    if (!existsSync(p)) return false;
    await rm(p);
    return true;
  }

  // -----------------------------------------------------------------------
  // Operation log (append-only markdown)
  // -----------------------------------------------------------------------

  async appendLog(
    bookId: string,
    operation: string,
    status: 'ok' | 'error' | 'skip',
    detail: string,
  ): Promise<void> {
    const p = logPath(bookId);
    if (!existsSync(p)) return;
    const ts = new Date().toISOString().slice(11, 19);
    const line = `| ${ts} | ${operation} | ${status} | ${detail} |\n`;
    await writeFile(p, line, { flag: 'a' });
  }

  // -----------------------------------------------------------------------
  // Full book load (manifest + spine + all pages + progress)
  // -----------------------------------------------------------------------

  async loadFullBook(bookId: string): Promise<{
    book: Book;
    pages: Page[];
  } | null> {
    const book = await this.loadManifest(bookId);
    if (!book) return null;

    // Load spine if not in manifest
    if (!book.spine) {
      book.spine = await this.loadSpine(bookId);
    }

    // Load progress
    book.progress = await this.loadProgress(bookId);

    const pages = await this.loadAllPages(bookId);
    return { book, pages };
  }
}
