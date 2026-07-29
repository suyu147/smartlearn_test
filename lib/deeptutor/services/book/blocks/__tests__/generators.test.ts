import { describe, it, expect } from 'vitest';
import { BlockGeneratorRegistry } from '../generators';
import type { BlockGeneratorContext } from '../generators';

/** Shared test context — no LLM calls expected for deterministic generators */
const testCtx: BlockGeneratorContext = {
  chapter: {
    id: 'ch1',
    title: 'Introduction to TypeScript',
    summary: 'Learn TypeScript basics',
    objectives: ['Understand types', 'Write functions'],
    chapterOrder: 0,
    pages: [],
  } as unknown as BlockGeneratorContext['chapter'],
  pageIndex: 0,
  language: 'en',
  siblingBlocks: [],
};

describe('BlockGeneratorRegistry', () => {
  const registry = new BlockGeneratorRegistry();

  describe('registration', () => {
    it('registers all 13 block types', () => {
      const expectedTypes = [
        'text', 'section', 'callout', 'code', 'quiz',
        'figure', 'interactive', 'animation',
        'timeline', 'flash_cards', 'deep_dive',
        'concept_graph', 'user_note',
      ];
      for (const type of expectedTypes) {
        expect(registry.get(type as Parameters<typeof registry.get>[0])).toBeDefined();
      }
    });

    it('returns undefined for unknown type', () => {
      expect(registry.get('unknown' as Parameters<typeof registry.get>[0])).toBeUndefined();
    });
  });

  describe('ConceptGraphGenerator (deterministic)', () => {
    it('generates mermaid from nodes and edges', async () => {
      const block = await registry.generateBlock('concept_graph', {
        conceptGraph: {
          nodes: [
            { id: 'a', label: 'TypeScript' },
            { id: 'b', label: 'JavaScript' },
          ],
          edges: [
            { source: 'a', target: 'b', relation: 'extends' },
          ],
        },
      }, testCtx);

      expect(block.status).toBe('ready');
      expect(block.payload.mermaid).toContain('graph TD');
      expect(block.payload.mermaid).toContain('a["TypeScript"]');
      expect(block.payload.mermaid).toContain('-.->');
      expect(block.payload.nodeCount).toBe(2);
      expect(block.payload.edgeCount).toBe(1);
    });

    it('handles empty concept graph', async () => {
      const block = await registry.generateBlock('concept_graph', {}, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.mermaid).toContain('No concepts defined');
    });
  });

  describe('UserNoteGenerator (passthrough)', () => {
    it('passes through user content', async () => {
      const block = await registry.generateBlock('user_note', {
        content: 'My study notes',
      }, testCtx);

      expect(block.status).toBe('ready');
      expect(block.payload.content).toBe('My study notes');
      expect(block.payload.editable).toBe(true);
    });

    it('handles empty content', async () => {
      const block = await registry.generateBlock('user_note', {}, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.content).toBe('');
    });
  });

  describe('generateBlock error handling', () => {
    it('returns error block for unknown type', async () => {
      const block = await registry.generateBlock('nonexistent' as Parameters<typeof registry.generateBlock>[0], {}, testCtx);
      expect(block.status).toBe('error');
      expect(block.payload.content).toContain('No generator');
    });
  });

  describe('LLM-powered generators (no API key — returns fallback)', () => {
    // These generators call LLMHelper which returns '[LLM not configured]'
    // when no API key is set. We test they don't crash and return valid blocks.

    it('TextGenerator returns fallback content', async () => {
      const block = await registry.generateBlock('text', { focus: 'Test topic' }, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.content).toBeDefined();
    });

    it('QuizGenerator returns a result object', async () => {
      const block = await registry.generateBlock('quiz', { focus: 'Test quiz' }, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload).toBeDefined();
    });

    it('CodeGenerator returns language and code fields', async () => {
      const block = await registry.generateBlock('code', { focus: 'Test code' }, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.language).toBeDefined();
      expect(block.payload.code).toBeDefined();
    });

    it('FigureGenerator returns render_type and code', async () => {
      const block = await registry.generateBlock('figure', { focus: 'Test diagram' }, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.render_type).toBeDefined();
      expect(block.payload.code).toBeDefined();
    });

    it('TimelineGenerator returns events array', async () => {
      const block = await registry.generateBlock('timeline', {}, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.events).toBeDefined();
      expect(Array.isArray(block.payload.events)).toBe(true);
    });

    it('FlashCardsGenerator returns cards array', async () => {
      const block = await registry.generateBlock('flash_cards', { count: 3 }, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.cards).toBeDefined();
      expect(Array.isArray(block.payload.cards)).toBe(true);
    });

    it('DeepDiveGenerator returns suggestions array', async () => {
      const block = await registry.generateBlock('deep_dive', {}, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.suggestions).toBeDefined();
      expect(Array.isArray(block.payload.suggestions)).toBe(true);
    });

    it('InteractiveGenerator returns HTML code', async () => {
      const block = await registry.generateBlock('interactive', { focus: 'Slider demo' }, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.render_type).toBe('html');
      expect(block.payload.code).toBeDefined();
    });

    it('AnimationGenerator returns HTML with key_points', async () => {
      const block = await registry.generateBlock('animation', { focus: 'Sort animation' }, testCtx);
      expect(block.status).toBe('ready');
      expect(block.payload.render_type).toBe('html');
      expect(block.payload.key_points).toBeDefined();
    });
  });
});
