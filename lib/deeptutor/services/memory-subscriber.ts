/**
 * Memory Consolidation Subscriber
 *
 * Wires the EventBus CAPABILITY_COMPLETE event to:
 * 1. Snapshot refresh → auto-emit L1 trace
 * 2. Memory consolidation (L1→L2→L3)
 *
 * Uses RunManager for per-surface exclusive locking, cooperative
 * cancellation, and undo checkpoint support.
 *
 * Registered once during bootstrap.
 */

import { createLogger } from '@/lib/logger';
import { getEventBus, EventBusEvents } from '@/lib/deeptutor/core/event-bus';
import type { MemoryServiceImpl, Surface } from '@/lib/deeptutor/services/memory';
import { refreshSnapshot, SnapshotStore } from '@/lib/deeptutor/services/memory/snapshot';
import { getRunManager, type ConsolidatorLayer, type ConsolidatorKey } from '@/lib/deeptutor/services/memory/run-manager';

const log = createLogger('MemorySubscriber');

/** Capability name → Memory surface mapping */
const CAPABILITY_TO_SURFACE: Record<string, Surface> = {
  chat: 'chat',
  deep_solve: 'quiz',
  mastery_path: 'quiz',
  deep_research: 'chat',
  deep_question: 'quiz',
  visualize: 'chat',
  smartlearn: 'quiz',
  book: 'book',
  co_writer: 'cowriter',
  notebook: 'notebook',
  explore_context: 'chat',
};

interface CapabilityCompletePayload {
  turnId: string;
  sessionId: string;
  userId: string;
  capability: string;
}

// ---------------------------------------------------------------------------
// Subscriber registration
// ---------------------------------------------------------------------------

/**
 * Register the memory consolidation subscriber on the global EventBus.
 * Should be called once during bootstrap after MemoryService is initialized.
 */
export function registerMemorySubscriber(memoryService: MemoryServiceImpl): void {
  const eventBus = getEventBus();
  const snapshotStore = new SnapshotStore();
  const runManager = getRunManager();

  eventBus.on(EventBusEvents.CAPABILITY_COMPLETE, (...args: unknown[]) => {
    const payload = args[0] as CapabilityCompletePayload;
    if (!payload || !payload.userId || !payload.capability) return;

    const surface = CAPABILITY_TO_SURFACE[payload.capability] ?? 'chat';

    // Use RunManager to lock the surface — prevents concurrent runs
    const l2RunKey = surface as ConsolidatorKey;
    if (runManager.isActive('L2', l2RunKey)) {
      log.debug(`Consolidation already in progress for L2:${surface}, skipping`);
      return;
    }

    // Fire-and-forget: snapshot + consolidation is async but we don't block on it
    (async () => {
      // Start L2 run via RunManager
      const runId = runManager.start('L2', l2RunKey);
      if (!runId) return; // Race condition — another run started

      try {
        // Step 1: Snapshot refresh → auto-detect changes → emit L1 traces
        const changes = await refreshSnapshot(
          payload.userId,
          surface,
          snapshotStore,
        );

        // Emit L1 trace for each snapshot change
        for (const change of changes) {
          try {
            await memoryService.emitTrace(payload.userId, {
              surface,
              kind: `snapshot_${change.kind}`,
              payload: {
                entityId: change.entityId,
                label: change.label,
                prevFingerprint: change.prevFingerprint,
                newFingerprint: change.newFingerprint,
              },
              sessionId: change.entityId,
              turnId: payload.turnId,
            });
          } catch (err) {
            log.warn('emitTrace failed for snapshot change:', err);
          }
        }

        // Step 2: Consolidation (L1→L2→L3)
        // Only run consolidate if there are new changes
        if (changes.length > 0) {
          // Save checkpoint before consolidation
          const existingL2 = await memoryService.readL2(payload.userId, surface);
          await runManager.saveCheckpoint(payload.userId, 'L2', l2RunKey, existingL2);

          await memoryService.consolidate(payload.userId, surface);
        }

        runManager.complete('L2', l2RunKey);

        log.debug(
          `Memory pipeline completed: user=${payload.userId}, ` +
          `capability=${payload.capability}, surface=${surface}, ` +
          `changes=${changes.length}`,
        );
      } catch (err) {
        runManager.fail('L2', l2RunKey, err);
        log.warn('Memory pipeline failed:', err);
      }
    })();
  });

  log.info('Memory consolidation subscriber registered on CAPABILITY_COMPLETE (with RunManager)');
}
