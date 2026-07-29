/**
 * Input Handler — ask_user cross-handler state management
 *
 * Manages the Map<turnId, PromiseResolver> pattern for ask_user:
 * 1. SSE handler sends WAIT_FOR_INPUT event
 * 2. SSE handler awaits a Promise (stored in the Map)
 * 3. POST /api/v1/turns/[turnId]/input handler resolves the Promise with user's reply
 * 4. SSE handler continues with the reply
 *
 * Includes 60s timeout with graceful degradation.
 * Single-worker only (module-level Map).
 */

interface PendingInput {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  createdAt: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export class InputHandler {
  private pending = new Map<string, PendingInput>();

  /**
   * Wait for user input on a given turn.
   * Called by the SSE handler after sending WAIT_FOR_INPUT.
   * Returns the user's reply, or throws on timeout.
   */
  waitForInput(turnId: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
    // Clean up any existing pending input for this turn
    this.cancelPending(turnId);

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(turnId);
        reject(new Error(`ask_user timeout: no response within ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(turnId, {
        resolve,
        reject,
        timer,
        createdAt: Date.now(),
      });
    });
  }

  /**
   * Submit user input for a given turn.
   * Called by POST /api/v1/input handler.
   * Returns true if the input was consumed, false if no pending input found.
   */
  submitInput(turnId: string, input: string): boolean {
    const pending = this.pending.get(turnId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pending.delete(turnId);
    pending.resolve(input);
    return true;
  }

  /**
   * Cancel a pending input wait (e.g. on turn cancellation).
   */
  cancelPending(turnId: string): void {
    const pending = this.pending.get(turnId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(turnId);
      pending.reject(new Error('Input wait cancelled'));
    }
  }

  /** Check if a turn is waiting for input */
  isWaiting(turnId: string): boolean {
    return this.pending.has(turnId);
  }

  /** Get the number of pending input waits */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Clean up all pending inputs (e.g. on server shutdown) */
  destroy(): void {
    for (const [turnId] of this.pending) {
      this.cancelPending(turnId);
    }
  }
}

// Module-level singleton
let globalInputHandler: InputHandler | null = null;

export function getInputHandler(): InputHandler {
  if (!globalInputHandler) {
    globalInputHandler = new InputHandler();
  }
  return globalInputHandler;
}
