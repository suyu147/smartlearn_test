/**
 * StreamBus — Async event bus for capabilities to emit events
 *
 * In single-worker mode, this wraps a simple callback-based event sink.
 * The Orchestrator connects the StreamBus to the SSE response stream.
 */

import type { StreamEvent, StreamEventType } from './types';
import { createStreamEvent } from './types';

export type StreamEventCallback = (event: StreamEvent) => void;

export class StreamBusImpl {
  private callback: StreamEventCallback;
  private sessionId: string;
  private turnId: string;
  private seq: number = 0;
  private currentStage: string = '';
  private currentSource: string = '';

  constructor(callback: StreamEventCallback, sessionId: string = '', turnId: string = '') {
    this.callback = callback;
    this.sessionId = sessionId;
    this.turnId = turnId;
  }

  emit(event: StreamEvent): void {
    this.seq++;
    this.callback({
      ...event,
      sessionId: event.sessionId || this.sessionId,
      turnId: event.turnId || this.turnId,
      seq: event.seq || this.seq,
      stage: event.stage || this.currentStage,
      source: event.source || this.currentSource,
      timestamp: event.timestamp || Date.now() / 1000,
    });
  }

  /** Convenience: emit a content event */
  emitContent(content: string, source?: string): void {
    this.emit(createStreamEvent('content', { content, source: source ?? this.currentSource }));
  }

  /** Convenience: emit a thinking event */
  emitThinking(content: string, source?: string): void {
    this.emit(createStreamEvent('thinking', { content, source: source ?? this.currentSource }));
  }

  /** Convenience: emit a tool_call event */
  emitToolCall(toolName: string, args: Record<string, unknown>, source?: string): void {
    this.emit(createStreamEvent('tool_call', {
      content: toolName,
      metadata: { tool: toolName, args },
      source: source ?? this.currentSource,
    }));
  }

  /** Convenience: emit a tool_result event */
  emitToolResult(toolName: string, result: string, source?: string): void {
    this.emit(createStreamEvent('tool_result', {
      content: result,
      metadata: { tool: toolName },
      source: source ?? this.currentSource,
    }));
  }

  /** Convenience: emit an error event */
  emitError(message: string, source?: string): void {
    this.emit(createStreamEvent('error', { content: message, source: source ?? this.currentSource }));
  }

  /** Convenience: emit done */
  emitDone(): void {
    this.emit(createStreamEvent('done'));
  }

  /** Convenience: emit wait_for_input event (system pauses for user input via ask_user tool) */
  emitWaitForInput(turnId: string, prompt?: string): void {
    this.emit(createStreamEvent('wait_for_input', {
      content: prompt ?? '',
      metadata: { turnId },
    }));
  }

  /** Convenience: emit session_complete event (session finished successfully) */
  emitSessionComplete(): void {
    this.emit(createStreamEvent('session_complete'));
  }

  /** Convenience: emit session_cancelled event (session was cancelled by user) */
  emitSessionCancelled(): void {
    this.emit(createStreamEvent('session_cancelled'));
  }

  /** Convenience: emit a progress event */
  emitProgress(message: string, current?: number, total?: number): void {
    this.emit(createStreamEvent('progress', {
      content: message,
      metadata: {
        ...(current !== undefined ? { current } : {}),
        ...(total !== undefined ? { total } : {}),
      },
    }));
  }

  /** Convenience: emit a sources event */
  emitSources(sources: Array<{ name: string; url?: string; kind?: string }>): void {
    this.emit(createStreamEvent('sources', {
      metadata: { sources },
    }));
  }

  /** Convenience: emit a result event */
  emitResult(data: Record<string, unknown>): void {
    this.emit(createStreamEvent('result', {
      metadata: data,
    }));
  }

  /** Convenience: emit an observation event */
  emitObservation(content: string, source?: string): void {
    this.emit(createStreamEvent('observation', {
      content,
      source: source ?? this.currentSource,
    }));
  }

  /** Convenience: emit a session event */
  emitSession(sessionId: string): void {
    this.emit(createStreamEvent('session', {
      sessionId,
      metadata: { sessionId },
    }));
  }

  /** Enter a named stage context (emits stage_start, returns function to emit stage_end) */
  enterStage(stage: string, source?: string): () => void {
    this.currentStage = stage;
    if (source) this.currentSource = source;
    this.emit(createStreamEvent('stage_start', { content: stage, source: source ?? this.currentSource }));
    return () => {
      this.emit(createStreamEvent('stage_end', { content: stage, source: source ?? this.currentSource }));
      this.currentStage = '';
    };
  }
}
