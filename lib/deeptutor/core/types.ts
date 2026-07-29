/**
 * DeepTutor Core Types
 *
 * Unified type definitions migrated from DeepTutor Python (v1.4.2).
 * This is the foundational file for the entire migration — all other
 * modules depend on these types.
 *
 * Source: deeptutor/core/context.py, deeptutor/core/stream.py
 */

// ---------------------------------------------------------------------------
// Attachment — A file or image attached to the user message
// Source: deeptutor/core/context.py → Attachment dataclass
// ---------------------------------------------------------------------------

export interface Attachment {
  /** Attachment kind: "image" | "file" | "pdf" */
  type: string;
  url: string;
  base64: string;
  filename: string;
  mime_type: string;
  /** Stable per-attachment identifier; doubles as directory segment in AttachmentStore */
  id: string;
  /** Plain-text rendering of binary documents (PDF/DOCX/XLSX/PPTX) */
  extracted_text: string;
}

export function createAttachment(partial: Partial<Attachment> = {}): Attachment {
  return {
    type: '',
    url: '',
    base64: '',
    filename: '',
    mime_type: '',
    id: '',
    extracted_text: '',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// UnifiedContext — Everything a capability/tool needs for a single turn
// Source: deeptutor/core/context.py → UnifiedContext dataclass
// ---------------------------------------------------------------------------

export interface UnifiedContext {
  /** Persistent conversation identifier */
  sessionId: string;
  /** The current user input */
  userMessage: string;
  /** Previous messages in OpenAI format */
  conversationHistory: Record<string, unknown>[];
  /**
   * Tool names the user has toggled on (Level 1).
   * null = "not specified", [] = "explicitly disable all optional tools"
   */
  enabledTools: string[] | null;
  /** Capability name selected by the user, or null for plain chat */
  activeCapability: string | null;
  /** KB names to use for RAG */
  knowledgeBases: string[];
  /** Images / files sent with the message */
  attachments: Attachment[];
  /** Per-request config tweaks (e.g. temperature) */
  configOverrides: Record<string, unknown>;
  /** UI / response language ("en" | "zh" | "ja" | "ru") */
  language: string;
  /** Memory snapshot text injected into the system prompt */
  memoryContext: string;
  /** Skill instructions injected into the system prompt */
  skillsContext: string;
  /**
   * Plain-text manifest of attached sources (one line per source).
   * Consumed by chat capability to render "Attached Sources" section.
   */
  sourceManifest: string;
  /** Catch-all for capability-specific extras */
  metadata: Record<string, unknown>;
}

export function createUnifiedContext(
  partial: Partial<UnifiedContext> = {},
): UnifiedContext {
  return {
    sessionId: '',
    userMessage: '',
    conversationHistory: [],
    enabledTools: null,
    activeCapability: null,
    knowledgeBases: [],
    attachments: [],
    configOverrides: {},
    language: 'en',
    memoryContext: '',
    skillsContext: '',
    sourceManifest: '',
    metadata: {},
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// StreamEvent — Unified streaming event protocol
// Source: deeptutor/core/stream.py → StreamEventType + StreamEvent
// ---------------------------------------------------------------------------

/**
 * All possible event types in a streaming session.
 * DeepTutor v1.4.2 has 14 types + 3 Phase 1 extensions = 17 total.
 */
export type StreamEventType =
  | 'stage_start'
  | 'stage_end'
  | 'thinking'
  | 'observation'
  | 'content'
  | 'tool_call'
  | 'tool_result'
  | 'progress'
  | 'sources'
  | 'result'
  | 'error'
  | 'session'
  | 'session_meta'
  | 'done'
  | 'wait_for_input'
  | 'session_complete'
  | 'session_cancelled';

/** All valid StreamEventType values as a runtime array */
export const STREAM_EVENT_TYPES = [
  'stage_start',
  'stage_end',
  'thinking',
  'observation',
  'content',
  'tool_call',
  'tool_result',
  'progress',
  'sources',
  'result',
  'error',
  'session',
  'session_meta',
  'done',
  'wait_for_input',
  'session_complete',
  'session_cancelled',
] as const;

export interface StreamEvent {
  /** The semantic kind of this event */
  type: StreamEventType;
  /** Which tool / capability / plugin produced it (e.g. "deep_solve") */
  source: string;
  /** Current stage within the source (e.g. "planning") */
  stage: string;
  /** Human-readable text payload */
  content: string;
  /** Arbitrary structured data (tool args, sources, metrics, …) */
  metadata: Record<string, unknown>;
  /** Session this event belongs to */
  sessionId: string;
  /** Turn this event belongs to */
  turnId: string;
  /** Monotonic sequence number within the turn */
  seq: number;
  /** Unix epoch seconds when the event was created */
  timestamp: number;
}

export function createStreamEvent(
  type: StreamEventType,
  partial: Partial<Omit<StreamEvent, 'type'>> = {},
): StreamEvent {
  return {
    type,
    source: '',
    stage: '',
    content: '',
    metadata: {},
    sessionId: '',
    turnId: '',
    seq: 0,
    timestamp: Date.now() / 1000,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// TurnState — Tracks the state of a single turn
// ---------------------------------------------------------------------------

export type TurnStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TurnState {
  id: string;
  sessionId: string;
  status: TurnStatus;
  /** Capability name that handled this turn */
  capability: string | null;
  /** Accumulated token usage across all LLM calls in this turn */
  tokenUsage: TokenUsage;
  /** Timestamps */
  startedAt: number;
  completedAt: number | null;
  /** Error message if status is 'failed' */
  error: string | null;
}

export function createTurnState(
  id: string,
  sessionId: string,
): TurnState {
  return {
    id,
    sessionId,
    status: 'running',
    capability: null,
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    startedAt: Date.now() / 1000,
    completedAt: null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// ToolExecutionContext — Private kwargs injected via config.configurable
// Source: migration-guide.md §3, python-to-ts-spec.md §3
// ---------------------------------------------------------------------------

export interface ToolExecutionContext {
  _sandboxUserId?: string;
  _workdir?: string;
  _mounts?: string[];
  _masteryPathId?: string;
  _solveSessionId?: string;
  _vaultPath?: string;
  _toolLoader?: unknown; // DeferredToolLoader (defined later)
  _cronOwner?: string; // Phase 5+
  sourceIndex?: Record<string, string>;
  conversationHistory?: Record<string, unknown>[];
  currentUserMessage?: string;
}

// ---------------------------------------------------------------------------
// CapabilityConfig — LangGraph configurable payload
// ---------------------------------------------------------------------------

export interface CapabilityConfig {
  context: UnifiedContext;
  sessionId: string;
  userId: string;
  turnId: string;
  /** Private kwargs for tool execution */
  toolContext: ToolExecutionContext;
}
