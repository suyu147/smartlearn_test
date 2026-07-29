/**
 * Book Engine — Core Data Models
 *
 * Ported from DeepTutor Python deeptutor/book/models.py.
 * All Pydantic models → TypeScript interfaces with factory functions.
 */

// ---------------------------------------------------------------------------
// Status Enums (union types)
// ---------------------------------------------------------------------------

export const BOOK_STATUSES = [
  'draft',
  'spine_ready',
  'compiling',
  'ready',
  'error',
  'archived',
] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const PAGE_STATUSES = [
  'pending',
  'planning',
  'generating',
  'ready',
  'partial',
  'error',
] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

export const BLOCK_STATUSES = [
  'pending',
  'generating',
  'ready',
  'error',
  'hidden',
] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

// ---------------------------------------------------------------------------
// BlockType — 13 block types
// ---------------------------------------------------------------------------

export const BLOCK_TYPES = [
  'text',
  'section',
  'callout',
  'quiz',
  'figure',
  'interactive',
  'animation',
  'code',
  'timeline',
  'flash_cards',
  'deep_dive',
  'concept_graph',
  'user_note',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

// ---------------------------------------------------------------------------
// ContentType — drives template selection in SectionArchitect
// ---------------------------------------------------------------------------

export const CONTENT_TYPES = [
  'theory',
  'derivation',
  'history',
  'practice',
  'concept',
  'overview',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// ---------------------------------------------------------------------------
// ConceptGraph
// ---------------------------------------------------------------------------

export interface ConceptNode {
  id: string;
  label: string;
  description?: string;
  chapter?: number;
}

export interface ConceptEdge {
  source: string;
  target: string;
  relation: 'depends_on' | 'extends' | 'related';
}

export interface ConceptGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

export function createConceptGraph(
  partial: Partial<ConceptGraph> = {},
): ConceptGraph {
  return { nodes: [], edges: [], ...partial };
}

// ---------------------------------------------------------------------------
// Chapter
// ---------------------------------------------------------------------------

export interface Chapter {
  order: number;
  title: string;
  learningObjectives: string[];
  contentType: ContentType;
  sourceAnchors: string[];
  prerequisites: string[];
  pageIds: string[];
  summary: string;
}

export function createChapter(partial: Partial<Chapter> = {}): Chapter {
  return {
    order: 0,
    title: '',
    learningObjectives: [],
    contentType: 'concept',
    sourceAnchors: [],
    prerequisites: [],
    pageIds: [],
    summary: '',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Spine — Chapter tree + ConceptGraph
// ---------------------------------------------------------------------------

export interface Spine {
  title: string;
  chapters: Chapter[];
  conceptGraph: ConceptGraph;
  explorationSummary: string;
  mindMap?: string; // Mermaid markdown
}

export function createSpine(partial: Partial<Spine> = {}): Spine {
  return {
    title: '',
    chapters: [],
    conceptGraph: createConceptGraph(),
    explorationSummary: '',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

export interface Block {
  id: string;
  type: BlockType;
  status: BlockStatus;
  /** Generator input parameters */
  params: Record<string, unknown>;
  /** Generated output payload */
  payload: Record<string, unknown>;
  sourceAnchors: string[];
  metadata: Record<string, unknown>;
}

export function createBlock(partial: Partial<Block> = {}): Block {
  return {
    id: '',
    type: 'text',
    status: 'pending',
    params: {},
    payload: {},
    sourceAnchors: [],
    metadata: {},
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// PageLink — cross-reference to another page
// ---------------------------------------------------------------------------

export interface PageLink {
  pageId: string;
  label: string;
  kind: 'next' | 'prev' | 'deep_dive' | 'related';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export interface Page {
  id: string;
  chapterOrder: number;
  title: string;
  status: PageStatus;
  blocks: Block[];
  links: PageLink[];
  parentPageId?: string; // for deep-dive sub-pages
  metadata: Record<string, unknown>;
}

export function createPage(partial: Partial<Page> = {}): Page {
  return {
    id: '',
    chapterOrder: 0,
    title: '',
    status: 'pending',
    blocks: [],
    links: [],
    metadata: {},
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// BookProposal — Stage 1 output (IdeationAgent)
// ---------------------------------------------------------------------------

export interface BookProposal {
  title: string;
  description: string;
  scope: string;
  targetLevel: string;
  estimatedChapters: number;
  rationale: string;
}

export function createBookProposal(
  partial: Partial<BookProposal> = {},
): BookProposal {
  return {
    title: '',
    description: '',
    scope: '',
    targetLevel: 'intermediate',
    estimatedChapters: 5,
    rationale: '',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// BookInputs — Snapshot of four source channels
// ---------------------------------------------------------------------------

export interface BookInputs {
  userIntent: string;
  chatSelections: string[]; // message IDs or summaries
  notebookRefs: string[]; // notebook IDs
  knowledgeBases: string[]; // KB names
  questionCategories: string[];
  questionEntries: string[]; // quiz result summaries
  createdAt: string;
}

export function createBookInputs(
  partial: Partial<BookInputs> = {},
): BookInputs {
  return {
    userIntent: '',
    chatSelections: [],
    notebookRefs: [],
    knowledgeBases: [],
    questionCategories: [],
    questionEntries: [],
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Progress — Reader progress tracking
// ---------------------------------------------------------------------------

export interface QuizAttempt {
  blockId: string;
  pageId: string;
  score: number;
  timestamp: string;
}

export interface Progress {
  currentPageId: string;
  visitedPageIds: string[];
  bookmarks: string[];
  quizAttempts: QuizAttempt[];
  weakChapters: number[];
  score: number;
}

export function createProgress(partial: Partial<Progress> = {}): Progress {
  return {
    currentPageId: '',
    visitedPageIds: [],
    bookmarks: [],
    quizAttempts: [],
    weakChapters: [],
    score: 0,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// KB Fingerprint — for drift detection
// ---------------------------------------------------------------------------

export interface KBFingerprint {
  kbName: string;
  hash: string;
  fileCount: number;
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Book — Top-level manifest
// ---------------------------------------------------------------------------

export interface Book {
  id: string;
  status: BookStatus;
  proposal: BookProposal | null;
  inputs: BookInputs | null;
  spine: Spine | null;
  progress: Progress;
  kbFingerprints: KBFingerprint[];
  stalePageIds: string[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export function createBook(partial: Partial<Book> = {}): Book {
  const now = new Date().toISOString();
  return {
    id: '',
    status: 'draft',
    proposal: null,
    inputs: null,
    spine: null,
    progress: createProgress(),
    kbFingerprints: [],
    stalePageIds: [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Summary view (for list endpoints)
// ---------------------------------------------------------------------------

export interface BookSummary {
  id: string;
  title: string;
  status: BookStatus;
  chapterCount: number;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
}
