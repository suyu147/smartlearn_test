/**
 * BookEngine — Main orchestrator for the 4-stage book pipeline
 *
 * Ported from DeepTutor Python deeptutor/book/engine.py.
 *
 * Stages:
 *   1. create_book      → IdeationAgent → BookProposal (DRAFT)
 *   2. confirm_proposal → SpineSynthesizer → Spine (SPINE_READY)
 *   2.5 confirm_spine   → Create PENDING page shells
 *   3. compile_page     → BookCompiler → blocks (COMPILING → READY)
 */

import { createLogger } from '@/lib/logger';
import type {
  Book,
  BookProposal,
  BookInputs,
  Spine,
  Page,
  Chapter,
  Block,
  BookStatus,
} from './models';
import { createBook, createSpine, createPage, createProgress, createChapter } from './models';
import { BookStorage, generatePageId } from './storage';
import { BookStream } from './stream';
import { IdeationAgent } from './agents/ideation-agent';
import { SpineSynthesizer } from './agents/spine-synthesizer';
import { SectionArchitect } from './agents/section-architect';
import { BookCompiler, type CompilerOptions } from './compiler';
import { BlockGeneratorRegistry } from './blocks/generators';
import type { StreamEventCallback } from '@/lib/deeptutor/core/stream-bus';

const log = createLogger('BookEngine');

// ---------------------------------------------------------------------------
// LLM config shared across agents
// ---------------------------------------------------------------------------

export interface BookEngineConfig {
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  language?: string;
  compiler?: Partial<CompilerOptions>;
}

// ---------------------------------------------------------------------------
// BookEngine class
// ---------------------------------------------------------------------------

export class BookEngine {
  private storage: BookStorage;
  private ideationAgent: IdeationAgent;
  private spineSynthesizer: SpineSynthesizer;
  private sectionArchitect: SectionArchitect;
  private blockRegistry: BlockGeneratorRegistry;
  private compiler: BookCompiler;
  private config: BookEngineConfig;

  constructor(storage: BookStorage, config?: BookEngineConfig) {
    this.config = config ?? {};
    this.storage = storage;

    const agentConfig = {
      providerId: config?.providerId,
      modelId: config?.modelId,
      apiKey: config?.apiKey,
      baseUrl: config?.baseUrl,
    };

    this.ideationAgent = new IdeationAgent(agentConfig);
    this.spineSynthesizer = new SpineSynthesizer(agentConfig);
    this.sectionArchitect = new SectionArchitect(agentConfig);
    this.blockRegistry = new BlockGeneratorRegistry(agentConfig);
    this.compiler = new BookCompiler(
      storage,
      this.sectionArchitect,
      this.blockRegistry,
      { language: config?.language ?? 'zh', ...config?.compiler },
    );
  }

  // -----------------------------------------------------------------------
  // Stage 1: Create Book (Ideation)
  // -----------------------------------------------------------------------

  async createBook(
    userIntent: string,
    inputs?: Partial<BookInputs>,
    callback?: StreamEventCallback,
  ): Promise<Book> {
    const stream = callback ? new BookStream(callback) : undefined;
    const endStage = stream?.enterStage('ideation');

    try {
      const language = this.config.language ?? 'zh';

      // Build inputs
      const bookInputs: BookInputs = {
        userIntent,
        chatSelections: inputs?.chatSelections ?? [],
        notebookRefs: inputs?.notebookRefs ?? [],
        knowledgeBases: inputs?.knowledgeBases ?? [],
        questionCategories: inputs?.questionCategories ?? [],
        questionEntries: inputs?.questionEntries ?? [],
        createdAt: new Date().toISOString(),
      };

      // Generate proposal
      const proposal = await this.ideationAgent.generate(
        userIntent,
        bookInputs,
        language,
      );

      // Create book record
      const book = await this.storage.createBook(proposal, bookInputs);

      stream?.emitProposalReady({
        bookId: book.id,
        title: proposal.title,
        description: proposal.description,
        estimatedChapters: proposal.estimatedChapters,
      });

      await this.storage.appendLog(book.id, 'create_book', 'ok', proposal.title);

      return book;
    } finally {
      endStage?.();
    }
  }

  // -----------------------------------------------------------------------
  // Stage 2: Confirm Proposal → Generate Spine
  // -----------------------------------------------------------------------

  async confirmProposal(
    bookId: string,
    callback?: StreamEventCallback,
  ): Promise<{ book: Book; spine: Spine }> {
    const stream = callback ? new BookStream(callback) : undefined;
    const endStage = stream?.enterStage('synthesis');

    try {
      const book = await this.storage.loadManifest(bookId);
      if (!book) throw new Error(`Book ${bookId} not found`);
      if (!book.proposal) throw new Error('Book has no proposal');

      const language = this.config.language ?? 'zh';

      // Synthesize spine (Draft → Critique → Revise)
      const spine = await this.spineSynthesizer.synthesize(
        book.proposal,
        book.inputs?.userIntent,
        language,
        (round, verdict) => {
          stream?.emitSpineRound(round, verdict);
        },
      );

      // Save spine
      await this.storage.saveSpine(bookId, spine);
      book.spine = spine;
      book.status = 'spine_ready';
      await this.storage.saveManifest(book);

      stream?.emitSpineReady(spine.chapters.length);
      await this.storage.appendLog(
        bookId,
        'confirm_proposal',
        'ok',
        `${spine.chapters.length} chapters`,
      );

      return { book, spine };
    } finally {
      endStage?.();
    }
  }

  // -----------------------------------------------------------------------
  // Stage 2.5: Confirm Spine → Create Page Shells + Overview
  // -----------------------------------------------------------------------

  async confirmSpine(
    bookId: string,
    callback?: StreamEventCallback,
  ): Promise<{ book: Book; pages: Page[] }> {
    const stream = callback ? new BookStream(callback) : undefined;
    const endStage = stream?.enterStage('spine');

    try {
      const book = await this.storage.loadManifest(bookId);
      if (!book) throw new Error(`Book ${bookId} not found`);
      if (!book.spine) throw new Error('Book has no spine');

      const pages: Page[] = [];

      // Create overview page (deterministic, no LLM)
      const overviewPage = await this.createOverviewPage(bookId, book.spine);
      pages.push(overviewPage);
      stream?.emitOverviewReady(overviewPage.id);

      // Create PENDING page shells for each chapter
      for (const chapter of book.spine.chapters) {
        const page = createPage({
          id: generatePageId(),
          chapterOrder: chapter.order,
          title: chapter.title,
          status: 'pending',
        });

        // Register page ID in chapter
        chapter.pageIds = [...(chapter.pageIds || []), page.id];

        await this.storage.savePage(bookId, page);
        pages.push(page);
      }

      // Save updated spine (with pageIds)
      await this.storage.saveSpine(bookId, book.spine);
      book.status = 'spine_ready';
      await this.storage.saveManifest(book);

      await this.storage.appendLog(
        bookId,
        'confirm_spine',
        'ok',
        `${pages.length} pages created`,
      );

      return { book, pages };
    } finally {
      endStage?.();
    }
  }

  // -----------------------------------------------------------------------
  // Stage 3-4: Compile a single page
  // -----------------------------------------------------------------------

  async compilePage(
    bookId: string,
    pageId: string,
    callback?: StreamEventCallback,
  ): Promise<Page | null> {
    const stream = callback ? new BookStream(callback) : undefined;

    const book = await this.storage.loadManifest(bookId);
    if (!book?.spine) return null;

    const page = await this.storage.loadPage(bookId, pageId);
    if (!page) return null;

    const chapter = book.spine.chapters.find(
      (ch) => ch.order === page.chapterOrder,
    );
    if (!chapter) return null;

    // Update book status to compiling
    if (book.status === 'spine_ready') {
      book.status = 'compiling';
      await this.storage.saveManifest(book);
    }

    const result = await this.compiler.compilePage(
      bookId,
      page,
      chapter,
      stream,
    );

    // Check if all pages are ready
    await this.maybeFinalizeBook(bookId);

    return result;
  }

  // -----------------------------------------------------------------------
  // Regenerate a single block
  // -----------------------------------------------------------------------

  async regenerateBlock(
    bookId: string,
    pageId: string,
    blockIndex: number,
    callback?: StreamEventCallback,
  ): Promise<Page | null> {
    const stream = callback ? new BookStream(callback) : undefined;

    const book = await this.storage.loadManifest(bookId);
    if (!book?.spine) return null;

    const page = await this.storage.loadPage(bookId, pageId);
    if (!page) return null;

    const chapter = book.spine.chapters.find(
      (ch) => ch.order === page.chapterOrder,
    );
    if (!chapter) return null;

    return this.compiler.regenerateBlock(
      bookId,
      pageId,
      blockIndex,
      chapter,
      stream,
    );
  }

  // -----------------------------------------------------------------------
  // Compile all pending pages
  // -----------------------------------------------------------------------

  async compileAll(
    bookId: string,
    callback?: StreamEventCallback,
  ): Promise<{ compiled: number; errors: number }> {
    const stream = callback ? new BookStream(callback) : undefined;

    const book = await this.storage.loadManifest(bookId);
    if (!book) throw new Error(`Book ${bookId} not found`);

    book.status = 'compiling';
    await this.storage.saveManifest(book);

    const result = await this.compiler.compileAllPages(bookId, stream);

    await this.maybeFinalizeBook(bookId);

    return result;
  }

  // -----------------------------------------------------------------------
  // Block CRUD operations
  // -----------------------------------------------------------------------

  async insertBlock(
    bookId: string,
    pageId: string,
    index: number,
    type: Block['type'],
    params: Record<string, unknown>,
    callback?: StreamEventCallback,
  ): Promise<Page | null> {
    const stream = callback ? new BookStream(callback) : undefined;

    const book = await this.storage.loadManifest(bookId);
    if (!book?.spine) return null;

    const page = await this.storage.loadPage(bookId, pageId);
    if (!page) return null;

    const chapter = book.spine.chapters.find(
      (ch) => ch.order === page.chapterOrder,
    );
    if (!chapter) return null;

    // Generate the new block
    const ctx = {
      chapter,
      pageIndex: page.chapterOrder,
      language: this.config.language ?? 'zh',
      siblingBlocks: page.blocks,
    };

    const block = await this.blockRegistry.generateBlock(type, params, ctx);

    // Insert at index
    page.blocks.splice(Math.min(index, page.blocks.length), 0, block);
    await this.storage.savePage(bookId, page);

    stream?.emitBlockReady(block.id, block.type, page.id);
    return page;
  }

  async deleteBlock(
    bookId: string,
    pageId: string,
    blockIndex: number,
  ): Promise<Page | null> {
    const page = await this.storage.loadPage(bookId, pageId);
    if (!page || blockIndex >= page.blocks.length) return null;

    page.blocks.splice(blockIndex, 1);
    await this.storage.savePage(bookId, page);
    return page;
  }

  async moveBlock(
    bookId: string,
    pageId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<Page | null> {
    const page = await this.storage.loadPage(bookId, pageId);
    if (!page) return null;
    if (fromIndex < 0 || fromIndex >= page.blocks.length) return null;

    const [block] = page.blocks.splice(fromIndex, 1);
    page.blocks.splice(Math.min(toIndex, page.blocks.length), 0, block);
    await this.storage.savePage(bookId, page);
    return page;
  }

  // -----------------------------------------------------------------------
  // Progress tracking
  // -----------------------------------------------------------------------

  async recordQuizAttempt(
    bookId: string,
    pageId: string,
    blockId: string,
    score: number,
  ): Promise<void> {
    const progress = await this.storage.loadProgress(bookId);
    progress.quizAttempts.push({
      blockId,
      pageId,
      score,
      timestamp: new Date().toISOString(),
    });

    // Track weak chapters
    if (score < 0.5) {
      const page = await this.storage.loadPage(bookId, pageId);
      if (page && !progress.weakChapters.includes(page.chapterOrder)) {
        progress.weakChapters.push(page.chapterOrder);
      }
    }

    // Update overall score
    const total = progress.quizAttempts.reduce((s, a) => s + a.score, 0);
    progress.score = total / progress.quizAttempts.length;

    await this.storage.saveProgress(bookId, progress);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async createOverviewPage(
    bookId: string,
    spine: Spine,
  ): Promise<Page> {
    // Build deterministic overview content
    const chapterList = spine.chapters
      .map((ch) => `${ch.order + 1}. **${ch.title}** — ${ch.summary}`)
      .join('\n');

    // Build Mermaid concept graph
    let mermaid = 'graph TD\n';
    for (const node of spine.conceptGraph.nodes) {
      mermaid += `  ${node.id}["${node.label}"]\n`;
    }
    for (const edge of spine.conceptGraph.edges) {
      const arrow = edge.relation === 'depends_on' ? '-->' : edge.relation === 'extends' ? '-.->' : '---';
      mermaid += `  ${edge.source} ${arrow} ${edge.target}\n`;
    }

    const overviewBlocks: Block[] = [
      {
        id: generatePageId(),
        type: 'text',
        status: 'ready',
        params: {},
        payload: {
          content: `# ${spine.title}\n\n${spine.explorationSummary || 'Welcome to this book. Use the chapter navigation to explore each topic.'}`,
        },
        sourceAnchors: [],
        metadata: {},
      },
      {
        id: generatePageId(),
        type: 'concept_graph',
        status: 'ready',
        params: {},
        payload: {
          mermaid,
          nodeCount: spine.conceptGraph.nodes.length,
          edgeCount: spine.conceptGraph.edges.length,
        },
        sourceAnchors: [],
        metadata: {},
      },
      {
        id: generatePageId(),
        type: 'text',
        status: 'ready',
        params: {},
        payload: {
          content: `## Chapters\n\n${chapterList}`,
        },
        sourceAnchors: [],
        metadata: {},
      },
    ];

    const page = createPage({
      id: generatePageId(),
      chapterOrder: -1, // Overview is before all chapters
      title: 'Overview',
      status: 'ready',
      blocks: overviewBlocks,
    });

    await this.storage.savePage(bookId, page);
    return page;
  }

  private async maybeFinalizeBook(bookId: string): Promise<void> {
    const pages = await this.storage.loadAllPages(bookId);
    const pendingPages = pages.filter(
      (p) => p.status === 'pending' || p.status === 'generating' || p.status === 'planning',
    );

    if (pendingPages.length === 0) {
      const book = await this.storage.loadManifest(bookId);
      if (book) {
        book.status = 'ready';
        await this.storage.saveManifest(book);
        await this.storage.appendLog(bookId, 'finalize', 'ok', 'All pages compiled');
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public: get storage reference
  // -----------------------------------------------------------------------

  getStorage(): BookStorage {
    return this.storage;
  }
}
