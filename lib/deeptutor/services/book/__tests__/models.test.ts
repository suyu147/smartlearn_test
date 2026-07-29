/**
 * Unit tests for Book Engine core data models.
 * Tests factory functions, default values, and type constraints.
 */

import { describe, it, expect } from 'vitest';
import {
  createBook,
  createPage,
  createBlock,
  createSpine,
  createChapter,
  createConceptGraph,
  createBookProposal,
  createBookInputs,
  createProgress,
  BOOK_STATUSES,
  PAGE_STATUSES,
  BLOCK_STATUSES,
  BLOCK_TYPES,
  CONTENT_TYPES,
} from '../models';

// ---------------------------------------------------------------------------
// Status / Type constants
// ---------------------------------------------------------------------------

describe('Status constants', () => {
  it('BOOK_STATUSES has 6 values', () => {
    expect(BOOK_STATUSES).toHaveLength(6);
    expect(BOOK_STATUSES).toContain('draft');
    expect(BOOK_STATUSES).toContain('ready');
    expect(BOOK_STATUSES).toContain('archived');
  });

  it('PAGE_STATUSES has 6 values', () => {
    expect(PAGE_STATUSES).toHaveLength(6);
    expect(PAGE_STATUSES).toContain('pending');
    expect(PAGE_STATUSES).toContain('ready');
    expect(PAGE_STATUSES).toContain('error');
  });

  it('BLOCK_STATUSES has 5 values', () => {
    expect(BLOCK_STATUSES).toHaveLength(5);
    expect(BLOCK_STATUSES).toContain('pending');
    expect(BLOCK_STATUSES).toContain('hidden');
  });

  it('BLOCK_TYPES has 13 values', () => {
    expect(BLOCK_TYPES).toHaveLength(13);
    expect(BLOCK_TYPES).toContain('text');
    expect(BLOCK_TYPES).toContain('quiz');
    expect(BLOCK_TYPES).toContain('concept_graph');
    expect(BLOCK_TYPES).toContain('user_note');
    expect(BLOCK_TYPES).toContain('deep_dive');
  });

  it('CONTENT_TYPES has 6 values', () => {
    expect(CONTENT_TYPES).toHaveLength(6);
    expect(CONTENT_TYPES).toContain('theory');
    expect(CONTENT_TYPES).toContain('concept');
    expect(CONTENT_TYPES).toContain('overview');
  });
});

// ---------------------------------------------------------------------------
// ConceptGraph
// ---------------------------------------------------------------------------

describe('createConceptGraph', () => {
  it('creates empty graph by default', () => {
    const graph = createConceptGraph();
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it('accepts partial overrides', () => {
    const graph = createConceptGraph({
      nodes: [{ id: 'n1', label: 'Node 1' }],
      edges: [{ source: 'n1', target: 'n2', relation: 'depends_on' }],
    });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].relation).toBe('depends_on');
  });
});

// ---------------------------------------------------------------------------
// Chapter
// ---------------------------------------------------------------------------

describe('createChapter', () => {
  it('creates chapter with sensible defaults', () => {
    const ch = createChapter();
    expect(ch.order).toBe(0);
    expect(ch.title).toBe('');
    expect(ch.contentType).toBe('concept');
    expect(ch.learningObjectives).toEqual([]);
    expect(ch.sourceAnchors).toEqual([]);
    expect(ch.prerequisites).toEqual([]);
    expect(ch.pageIds).toEqual([]);
    expect(ch.summary).toBe('');
  });

  it('overrides defaults with partial data', () => {
    const ch = createChapter({
      order: 3,
      title: 'Advanced Topics',
      contentType: 'practice',
      learningObjectives: ['LO1', 'LO2'],
    });
    expect(ch.order).toBe(3);
    expect(ch.title).toBe('Advanced Topics');
    expect(ch.contentType).toBe('practice');
    expect(ch.learningObjectives).toHaveLength(2);
    // Non-overridden fields keep defaults
    expect(ch.pageIds).toEqual([]);
    expect(ch.summary).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Spine
// ---------------------------------------------------------------------------

describe('createSpine', () => {
  it('creates spine with empty defaults', () => {
    const spine = createSpine();
    expect(spine.title).toBe('');
    expect(spine.chapters).toEqual([]);
    expect(spine.explorationSummary).toBe('');
    expect(spine.conceptGraph).toBeDefined();
    expect(spine.conceptGraph.nodes).toEqual([]);
  });

  it('composes chapters and concept graph', () => {
    const spine = createSpine({
      title: 'My Book',
      chapters: [
        createChapter({ order: 1, title: 'Intro' }),
        createChapter({ order: 2, title: 'Core' }),
      ],
      conceptGraph: createConceptGraph({
        nodes: [{ id: 'c1', label: 'Intro' }],
      }),
    });
    expect(spine.chapters).toHaveLength(2);
    expect(spine.conceptGraph.nodes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

describe('createBlock', () => {
  it('creates block with default type=text, status=pending', () => {
    const block = createBlock();
    expect(block.id).toBe('');
    expect(block.type).toBe('text');
    expect(block.status).toBe('pending');
    expect(block.params).toEqual({});
    expect(block.payload).toEqual({});
    expect(block.sourceAnchors).toEqual([]);
    expect(block.metadata).toEqual({});
  });

  it('accepts overrides for all fields', () => {
    const block = createBlock({
      id: 'b1',
      type: 'quiz',
      status: 'ready',
      params: { questionCount: 5 },
      payload: { questions: [] },
    });
    expect(block.id).toBe('b1');
    expect(block.type).toBe('quiz');
    expect(block.status).toBe('ready');
    expect(block.params.questionCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

describe('createPage', () => {
  it('creates page with default status=pending', () => {
    const page = createPage();
    expect(page.id).toBe('');
    expect(page.chapterOrder).toBe(0);
    expect(page.title).toBe('');
    expect(page.status).toBe('pending');
    expect(page.blocks).toEqual([]);
    expect(page.links).toEqual([]);
    expect(page.metadata).toEqual({});
  });

  it('supports nested blocks', () => {
    const page = createPage({
      id: 'p1',
      title: 'Chapter 1',
      blocks: [
        createBlock({ id: 'b1', type: 'section', status: 'ready' }),
        createBlock({ id: 'b2', type: 'text', status: 'ready' }),
      ],
    });
    expect(page.blocks).toHaveLength(2);
    expect(page.blocks[0].type).toBe('section');
  });
});

// ---------------------------------------------------------------------------
// BookProposal
// ---------------------------------------------------------------------------

describe('createBookProposal', () => {
  it('creates proposal with defaults', () => {
    const proposal = createBookProposal();
    expect(proposal.title).toBe('');
    expect(proposal.description).toBe('');
    expect(proposal.targetLevel).toBe('intermediate');
    expect(proposal.estimatedChapters).toBe(5);
  });

  it('accepts partial override', () => {
    const proposal = createBookProposal({
      title: 'Learn TypeScript',
      estimatedChapters: 10,
    });
    expect(proposal.title).toBe('Learn TypeScript');
    expect(proposal.estimatedChapters).toBe(10);
    expect(proposal.targetLevel).toBe('intermediate');
  });
});

// ---------------------------------------------------------------------------
// BookInputs
// ---------------------------------------------------------------------------

describe('createBookInputs', () => {
  it('creates inputs with defaults', () => {
    const inputs = createBookInputs();
    expect(inputs.userIntent).toBe('');
    expect(inputs.chatSelections).toEqual([]);
    expect(inputs.notebookRefs).toEqual([]);
    expect(inputs.knowledgeBases).toEqual([]);
    expect(inputs.createdAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

describe('createProgress', () => {
  it('creates progress with zero score', () => {
    const progress = createProgress();
    expect(progress.currentPageId).toBe('');
    expect(progress.visitedPageIds).toEqual([]);
    expect(progress.bookmarks).toEqual([]);
    expect(progress.quizAttempts).toEqual([]);
    expect(progress.weakChapters).toEqual([]);
    expect(progress.score).toBe(0);
  });

  it('records quiz attempts', () => {
    const progress = createProgress({
      quizAttempts: [
        { blockId: 'b1', pageId: 'p1', score: 80, timestamp: '2026-01-01' },
      ],
      score: 80,
    });
    expect(progress.quizAttempts).toHaveLength(1);
    expect(progress.score).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// Book
// ---------------------------------------------------------------------------

describe('createBook', () => {
  it('creates book with draft status and null proposal/spine', () => {
    const book = createBook();
    expect(book.id).toBe('');
    expect(book.status).toBe('draft');
    expect(book.proposal).toBeNull();
    expect(book.spine).toBeNull();
    expect(book.inputs).toBeNull();
    expect(book.kbFingerprints).toEqual([]);
    expect(book.stalePageIds).toEqual([]);
    expect(book.createdAt).toBeTruthy();
    expect(book.updatedAt).toBeTruthy();
  });

  it('sets createdAt and updatedAt to current time', () => {
    const before = new Date().toISOString();
    const book = createBook();
    const after = new Date().toISOString();
    expect(book.createdAt >= before).toBe(true);
    expect(book.createdAt <= after).toBe(true);
  });

  it('accepts id and status override', () => {
    const book = createBook({ id: 'book_123', status: 'ready' });
    expect(book.id).toBe('book_123');
    expect(book.status).toBe('ready');
  });

  it('progress is a valid Progress object', () => {
    const book = createBook();
    expect(book.progress).toBeDefined();
    expect(book.progress.score).toBe(0);
    expect(book.progress.visitedPageIds).toEqual([]);
  });
});
