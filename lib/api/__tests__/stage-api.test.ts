/**
 * Tests for StageAPI — whiteboard and scene operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createStageAPI } from '@/lib/api/stage-api';
import type { StageStore } from '@/lib/api/stage-api';
import type { Stage, Scene } from '@/lib/types/stage';

// ---------------------------------------------------------------------------
// Mock StageStore
// ---------------------------------------------------------------------------

function createMockStore(initial?: Partial<{ stage: Stage | null; scenes: Scene[]; currentSceneId: string | null }>): StageStore {
  let state = {
    stage: initial?.stage ?? null,
    scenes: initial?.scenes ?? [],
    currentSceneId: initial?.currentSceneId ?? null,
  };

  const listeners: Array<(s: unknown) => void> = [];

  return {
    getState: () => ({ ...state }),
    setState: (partial) => {
      state = { ...state, ...partial };
      listeners.forEach((fn) => fn(state));
    },
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

function makeStage(overrides?: Partial<Stage>): Stage {
  return {
    id: 'stage_1',
    title: 'Test Stage',
    mode: 'playback',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeScene(overrides?: Partial<Scene>): Scene {
  return {
    id: 'scene_1',
    stageId: 'stage_1',
    type: 'slide',
    title: 'Test Scene',
    order: 0,
    content: { type: 'slide', canvas: { elements: [], width: 1920, height: 1080 } } as unknown as Scene['content'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Whiteboard Tests
// ---------------------------------------------------------------------------

describe('WhiteboardAPI', () => {
  let store: StageStore;
  let api: ReturnType<typeof createStageAPI>;

  beforeEach(() => {
    store = createMockStore({ stage: makeStage() });
    api = createStageAPI(store);
  });

  describe('get', () => {
    it('returns success with empty elements when no whiteboard exists', () => {
      const result = api.whiteboard.get();
      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data!.elements).toEqual([]);
    });

    it('returns existing whiteboard data', () => {
      const stage = makeStage({ whiteboard: [{ elements: [{ id: 'el1', type: 'text' }] }] });
      store.setState({ stage });

      const result = api.whiteboard.get();
      expect(result.success).toBe(true);
      expect(result.data!.elements).toHaveLength(1);
      expect(result.data!.elements![0]).toMatchObject({ id: 'el1', type: 'text' });
    });

    it('returns failure when no stage exists', () => {
      store = createMockStore({ stage: null });
      api = createStageAPI(store);

      const result = api.whiteboard.get();
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
    });

    it('initializes whiteboard on stage when none exists', () => {
      api.whiteboard.get();
      const stage = store.getState().stage!;
      expect(stage.whiteboard).toBeDefined();
      expect(stage.whiteboard).toEqual([{ elements: [] }]);
    });
  });

  describe('addElement', () => {
    it('adds an element to the whiteboard', () => {
      api.whiteboard.get(); // initialize
      api.whiteboard.addElement({ id: 'el1', type: 'text', content: 'Hello' }, 'wb_default');

      const result = api.whiteboard.get();
      expect(result.data!.elements).toHaveLength(1);
      expect(result.data!.elements![0]).toMatchObject({ id: 'el1', type: 'text' });
    });

    it('auto-generates id if missing', () => {
      api.whiteboard.get();
      api.whiteboard.addElement({ type: 'shape' }, 'wb_default');

      const result = api.whiteboard.get();
      expect(result.data!.elements![0].id).toBeDefined();
      expect(typeof result.data!.elements![0].id).toBe('string');
    });

    it('appends multiple elements', () => {
      api.whiteboard.get();
      api.whiteboard.addElement({ id: 'el1', type: 'text' }, 'wb_default');
      api.whiteboard.addElement({ id: 'el2', type: 'shape' }, 'wb_default');
      api.whiteboard.addElement({ id: 'el3', type: 'chart' }, 'wb_default');

      const result = api.whiteboard.get();
      expect(result.data!.elements).toHaveLength(3);
    });
  });

  describe('deleteElement', () => {
    it('removes an element by id', () => {
      api.whiteboard.get();
      api.whiteboard.addElement({ id: 'el1', type: 'text' }, 'wb_default');
      api.whiteboard.addElement({ id: 'el2', type: 'shape' }, 'wb_default');

      api.whiteboard.deleteElement('el1', 'wb_default');

      const result = api.whiteboard.get();
      expect(result.data!.elements).toHaveLength(1);
      expect(result.data!.elements![0].id).toBe('el2');
    });

    it('does nothing when whiteboard is empty', () => {
      api.whiteboard.get();
      api.whiteboard.deleteElement('nonexistent', 'wb_default');

      const result = api.whiteboard.get();
      expect(result.data!.elements).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('clears all elements when passed { elements: [] }', () => {
      api.whiteboard.get();
      api.whiteboard.addElement({ id: 'el1' }, 'wb_default');
      api.whiteboard.addElement({ id: 'el2' }, 'wb_default');

      api.whiteboard.update({ elements: [] }, 'wb_default');

      const result = api.whiteboard.get();
      expect(result.data!.elements).toHaveLength(0);
    });

    it('replaces elements with new set', () => {
      api.whiteboard.get();
      api.whiteboard.addElement({ id: 'el1' }, 'wb_default');

      api.whiteboard.update(
        { elements: [{ id: 'new1', type: 'text' }, { id: 'new2', type: 'shape' }] },
        'wb_default',
      );

      const result = api.whiteboard.get();
      expect(result.data!.elements).toHaveLength(2);
      expect(result.data!.elements![0].id).toBe('new1');
    });
  });
});

// ---------------------------------------------------------------------------
// Scene Tests
// ---------------------------------------------------------------------------

describe('SceneAPI', () => {
  let store: StageStore;
  let api: ReturnType<typeof createStageAPI>;

  beforeEach(() => {
    const scenes = [
      makeScene({ id: 'scene_1', title: 'Scene 1', order: 0 }),
      makeScene({ id: 'scene_2', title: 'Scene 2', order: 1 }),
    ];
    store = createMockStore({ stage: makeStage(), scenes, currentSceneId: 'scene_1' });
    api = createStageAPI(store);
  });

  describe('get', () => {
    it('returns scene by id', () => {
      const scene = api.scene.get('scene_1');
      expect(scene).not.toBeNull();
      expect(scene!.title).toBe('Scene 1');
    });

    it('returns null for non-existent scene', () => {
      expect(api.scene.get('nonexistent')).toBeNull();
    });
  });

  describe('update', () => {
    it('updates scene properties', () => {
      api.scene.update('scene_1', { title: 'Updated Title' });

      const scene = api.scene.get('scene_1');
      expect(scene!.title).toBe('Updated Title');
    });

    it('does not affect other scenes', () => {
      api.scene.update('scene_1', { title: 'Updated' });

      const scene2 = api.scene.get('scene_2');
      expect(scene2!.title).toBe('Scene 2');
    });
  });

  describe('create', () => {
    it('creates a new scene and adds to store', () => {
      const result = api.scene.create({
        type: 'quiz',
        title: 'New Quiz',
        order: 2,
        content: { type: 'quiz', questions: [] },
      });

      expect(result.success).toBe(true);
      expect(result.data!.title).toBe('New Quiz');
      expect(result.data!.type).toBe('quiz');
      expect(result.data!.id).toBeDefined();

      const scenes = store.getState().scenes;
      expect(scenes).toHaveLength(3);
    });

    it('assigns stageId from current stage', () => {
      const result = api.scene.create({
        type: 'slide',
        title: 'New Slide',
        order: 3,
        content: { type: 'slide', canvas: { elements: [] } } as unknown as Scene['content'],
      });

      expect(result.data!.stageId).toBe('stage_1');
    });
  });
});
