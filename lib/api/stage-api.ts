/**
 * Stage API — Unified abstraction layer for Stage/Scene/Whiteboard operations.
 *
 * Provides a WhiteboardAPI for element CRUD (get, addElement, deleteElement, update)
 * and a SceneAPI for scene lifecycle (get, update, create).
 *
 * The StageStore interface extends Zustand's getState/subscribe with a setState
 * method so that whiteboard mutations flow through the same store.
 *
 * Used by:
 * - ActionEngine (lib/action/engine.ts) — executes wb_* actions at runtime
 * - SceneGenerator (lib/generation/scene-generator.ts) — creates scenes during generation
 */

import type { Scene } from '@/lib/types/stage';
import type { GenerationResult } from '@/lib/generation/pipeline-types';
import { createLogger } from '@/lib/logger';

const log = createLogger('StageAPI');

// ---------------------------------------------------------------------------
// StageStore — the minimal interface required by createStageAPI
// ---------------------------------------------------------------------------

export interface StageStore {
  getState: () => {
    stage: import('@/lib/types/stage').Stage | null;
    scenes: Scene[];
    currentSceneId: string | null;
  };
  /** Zustand-compatible partial setter for stage-level mutations (whiteboard, etc.) */
  setState: (partial: Partial<{
    stage: import('@/lib/types/stage').Stage | null;
    scenes: Scene[];
    currentSceneId: string | null;
  }>) => void;
  subscribe: (listener: (state: unknown) => void) => () => void;
}

// ---------------------------------------------------------------------------
// Whiteboard types
// ---------------------------------------------------------------------------

export interface WhiteboardAPI {
  get: () => { success: boolean; data: WhiteboardData | null };
  addElement: (element: Record<string, unknown>, whiteboardId: string) => void;
  deleteElement: (elementId: string, whiteboardId: string) => void;
  update: (updates: Record<string, unknown>, whiteboardId: string) => void;
}

export interface WhiteboardData {
  id: string;
  elements?: Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Scene types
// ---------------------------------------------------------------------------

export interface SceneAPI {
  get: (sceneId: string) => Scene | null;
  update: (sceneId: string, updates: Partial<Scene>) => void;
  create: (scene: Partial<Scene> & { type: string; title: string; order: number; content: unknown }) => GenerationResult<Scene>;
}

// ---------------------------------------------------------------------------
// Stage API
// ---------------------------------------------------------------------------

export interface StageAPI {
  whiteboard: WhiteboardAPI;
  scene: SceneAPI;
}

// ---------------------------------------------------------------------------
// Default whiteboard ID
// ---------------------------------------------------------------------------

const DEFAULT_WHITEBOARD_ID = 'wb_default';

// ---------------------------------------------------------------------------
// createStageAPI — factory
// ---------------------------------------------------------------------------

export function createStageAPI(store: StageStore): StageAPI {
  // ----- Whiteboard helpers (private) -----

  /** Read current whiteboard data from the stage, or null */
  function readWhiteboard(): WhiteboardData | null {
    const { stage } = store.getState();
    if (!stage) return null;

    const wbArray = stage.whiteboard;
    if (!Array.isArray(wbArray) || wbArray.length === 0) return null;

    // Use the first entry (most stages have exactly one whiteboard)
    const entry = wbArray[0];
    const elements = Array.isArray(entry?.elements)
      ? (entry.elements as Array<Record<string, unknown>>)
      : [];

    return { id: DEFAULT_WHITEBOARD_ID, elements };
  }

  /** Write whiteboard elements back to the stage store */
  function writeWhiteboard(elements: Array<Record<string, unknown>>): void {
    const { stage } = store.getState();
    if (!stage) return;

    const updatedStage = {
      ...stage,
      whiteboard: [{ elements }],
      updatedAt: Date.now(),
    };
    store.setState({ stage: updatedStage });
  }

  // ----- Whiteboard API -----

  const whiteboard: WhiteboardAPI = {
    /**
     * Get the current whiteboard data. If no whiteboard exists yet, creates one
     * with an empty elements array and persists it to the stage store.
     */
    get(): { success: boolean; data: WhiteboardData | null } {
      const existing = readWhiteboard();
      if (existing) {
        return { success: true, data: existing };
      }

      // Initialize a new whiteboard on the stage
      const { stage } = store.getState();
      if (!stage) {
        log.warn('whiteboard.get: no stage available');
        return { success: false, data: null };
      }

      const newData: WhiteboardData = { id: DEFAULT_WHITEBOARD_ID, elements: [] };
      writeWhiteboard([]);
      return { success: true, data: newData };
    },

    /**
     * Add an element to the whiteboard. Assigns an id if missing.
     */
    addElement(element: Record<string, unknown>, _whiteboardId: string): void {
      const wb = readWhiteboard();
      const elements = wb?.elements ? [...wb.elements] : [];

      // Ensure element has an id
      const el = { ...element };
      if (!el.id) {
        el.id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      }

      elements.push(el);
      writeWhiteboard(elements);
    },

    /**
     * Remove an element by id from the whiteboard.
     */
    deleteElement(elementId: string, _whiteboardId: string): void {
      const wb = readWhiteboard();
      if (!wb?.elements) return;

      const elements = wb.elements.filter((el) => el.id !== elementId);
      writeWhiteboard(elements);
    },

    /**
     * Update whiteboard data (e.g. clear all elements with { elements: [] }).
     */
    update(updates: Record<string, unknown>, _whiteboardId: string): void {
      const wb = readWhiteboard();
      let elements = wb?.elements ? [...wb.elements] : [];

      if ('elements' in updates && Array.isArray(updates.elements)) {
        elements = updates.elements as Array<Record<string, unknown>>;
      }

      writeWhiteboard(elements);
    },
  };

  // ----- Scene API -----

  const scene: SceneAPI = {
    /**
     * Get a scene by id from the store.
     */
    get(sceneId: string): Scene | null {
      const { scenes } = store.getState();
      return scenes.find((s) => s.id === sceneId) ?? null;
    },

    /**
     * Update a scene's properties. Merges partial updates into the existing scene.
     */
    update(sceneId: string, updates: Partial<Scene>): void {
      const { scenes } = store.getState();
      const updatedScenes = scenes.map((s) =>
        s.id === sceneId ? { ...s, ...updates, updatedAt: Date.now() } : s,
      );
      store.setState({ scenes: updatedScenes });
    },

    /**
     * Create a new scene from partial data. Returns a GenerationResult with the
     * fully formed Scene object.
     */
    create(sceneData): GenerationResult<Scene> {
      const now = Date.now();
      const newScene: Scene = {
        ...sceneData,
        id: `scene_${now}`,
        stageId: sceneData.stageId || store.getState().stage?.id || '',
        content: sceneData.content as Scene['content'],
        createdAt: now,
        updatedAt: now,
      };

      const { scenes } = store.getState();
      store.setState({ scenes: [...scenes, newScene] });

      return { success: true, data: newScene };
    },
  };

  return { whiteboard, scene };
}
