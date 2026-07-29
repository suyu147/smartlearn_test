/**
 * EventBus — Module-level EventEmitter for cross-module events
 *
 * Short-term: in-memory EventEmitter (single worker only).
 * Long-term: can be upgraded to Redis pub/sub for multi-worker.
 *
 * Use cases:
 * - CAPABILITY_COMPLETE triggers memory consolidation
 * - SETTINGS_CHANGED notifies LangGraph nodes for config hot-reload
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('EventBus');

export type EventBusHandler = (...args: unknown[]) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventBusHandler>>();

  on(event: string, handler: EventBusHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventBusHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          // Don't let handler errors crash the event bus
          log.error(`Error in handler for "${event}":`, error);
        }
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}

// Module-level singleton for global event bus
let globalEventBus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

/** Well-known event names */
export const EventBusEvents = {
  CAPABILITY_COMPLETE: 'capability:complete',
  SETTINGS_CHANGED: 'settings:changed',
  TURN_STARTED: 'turn:started',
  TURN_COMPLETED: 'turn:completed',
  TURN_CANCELLED: 'turn:cancelled',
} as const;
