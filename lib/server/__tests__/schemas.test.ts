/**
 * Unit tests for Zod API schemas and validate helper.
 */

import { describe, it, expect } from 'vitest';
import {
  BookCreateSchema,
  BookIdBodySchema,
  BookCompilePageSchema,
  BookRegenerateBlockSchema,
  BookInsertBlockSchema,
  BookDeleteBlockSchema,
  BookMoveBlockSchema,
  CoWriterCreateSchema,
  CoWriterUpdateSchema,
  CoWriterEditSchema,
  TurnCreateSchema,
  SmartLearnRequestSchema,
  SmartLearnEvaluateSchema,
  KnowledgeCreateSchema,
  HistoryQuerySchema,
} from '../schemas';

// ---------------------------------------------------------------------------
// Book schemas
// ---------------------------------------------------------------------------

describe('BookCreateSchema', () => {
  it('accepts valid input', () => {
    const result = BookCreateSchema.safeParse({
      userIntent: 'Learn TypeScript basics',
    });
    expect(result.success).toBe(true);
  });

  it('accepts with all optional fields', () => {
    const result = BookCreateSchema.safeParse({
      userIntent: 'Learn TypeScript',
      chatSelections: ['msg1', 'msg2'],
      notebookRefs: ['nb1'],
      knowledgeBases: ['kb1'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing userIntent', () => {
    const result = BookCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty userIntent', () => {
    const result = BookCreateSchema.safeParse({ userIntent: '' });
    expect(result.success).toBe(false);
  });

  it('rejects non-string userIntent', () => {
    const result = BookCreateSchema.safeParse({ userIntent: 123 });
    expect(result.success).toBe(false);
  });
});

describe('BookIdBodySchema', () => {
  it('accepts valid bookId', () => {
    expect(BookIdBodySchema.safeParse({ bookId: 'book_123' }).success).toBe(true);
  });

  it('rejects missing bookId', () => {
    expect(BookIdBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects empty bookId', () => {
    expect(BookIdBodySchema.safeParse({ bookId: '' }).success).toBe(false);
  });
});

describe('BookCompilePageSchema', () => {
  it('accepts valid bookId and pageId', () => {
    const result = BookCompilePageSchema.safeParse({
      bookId: 'book_1',
      pageId: 'page_2',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing pageId', () => {
    const result = BookCompilePageSchema.safeParse({ bookId: 'book_1' });
    expect(result.success).toBe(false);
  });
});

describe('BookRegenerateBlockSchema', () => {
  it('accepts valid input with blockIndex=0', () => {
    const result = BookRegenerateBlockSchema.safeParse({
      bookId: 'b1',
      pageId: 'p1',
      blockIndex: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative blockIndex', () => {
    const result = BookRegenerateBlockSchema.safeParse({
      bookId: 'b1',
      pageId: 'p1',
      blockIndex: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer blockIndex', () => {
    const result = BookRegenerateBlockSchema.safeParse({
      bookId: 'b1',
      pageId: 'p1',
      blockIndex: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('BookInsertBlockSchema', () => {
  it('accepts minimal input', () => {
    const result = BookInsertBlockSchema.safeParse({
      bookId: 'b1',
      pageId: 'p1',
      type: 'text',
    });
    expect(result.success).toBe(true);
  });

  it('accepts with optional index and params', () => {
    const result = BookInsertBlockSchema.safeParse({
      bookId: 'b1',
      pageId: 'p1',
      index: 2,
      type: 'quiz',
      params: { questionCount: 3 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.index).toBe(2);
      expect(result.data.params).toEqual({ questionCount: 3 });
    }
  });

  it('rejects missing type', () => {
    const result = BookInsertBlockSchema.safeParse({
      bookId: 'b1',
      pageId: 'p1',
    });
    expect(result.success).toBe(false);
  });
});

describe('BookDeleteBlockSchema', () => {
  it('accepts valid input', () => {
    expect(
      BookDeleteBlockSchema.safeParse({
        bookId: 'b1',
        pageId: 'p1',
        blockIndex: 0,
      }).success,
    ).toBe(true);
  });

  it('rejects missing blockIndex', () => {
    expect(
      BookDeleteBlockSchema.safeParse({ bookId: 'b1', pageId: 'p1' }).success,
    ).toBe(false);
  });
});

describe('BookMoveBlockSchema', () => {
  it('accepts valid from/to indices', () => {
    expect(
      BookMoveBlockSchema.safeParse({
        bookId: 'b1',
        pageId: 'p1',
        fromIndex: 0,
        toIndex: 2,
      }).success,
    ).toBe(true);
  });

  it('rejects missing toIndex', () => {
    expect(
      BookMoveBlockSchema.safeParse({
        bookId: 'b1',
        pageId: 'p1',
        fromIndex: 0,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Co-Writer schemas
// ---------------------------------------------------------------------------

describe('CoWriterCreateSchema', () => {
  it('accepts title only', () => {
    const result = CoWriterCreateSchema.safeParse({ title: 'My Doc' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('');
    }
  });

  it('accepts content only', () => {
    const result = CoWriterCreateSchema.safeParse({ content: '# Hello' });
    expect(result.success).toBe(true);
  });

  it('accepts both title and content', () => {
    const result = CoWriterCreateSchema.safeParse({
      title: 'Doc',
      content: 'Content here',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty object (no title, no content)', () => {
    const result = CoWriterCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('CoWriterUpdateSchema', () => {
  it('accepts title only', () => {
    expect(CoWriterUpdateSchema.safeParse({ title: 'New Title' }).success).toBe(true);
  });

  it('accepts content only', () => {
    expect(CoWriterUpdateSchema.safeParse({ content: 'Updated' }).success).toBe(true);
  });

  it('rejects empty object', () => {
    expect(CoWriterUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe('CoWriterEditSchema', () => {
  it('accepts valid edit request', () => {
    const result = CoWriterEditSchema.safeParse({
      text: 'Some text to edit',
      action: 'rewrite',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.instruction).toBe('');
    }
  });

  it('accepts all valid actions', () => {
    for (const action of ['rewrite', 'shorten', 'expand', 'summarize']) {
      expect(
        CoWriterEditSchema.safeParse({ text: 'x', action }).success,
      ).toBe(true);
    }
  });

  it('rejects invalid action', () => {
    expect(
      CoWriterEditSchema.safeParse({ text: 'x', action: 'delete' }).success,
    ).toBe(false);
  });

  it('rejects missing text', () => {
    expect(
      CoWriterEditSchema.safeParse({ action: 'rewrite' }).success,
    ).toBe(false);
  });

  it('rejects missing action', () => {
    expect(
      CoWriterEditSchema.safeParse({ text: 'x' }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Turns schema
// ---------------------------------------------------------------------------

describe('TurnCreateSchema', () => {
  it('accepts minimal valid turn', () => {
    const result = TurnCreateSchema.safeParse({
      sessionId: 'session_1',
      message: 'Hello',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const result = TurnCreateSchema.safeParse({
      sessionId: 'session_1',
      message: 'Hello',
      capability: 'chat',
      enabledTools: ['search'],
      knowledgeBases: ['kb1'],
      language: 'zh',
      providerId: 'openai',
      modelId: 'gpt-4o',
      apiKey: 'sk-xxx',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing sessionId', () => {
    expect(TurnCreateSchema.safeParse({ message: 'Hi' }).success).toBe(false);
  });

  it('rejects missing message', () => {
    expect(
      TurnCreateSchema.safeParse({ sessionId: 's1' }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SmartLearn schemas
// ---------------------------------------------------------------------------

describe('SmartLearnRequestSchema', () => {
  it('accepts minimal valid request', () => {
    const result = SmartLearnRequestSchema.safeParse({
      action: 'start',
      sessionId: 's1',
      profile: {},
      goal: 'Learn algebra',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing action', () => {
    expect(
      SmartLearnRequestSchema.safeParse({
        sessionId: 's1',
        profile: {},
        goal: 'Learn',
      }).success,
    ).toBe(false);
  });

  it('rejects missing goal', () => {
    expect(
      SmartLearnRequestSchema.safeParse({
        action: 'start',
        sessionId: 's1',
        profile: {},
      }).success,
    ).toBe(false);
  });
});

describe('SmartLearnEvaluateSchema', () => {
  it('accepts valid evaluation request', () => {
    const result = SmartLearnEvaluateSchema.safeParse({
      quizResults: [{ nodeId: 'n1', score: 80 }],
      profile: {},
      goal: 'Learn algebra',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty quizResults', () => {
    const result = SmartLearnEvaluateSchema.safeParse({
      quizResults: [],
      profile: {},
      goal: 'Learn',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing profile', () => {
    const result = SmartLearnEvaluateSchema.safeParse({
      quizResults: [{ nodeId: 'n1', score: 80 }],
      goal: 'Learn',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Knowledge schema
// ---------------------------------------------------------------------------

describe('KnowledgeCreateSchema', () => {
  it('accepts valid input', () => {
    const result = KnowledgeCreateSchema.safeParse({ name: 'My KB' });
    expect(result.success).toBe(true);
  });

  it('accepts with description', () => {
    const result = KnowledgeCreateSchema.safeParse({
      name: 'KB',
      description: 'Test knowledge base',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    expect(KnowledgeCreateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(KnowledgeCreateSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Query param schema
// ---------------------------------------------------------------------------

describe('HistoryQuerySchema', () => {
  it('defaults to 50 when no limit provided', () => {
    const result = HistoryQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('coerces string to number', () => {
    const result = HistoryQuerySchema.safeParse({ limit: '20' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it('caps at 100', () => {
    const result = HistoryQuerySchema.safeParse({ limit: 200 });
    expect(result.success).toBe(false);
  });

  it('rejects limit below 1', () => {
    const result = HistoryQuerySchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });
});
