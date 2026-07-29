/**
 * ChatOrchestrator — Unified entry point for routing turns to capabilities
 *
 * Routes a UnifiedContext to the appropriate Capability based on
 * context.activeCapability, manages StreamBus lifecycle, and
 * coordinates with ToolRegistry for tool execution.
 *
 * Migrated from: deeptutor/runtime/orchestrator.py
 */

import type { UnifiedContext, StreamEvent, CapabilityConfig } from './types';
import { createStreamEvent, createTurnState } from './types';
import type { BaseCapability } from './capability-protocol';
import { CapabilityRegistry } from '../capabilities/registry';
import { ToolRegistry } from '../tools/registry';
import { StreamBusImpl } from './stream-bus';
import { InputHandler, getInputHandler } from './input-handler';
import { getEventBus, EventBusEvents } from './event-bus';

export interface OrchestratorOptions {
  capabilityRegistry: CapabilityRegistry;
  toolRegistry: ToolRegistry;
  inputHandler?: InputHandler;
}

export interface TurnResult {
  turnId: string;
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export class ChatOrchestrator {
  private capabilities: CapabilityRegistry;
  private tools: ToolRegistry;
  private inputHandler: InputHandler;

  constructor(options: OrchestratorOptions) {
    this.capabilities = options.capabilityRegistry;
    this.tools = options.toolRegistry;
    this.inputHandler = options.inputHandler ?? getInputHandler();
  }

  /**
   * Execute a single turn: route context to the appropriate capability,
   * emit events through the StreamBus, and return the result.
   */
  async executeTurn(
    context: UnifiedContext,
    eventCallback: (event: StreamEvent) => void,
    sessionId: string,
    userId: string,
  ): Promise<TurnResult> {
    const turnId = generateId();
    const turnState = createTurnState(turnId, sessionId);
    const eventBus = getEventBus();

    // Create StreamBus connected to the callback
    const stream = new StreamBusImpl(eventCallback, sessionId, turnId);

    // Emit session meta
    stream.emit(createStreamEvent('session', {
      metadata: { sessionId, turnId, userId },
    }));

    // Resolve capability
    const capabilityName = context.activeCapability || 'chat';
    const capability = this.capabilities.get(capabilityName);

    if (!capability) {
      const errorMsg = `Capability "${capabilityName}" not registered`;
      stream.emitError(errorMsg);
      stream.emitDone();
      return { turnId, status: 'failed', error: errorMsg };
    }

    // Emit turn started
    eventBus.emit(EventBusEvents.TURN_STARTED, { turnId, sessionId, capability: capabilityName });

    try {
      turnState.status = 'running';
      turnState.capability = capabilityName;

      // Run the capability
      await capability.run(context, stream);

      turnState.status = 'completed';
      turnState.completedAt = Date.now() / 1000;

      // Emit done
      stream.emitDone();

      // Notify event bus
      eventBus.emit(EventBusEvents.TURN_COMPLETED, { turnId, sessionId });

      // Trigger memory consolidation (subscriber handles async)
      eventBus.emit(EventBusEvents.CAPABILITY_COMPLETE, {
        turnId,
        sessionId,
        userId,
        capability: capabilityName,
      });

      return { turnId, status: 'completed' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      turnState.status = 'failed';
      turnState.completedAt = Date.now() / 1000;
      turnState.error = errorMessage;

      stream.emitError(errorMessage);
      stream.emitDone();

      return { turnId, status: 'failed', error: errorMessage };
    }
  }

  /** Cancel a running turn */
  cancelTurn(turnId: string): void {
    this.inputHandler.cancelPending(turnId);
    getEventBus().emit(EventBusEvents.TURN_CANCELLED, { turnId });
  }

  /** Get the tool registry */
  getToolRegistry(): ToolRegistry {
    return this.tools;
  }

  /** Get the capability registry */
  getCapabilityRegistry(): CapabilityRegistry {
    return this.capabilities;
  }
}

/** Generate a simple unique ID (cuid-like) */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}${random}`;
}
