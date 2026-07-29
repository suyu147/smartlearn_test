/**
 * BookCompiler — Per-page block generation pipeline
 *
 * Ported from DeepTutor Python deeptutor/book/compiler.py.
 * Plans blocks (SectionArchitect) → generates each block (Registry) → persists.
 */

import { createLogger } from '@/lib/logger';
import type { Page, Chapter, Block } from './models';
import { createPage } from './models';
import { generatePageId } from './storage';
import { BookStorage } from './storage';
import type { BookStream } from './stream';
import { SectionArchitect, type BlockPlan } from './agents/section-architect';
import { BlockGeneratorRegistry, type BlockGeneratorContext } from './blocks/generators';

const log = createLogger('BookCompiler');

// ---------------------------------------------------------------------------
// Compiler options
// ---------------------------------------------------------------------------

export interface CompilerOptions {
  /** Persist page after each block (incremental) */
  persistAfterEachBlock: boolean;
  /** Enable LLM-based block planning (false = static templates) */
  architectLLMEnabled: boolean;
  /** Language for content generation */
  language: string;
}

const DEFAULT_OPTIONS: CompilerOptions = {
  persistAfterEachBlock: true,
  architectLLMEnabled: true,
  language: 'zh',
};

// ---------------------------------------------------------------------------
// BookCompiler class
// ---------------------------------------------------------------------------

export class BookCompiler {
  private storage: BookStorage;
  private architect: SectionArchitect;
  private registry: BlockGeneratorRegistry;
  private options: CompilerOptions;

  constructor(
    storage: BookStorage,
    architect: SectionArchitect,
    registry: BlockGeneratorRegistry,
    options?: Partial<CompilerOptions>,
  ) {
    this.storage = storage;
    this.architect = architect;
    this.registry = registry;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Compile a single page: plan blocks → generate each → persist.
   * Streams progress via BookStream.
   */
  async compilePage(
    bookId: string,
    page: Page,
    chapter: Chapter,
    stream?: BookStream,
  ): Promise<Page> {
    stream?.emitPageCompileStarted(page.id, page.title);

    // Update page status
    page.status = 'planning';
    await this.storage.savePage(bookId, page);

    // Step 1: Plan blocks
    let blockPlans: BlockPlan[];
    try {
      blockPlans = this.options.architectLLMEnabled
        ? await this.architect.planBlocks(chapter, this.options.language)
        : await this.architect.planBlocks(chapter, this.options.language); // fallback is inside planBlocks
    } catch (err) {
      log.error(`Planning failed for page ${page.id}:`, err);
      page.status = 'error';
      await this.storage.savePage(bookId, page);
      stream?.emitError(`Planning failed: ${err instanceof Error ? err.message : String(err)}`);
      return page;
    }

    stream?.emitPagePlanned(page.id, blockPlans.length);

    // Step 2: Generate each block
    page.status = 'generating';
    page.blocks = [];

    const ctx: BlockGeneratorContext = {
      chapter,
      pageIndex: page.chapterOrder,
      language: this.options.language,
      siblingBlocks: page.blocks,
    };

    let readyCount = 0;
    let errorCount = 0;

    for (const plan of blockPlans) {
      stream?.emitBlockStarted('', plan.type, page.id);

      const block = await this.registry.generateBlock(plan.type, {
        ...plan.params,
        focus: plan.focus,
      }, ctx);

      // Add bridge text if specified
      if (plan.transitionIn) {
        block.metadata.transitionIn = plan.transitionIn;
      }

      page.blocks.push(block);

      if (block.status === 'ready') {
        readyCount++;
        stream?.emitBlockReady(block.id, block.type, page.id);
      } else {
        errorCount++;
        stream?.emitBlockError(block.id, block.type, 'generation failed');
      }

      // Incremental persistence
      if (this.options.persistAfterEachBlock) {
        await this.storage.savePage(bookId, page);
      }

      // Update sibling context
      ctx.siblingBlocks = [...page.blocks];
    }

    // Step 3: Finalize page status
    if (errorCount === 0) {
      page.status = 'ready';
    } else if (readyCount > 0) {
      page.status = 'partial';
    } else {
      page.status = 'error';
    }

    await this.storage.savePage(bookId, page);
    stream?.emitPageCompiled(page.id, page.blocks.length);

    log.info(
      `Compiled page ${page.id}: ${readyCount} ready, ${errorCount} errors`,
    );

    return page;
  }

  /**
   * Create and compile a page for a chapter.
   */
  async createAndCompile(
    bookId: string,
    chapter: Chapter,
    stream?: BookStream,
  ): Promise<Page> {
    const page = createPage({
      id: generatePageId(),
      chapterOrder: chapter.order,
      title: chapter.title,
      status: 'pending',
    });

    // Register page ID in chapter
    chapter.pageIds = [...(chapter.pageIds || []), page.id];

    await this.storage.savePage(bookId, page);
    return this.compilePage(bookId, page, chapter, stream);
  }

  /**
   * Regenerate a single block on a page.
   */
  async regenerateBlock(
    bookId: string,
    pageId: string,
    blockIndex: number,
    chapter: Chapter,
    stream?: BookStream,
  ): Promise<Page | null> {
    const page = await this.storage.loadPage(bookId, pageId);
    if (!page || blockIndex >= page.blocks.length) return null;

    const block = page.blocks[blockIndex];
    stream?.emitBlockStarted(block.id, block.type, page.id);

    const ctx: BlockGeneratorContext = {
      chapter,
      pageIndex: page.chapterOrder,
      language: this.options.language,
      siblingBlocks: page.blocks,
    };

    const newBlock = await this.registry.generateBlock(
      block.type,
      block.params,
      ctx,
    );

    page.blocks[blockIndex] = newBlock;
    await this.storage.savePage(bookId, page);

    if (newBlock.status === 'ready') {
      stream?.emitBlockReady(newBlock.id, newBlock.type, page.id);
    } else {
      stream?.emitBlockError(newBlock.id, newBlock.type, 'regeneration failed');
    }

    return page;
  }

  /**
   * Compile all pending pages for a book.
   */
  async compileAllPages(
    bookId: string,
    stream?: BookStream,
  ): Promise<{ compiled: number; errors: number }> {
    const book = await this.storage.loadManifest(bookId);
    if (!book?.spine) return { compiled: 0, errors: 0 };

    const pages = await this.storage.loadAllPages(bookId);
    let compiled = 0;
    let errors = 0;

    for (const page of pages) {
      if (page.status !== 'pending' && page.status !== 'error') continue;

      const chapter = book.spine.chapters.find(
        (ch) => ch.order === page.chapterOrder,
      );
      if (!chapter) continue;

      const result = await this.compilePage(bookId, page, chapter, stream);
      if (result.status === 'ready') {
        compiled++;
      } else {
        errors++;
      }
    }

    return { compiled, errors };
  }
}
