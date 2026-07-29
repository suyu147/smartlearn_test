/**
 * Consolidator RunManager — Run lifecycle management
 *
 * Inspired by DeepTutor Python's consolidator/runs.py.
 *
 * Manages consolidator run lifecycle with:
 * - Per (layer, key) exclusive run locking
 * - Cooperative cancellation via AbortController
 * - Undo checkpoints (file snapshots before write)
 * - SSE event stream for real-time progress
 *
 * Usage:
 *   const rm = getRunManager();
 *   const runId = rm.start('L2', 'chat', { onEvent: (e) => ... });
 *   // Later: rm.cancel('L2', 'chat');
 *   // Or:    rm.undo('L2', 'chat');
 */

import { createLogger } from '@/lib/logger';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getDataDir } from '@/lib/paths';
import type { Surface } from '@/lib/deeptutor/services/memory';
import type { L3Slot } from '@/lib/deeptutor/services/memory';

const log = createLogger('RunManager');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsolidatorLayer = 'L2' | 'L3';
export type ConsolidatorKey = Surface | L3Slot;

export interface RunEvent {
  type: 'started' | 'progress' | 'chunk_processed' | 'facts_extracted' | 'done' | 'error' | 'cancelled';
  layer: ConsolidatorLayer;
  key: ConsolidatorKey;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface RunInfo {
  id: string;
  layer: ConsolidatorLayer;
  key: ConsolidatorKey;
  startedAt: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  abortController: AbortController;
  onEvent?: (event: RunEvent) => void;
}

export interface UndoCheckpoint {
  layer: ConsolidatorLayer;
  key: ConsolidatorKey;
  timestamp: string;
  content: string;
}

// ---------------------------------------------------------------------------
// RunManager
// ---------------------------------------------------------------------------

const MEMORY_BASE_DIR = getDataDir('memory');

export class RunManager {
  /** Active runs keyed by "layer:key" */
  private runs = new Map<string, RunInfo>();

  /** Undo checkpoints keyed by "layer:key" */
  private checkpoints = new Map<string, UndoCheckpoint[]>();

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start a new consolidator run.
   * Returns a run ID, or null if a run is already active for this layer+key.
   */
  start(
    layer: ConsolidatorLayer,
    key: ConsolidatorKey,
    options?: { onEvent?: (event: RunEvent) => void },
  ): string | null {
    const runKey = `${layer}:${key}`;

    if (this.runs.has(runKey)) {
      log.debug(`Run already active for ${runKey}, cannot start new run`);
      return null;
    }

    const id = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const abortController = new AbortController();

    const run: RunInfo = {
      id,
      layer,
      key,
      startedAt: new Date().toISOString(),
      status: 'running',
      abortController,
      onEvent: options?.onEvent,
    };

    this.runs.set(runKey, run);
    this.emitEvent(run, 'started');

    log.info(`Run started: ${id} for ${runKey}`);
    return id;
  }

  /**
   * Mark a run as completed.
   */
  complete(layer: ConsolidatorLayer, key: ConsolidatorKey): void {
    const runKey = `${layer}:${key}`;
    const run = this.runs.get(runKey);
    if (!run) return;

    run.status = 'completed';
    this.emitEvent(run, 'done');
    this.runs.delete(runKey);

    log.info(`Run completed: ${run.id} for ${runKey}`);
  }

  /**
   * Mark a run as failed.
   */
  fail(layer: ConsolidatorLayer, key: ConsolidatorKey, error: unknown): void {
    const runKey = `${layer}:${key}`;
    const run = this.runs.get(runKey);
    if (!run) return;

    run.status = 'failed';
    this.emitEvent(run, 'error', {
      error: error instanceof Error ? error.message : String(error),
    });
    this.runs.delete(runKey);

    log.warn(`Run failed: ${run.id} for ${runKey}:`, error);
  }

  /**
   * Cancel an active run.
   * Uses AbortController for cooperative cancellation.
   */
  cancel(layer: ConsolidatorLayer, key: ConsolidatorKey): boolean {
    const runKey = `${layer}:${key}`;
    const run = this.runs.get(runKey);
    if (!run || run.status !== 'running') return false;

    run.abortController.abort();
    run.status = 'cancelled';
    this.emitEvent(run, 'cancelled');
    this.runs.delete(runKey);

    log.info(`Run cancelled: ${run.id} for ${runKey}`);
    return true;
  }

  // -------------------------------------------------------------------------
  // Run status
  // -------------------------------------------------------------------------

  /**
   * Check if a run is active for a given layer+key.
   */
  isActive(layer: ConsolidatorLayer, key: ConsolidatorKey): boolean {
    return this.runs.has(`${layer}:${key}`);
  }

  /**
   * Get the AbortSignal for a running consolidation.
   * Consolidator implementations should check this signal periodically.
   */
  getSignal(layer: ConsolidatorLayer, key: ConsolidatorKey): AbortSignal | undefined {
    const run = this.runs.get(`${layer}:${key}`);
    return run?.abortController.signal;
  }

  /**
   * Get all active runs.
   */
  getActiveRuns(): Array<{ layer: ConsolidatorLayer; key: ConsolidatorKey; id: string; startedAt: string }> {
    return Array.from(this.runs.entries()).map(([k, v]) => ({
      layer: v.layer,
      key: v.key,
      id: v.id,
      startedAt: v.startedAt,
    }));
  }

  // -------------------------------------------------------------------------
  // Undo checkpoints
  // -------------------------------------------------------------------------

  /**
   * Save a checkpoint before writing to a memory file.
   * This allows undoing the last write operation.
   */
  async saveCheckpoint(userId: string, layer: ConsolidatorLayer, key: ConsolidatorKey, content: string): Promise<void> {
    const ckKey = `${userId}:${layer}:${key}`;
    const checkpoint: UndoCheckpoint = {
      layer,
      key,
      timestamp: new Date().toISOString(),
      content,
    };

    const existing = this.checkpoints.get(ckKey) ?? [];
    existing.push(checkpoint);
    // Keep max 5 checkpoints per key
    if (existing.length > 5) {
      existing.splice(0, existing.length - 5);
    }
    this.checkpoints.set(ckKey, existing);

    // Also persist to disk for crash recovery
    const dir = join(MEMORY_BASE_DIR, userId, 'checkpoints', layer, String(key));
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${Date.now()}.json`);
    await writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
  }

  /**
   * Undo the last checkpoint for a layer+key.
   * Returns the previous content, or null if no checkpoint exists.
   */
  async undo(userId: string, layer: ConsolidatorLayer, key: ConsolidatorKey): Promise<string | null> {
    const ckKey = `${userId}:${layer}:${key}`;
    const checkpoints = this.checkpoints.get(ckKey);

    if (!checkpoints || checkpoints.length === 0) {
      log.debug(`No checkpoints to undo for ${ckKey}`);
      return null;
    }

    const lastCheckpoint = checkpoints.pop()!;
    log.info(`Undo checkpoint for ${ckKey}: saved at ${lastCheckpoint.timestamp}`);

    return lastCheckpoint.content;
  }

  /**
   * Get the number of available checkpoints for undo.
   */
  getCheckpointCount(userId: string, layer: ConsolidatorLayer, key: ConsolidatorKey): number {
    const ckKey = `${userId}:${layer}:${key}`;
    return this.checkpoints.get(ckKey)?.length ?? 0;
  }

  // -------------------------------------------------------------------------
  // Event emission
  // -------------------------------------------------------------------------

  private emitEvent(run: RunInfo, type: RunEvent['type'], data?: Record<string, unknown>): void {
    const event: RunEvent = {
      type,
      layer: run.layer,
      key: run.key,
      timestamp: new Date().toISOString(),
      data,
    };

    run.onEvent?.(event);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: RunManager | null = null;

export function getRunManager(): RunManager {
  if (!_instance) {
    _instance = new RunManager();
  }
  return _instance;
}
