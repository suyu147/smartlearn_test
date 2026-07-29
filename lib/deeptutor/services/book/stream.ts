/**
 * BookStream — StreamBus wrapper with book_engine source
 *
 * Ported from DeepTutor Python deeptutor/book/streaming.py.
 * Emits book-specific events via the shared StreamBus infrastructure.
 */

import { StreamBusImpl } from '@/lib/deeptutor/core/stream-bus';
import { createStreamEvent } from '@/lib/deeptutor/core/types';
import type { StreamEventCallback } from '@/lib/deeptutor/core/stream-bus';

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const BOOK_STAGES = {
  IDEATION: 'ideation',
  EXPLORATION: 'exploration',
  SYNTHESIS: 'synthesis',
  CRITIQUE: 'critique',
  OVERVIEW: 'overview',
  SPINE: 'spine',
  PAGE_PLAN: 'page_plan',
  COMPILATION: 'compilation',
  BLOCK: 'block',
  INTERACTION: 'interaction',
} as const;

const SOURCE = 'book_engine';

// ---------------------------------------------------------------------------
// BookStream class
// ---------------------------------------------------------------------------

export class BookStream {
  private bus: StreamBusImpl;

  constructor(callback: StreamEventCallback, sessionId?: string, turnId?: string) {
    this.bus = new StreamBusImpl(callback, sessionId ?? '', turnId ?? '');
  }

  /**
   * Emit a book-specific event through the PROGRESS channel.
   * The frontend distinguishes events by `metadata.kind`.
   */
  bookEvent(
    kind: string,
    data: Record<string, unknown> = {},
    stage: string = '',
  ): void {
    this.bus.emit(
      createStreamEvent('progress', {
        source: SOURCE,
        stage,
        content: kind,
        metadata: { kind, ...data },
      }),
    );
  }

  /** Enter a stage context — returns a function to close it */
  enterStage(stage: string): () => void {
    return this.bus.enterStage(stage, SOURCE);
  }

  // -----------------------------------------------------------------------
  // Convenience methods for each stage
  // -----------------------------------------------------------------------

  /** Stage 1: proposal ready */
  emitProposalReady(proposal: Record<string, unknown>): void {
    this.bookEvent('proposal_ready', proposal, BOOK_STAGES.IDEATION);
  }

  /** Stage 2: exploration report */
  emitExplorationReady(report: Record<string, unknown>): void {
    this.bookEvent('exploration_ready', report, BOOK_STAGES.EXPLORATION);
  }

  /** Stage 2: spine round (draft/critique/revise) */
  emitSpineRound(round: number, verdict?: string): void {
    this.bookEvent('spine_round', { round, verdict }, BOOK_STAGES.SYNTHESIS);
  }

  /** Stage 2: spine ready */
  emitSpineReady(chapterCount: number): void {
    this.bookEvent('spine_ready', { chapterCount }, BOOK_STAGES.SPINE);
  }

  /** Stage 2.5: overview page ready */
  emitOverviewReady(pageId: string): void {
    this.bookEvent('overview_ready', { pageId }, BOOK_STAGES.OVERVIEW);
  }

  /** Stage 3: page compile started */
  emitPageCompileStarted(pageId: string, title: string): void {
    this.bookEvent(
      'page_compile_started',
      { pageId, title },
      BOOK_STAGES.COMPILATION,
    );
  }

  /** Stage 3: page plan (blocks decided) */
  emitPagePlanned(pageId: string, blockCount: number): void {
    this.bookEvent(
      'page_planned',
      { pageId, blockCount },
      BOOK_STAGES.PAGE_PLAN,
    );
  }

  /** Stage 4: block generation started */
  emitBlockStarted(blockId: string, blockType: string, pageId: string): void {
    this.bookEvent(
      'block_started',
      { blockId, blockType, pageId },
      BOOK_STAGES.BLOCK,
    );
  }

  /** Stage 4: block generation completed */
  emitBlockReady(blockId: string, blockType: string, pageId: string): void {
    this.bookEvent(
      'block_ready',
      { blockId, blockType, pageId },
      BOOK_STAGES.BLOCK,
    );
  }

  /** Stage 4: block generation failed */
  emitBlockError(blockId: string, blockType: string, error: string): void {
    this.bookEvent(
      'block_error',
      { blockId, blockType, error },
      BOOK_STAGES.BLOCK,
    );
  }

  /** Stage 4: page compilation completed */
  emitPageCompiled(pageId: string, blockCount: number): void {
    this.bookEvent(
      'page_compiled',
      { pageId, blockCount },
      BOOK_STAGES.COMPILATION,
    );
  }

  /** Emit progress message */
  emitProgress(message: string, current?: number, total?: number): void {
    this.bus.emitProgress(message, current, total);
  }

  /** Emit thinking */
  emitThinking(content: string): void {
    this.bus.emitThinking(content, SOURCE);
  }

  /** Emit error */
  emitError(message: string): void {
    this.bus.emitError(message, SOURCE);
  }

  /** Emit done */
  emitDone(): void {
    this.bus.emitDone();
  }
}
