/**
 * useTurnStream — React hook for managing SSE turn streams
 *
 * Wraps submitTurn() + consumeSSEStream() with React state management.
 * Automatically maps StreamEvent types to chat store messages.
 */

import { useCallback, useRef, useState } from 'react';
import {
  submitTurn,
  submitTurnInput,
  type SSEEnvelope,
  type StreamEventData,
} from '@/lib/api-client';
import { useChatStore } from '@/lib/store/chat-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallInfo {
  name: string;
  status: 'running' | 'completed' | 'failed';
  input?: string;
  result?: string;
}

export interface StreamState {
  /** True while the SSE stream is active */
  isStreaming: boolean;
  /** Current turn ID (set after stream starts) */
  turnId: string | null;
  /** Accumulated thinking text for the current turn */
  thinking: string;
  /** Active tool calls for the current turn */
  toolCalls: ToolCallInfo[];
  /** Current stage name (e.g. "planning", "solving") */
  stage: string;
  /** Sources surfaced by tools */
  sources: Array<{ name: string; url?: string; kind?: string }>;
  /** Error message if the stream failed */
  error: string | null;
  /** Waiting for user input (ask_user tool) */
  waitForInput: { turnId: string; prompt: string } | null;
}

const INITIAL_STATE: StreamState = {
  isStreaming: false,
  turnId: null,
  thinking: '',
  toolCalls: [],
  stage: '',
  sources: [],
  error: null,
  waitForInput: null,
};

/** Shared params for submitTurn */
interface TurnParams {
  sessionId: string;
  message: string;
  capability?: string;
  enabledTools?: string[];
  knowledgeBases?: string[];
  language?: string;
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  conversationHistory?: Record<string, unknown>[];
  attachments?: Array<{
    type: string;
    base64?: string;
    url?: string;
    filename?: string;
    mimeType?: string;
    id?: string;
  }>;
  /** Image data URLs for local display in the user message bubble */
  imageUrls?: string[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTurnStream() {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const contentBufferRef = useRef('');

  const addMessage = useChatStore((s) => s.addMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);

  /**
   * Handle a single SSE event from the stream.
   */
  const handleEvent = useCallback(
    (envelope: SSEEnvelope) => {
      const event: StreamEventData = envelope.data;

      switch (event.type) {
        case 'content': {
          contentBufferRef.current += event.content;
          setState((s) => ({ ...s }));
          break;
        }

        case 'thinking': {
          setState((s) => ({ ...s, thinking: s.thinking + event.content }));
          break;
        }

        case 'tool_call': {
          const toolName = event.content || (event.metadata?.tool as string) || 'unknown';
          setState((s) => ({
            ...s,
            toolCalls: [
              ...s.toolCalls,
              {
                name: toolName,
                status: 'running',
                input: event.metadata?.args
                  ? JSON.stringify(event.metadata.args)
                  : undefined,
              },
            ],
          }));
          break;
        }

        case 'tool_result': {
          const toolName = event.content || (event.metadata?.tool as string) || 'unknown';
          setState((s) => ({
            ...s,
            toolCalls: s.toolCalls.map((tc) =>
              tc.name === toolName
                ? { ...tc, status: 'completed' as const, result: event.content }
                : tc,
            ),
          }));
          break;
        }

        case 'stage_start': {
          setState((s) => ({ ...s, stage: event.content }));
          break;
        }

        case 'stage_end': {
          setState((s) => ({
            ...s,
            stage: s.stage === event.content ? '' : s.stage,
          }));
          break;
        }

        case 'sources': {
          const sources = (event.metadata?.sources ?? []) as Array<{
            name: string;
            url?: string;
            kind?: string;
          }>;
          setState((s) => ({ ...s, sources: [...s.sources, ...sources] }));
          break;
        }

        case 'error': {
          setState((s) => ({ ...s, error: event.content }));
          break;
        }

        case 'done':
        case 'result': {
          // Flush accumulated content as an assistant message
          let content = contentBufferRef.current;

          // If no content from stream (e.g., Visualize capability uses emitResult),
          // extract from result metadata
          if (!content && event.metadata?.text) {
            content = event.metadata.text as string;
          }

          if (content) {
            const renderMode = event.metadata?.renderMode as string | undefined;
            const assistantMsgId = `msg-${Date.now()}-assistant`;
            addMessage({
              id: assistantMsgId,
              role: 'assistant',
              content,
              timestamp: new Date().toISOString(),
              turnId: event.turnId || undefined,
              ...(renderMode ? { renderMode } : {}),
            });
            contentBufferRef.current = '';
          }

          setState((s) => ({
            ...s,
            isStreaming: false,
            turnId: event.turnId || s.turnId,
          }));
          setStreaming(false);
          break;
        }

        case 'wait_for_input': {
          setState((s) => ({
            ...s,
            waitForInput: {
              turnId: event.turnId || event.metadata?.turnId as string || '',
              prompt: event.content,
            },
          }));
          break;
        }

        case 'session': {
          setState((s) => ({
            ...s,
            turnId: event.turnId || s.turnId,
          }));
          break;
        }

        default:
          // Unhandled event types — ignore
          break;
      }
    },
    [addMessage, setStreaming],
  );

  /**
   * Internal: start the SSE stream for given turn params.
   * Does NOT add a user message — callers handle that.
   */
  const _startStream = useCallback(
    async (params: TurnParams) => {
      // Abort previous stream if any
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Reset state
      contentBufferRef.current = '';
      setState({ ...INITIAL_STATE, isStreaming: true });
      setStreaming(true);

      try {
        await submitTurn(params, {
          signal: controller.signal,
          onEvent: (event: SSEEnvelope) => {
            handleEvent(event);
          },
          onError: (err: Error) => {
            setState((s) => ({ ...s, error: err.message, isStreaming: false }));
            setStreaming(false);
          },
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Stream failed';
        setState((s) => ({ ...s, error: message, isStreaming: false }));
        setStreaming(false);
      }
    },
    [handleEvent, setStreaming],
  );

  /**
   * Send a message and consume the SSE stream.
   */
  const send = useCallback(
    async (params: TurnParams) => {
      // Add user message to store
      const userMsgId = `msg-${Date.now()}-user`;
      addMessage({
        id: userMsgId,
        role: 'user',
        content: params.message,
        timestamp: new Date().toISOString(),
        ...(params.imageUrls && params.imageUrls.length > 0
          ? { imageUrls: params.imageUrls }
          : {}),
      });

      await _startStream(params);
    },
    [addMessage, _startStream],
  );

  /**
   * Regenerate: remove the assistant message and re-execute the same turn.
   * The caller must pass the assistant message ID and the original user message content.
   */
  const regenerate = useCallback(
    async (assistantMessageId: string, params: TurnParams) => {
      // Remove the old assistant message from the store
      removeMessage(assistantMessageId);

      // Re-execute the stream (does NOT add a new user message)
      await _startStream(params);
    },
    [removeMessage, _startStream],
  );

  /**
   * Submit user input for ask_user and continue the stream.
   */
  const submitInput = useCallback(
    async (input: string) => {
      if (!state.waitForInput) return;
      const turnId = state.waitForInput.turnId;
      setState((s) => ({ ...s, waitForInput: null }));
      try {
        await submitTurnInput(turnId, input);
      } catch {
        // Turn may have already completed/expired — non-critical
      }
    },
    [state.waitForInput],
  );

  /**
   * Cancel the current stream.
   */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, isStreaming: false }));
    setStreaming(false);
  }, [setStreaming]);

  /**
   * Get the current accumulated content buffer (for live rendering).
   */
  const getStreamingContent = useCallback(() => {
    return contentBufferRef.current;
  }, []);

  return {
    ...state,
    send,
    regenerate,
    submitInput,
    cancel,
    getStreamingContent,
  };
}
