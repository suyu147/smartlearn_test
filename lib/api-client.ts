/**
 * Frontend API Client
 *
 * Shared fetch utilities for calling /api/v1/* endpoints.
 * Provides JSON request wrapper and SSE stream parser.
 * Automatically injects Authorization header from the auth token store.
 */

import { getApiToken } from '@/lib/auth-token';

// ---------------------------------------------------------------------------
// JSON API
// ---------------------------------------------------------------------------

export interface ApiError {
  message: string;
  code?: string;
  status: number;
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Generic typed fetch wrapper for JSON API endpoints.
 * Handles both `{ success, data }` envelope and raw JSON responses.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // Build auth-aware headers
  const authHeaders: Record<string, string> = {};
  const token = getApiToken();
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Separate headers from rest of options to avoid header overwrite
  const { headers: optionHeaders, ...restOptions } = options;

  // Build headers: omit Content-Type for FormData to let the browser
  // auto-set multipart/form-data with the correct boundary string.
  const isFormData = restOptions.body instanceof FormData;
  const headers: Record<string, string> = { ...authHeaders, ...optionHeaders };
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, {
    ...restOptions,
    headers,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      message =
        body.error ??
        body.error?.message ??
        body.message ??
        message;
      code = body.code ?? body.error?.code;
    } catch {
      // response wasn't JSON
    }
    throw new ApiRequestError(message, res.status, code);
  }

  const json = await res.json();

  // If the response uses the { success, data } envelope, unwrap it
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    if (!json.success) {
      throw new ApiRequestError(
        json.error?.message ?? 'Request failed',
        res.status,
        json.error?.code,
      );
    }
    return json.data as T;
  }

  return json as T;
}

/** Shorthand: GET request */
export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

/** Shorthand: POST request with JSON body */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Shorthand: PUT request */
export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Shorthand: DELETE request */
export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}

/** Shorthand: POST with FormData (file upload) */
export function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: formData,
    headers: {}, // let browser set Content-Type with boundary
  });
}

// ---------------------------------------------------------------------------
// SSE Stream Parser
// ---------------------------------------------------------------------------

/** SSE event from the /api/v1/turns endpoint */
export interface SSEEnvelope {
  type: string;
  data: StreamEventData;
}

export interface StreamEventData {
  type: string;
  source: string;
  stage: string;
  content: string;
  metadata: Record<string, unknown>;
  sessionId: string;
  turnId: string;
  seq: number;
  timestamp: number;
}

export type SSEEventCallback = (event: SSEEnvelope) => void;

export interface SSEStreamOptions {
  onEvent: SSEEventCallback;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Parse and consume a Server-Sent Events stream from a fetch Response.
 * The /api/v1/turns endpoint emits `data: {json}\n\n` lines.
 */
export async function consumeSSEStream(
  response: Response,
  options: SSEStreamOptions,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events (separated by double newline)
      const parts = buffer.split('\n\n');
      // Last part might be incomplete, keep it in buffer
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Parse "data: ..." lines
        for (const line of trimmed.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const event: SSEEnvelope = JSON.parse(line.slice(6));
              options.onEvent(event);
            } catch (e) {
              // Malformed JSON, skip
              console.warn('[SSE] Failed to parse event:', line, e);
            }
          }
        }
      }

      // Check abort
      if (options.signal?.aborted) {
        reader.cancel();
        break;
      }
    }
  } catch (error) {
    if (options.signal?.aborted) return;
    const err = error instanceof Error ? error : new Error(String(error));
    options.onError?.(err);
  }
}

/**
 * Submit a turn and consume the SSE stream.
 * This is the main entry point for sending a message to the chat backend.
 */
export async function submitTurn(
  body: {
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
  },
  options: SSEStreamOptions,
): Promise<void> {
  const token = getApiToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/api/v1/turns', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    let message = `Turn failed: HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      message = errBody.error ?? message;
    } catch {
      // ignore
    }
    throw new ApiRequestError(message, res.status);
  }

  await consumeSSEStream(res, options);
}

/**
 * Cancel a running turn.
 */
export async function cancelTurn(turnId: string): Promise<void> {
  await apiPost(`/api/v1/turns/${turnId}/cancel`);
}

/**
 * Submit user input for a paused turn (ask_user tool).
 */
export async function submitTurnInput(
  turnId: string,
  input: string,
): Promise<void> {
  await apiPost(`/api/v1/turns/${turnId}/input`, { input });
}
