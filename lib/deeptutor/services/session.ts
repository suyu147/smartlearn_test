/**
 * Session Service — Session/Turn/Message persistence via Prisma
 *
 * Phase 1 implementation: full CRUD for DeepTutor-style sessions.
 * Based on DeepTutor's SessionStoreProtocol (sqlite_store.py).
 *
 * Key features:
 * - Session with title, summary, preferences
 * - Turn lifecycle: running → completed/failed/cancelled
 * - Message tree (edit-branching via parentMessageId)
 * - Turn event persistence for replay
 * - Bulk event flush on turn finalization
 */

import { prisma } from '@/lib/utils/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('SessionService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TurnStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** JSON-safe value type compatible with Prisma */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonSafe = any;

/** Helper cast for Prisma JSON fields */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asJson = (val: unknown): any => val;

export interface SessionRecord {
  id: string;
  userId: string;
  title: string;
  capability: string | null;
  compressedSummary: string | null;
  summaryUpToMsgId: number | null;
  preferences: JsonSafe;
  metadata: JsonSafe;
  createdAt: Date;
  updatedAt: Date;
}

export interface TurnRecord {
  id: string;
  sessionId: string;
  capability: string | null;
  status: TurnStatus;
  error: string | null;
  tokenUsage: JsonSafe;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

export interface MessageRecord {
  id: number;
  sessionId: string;
  userId: string;
  role: MessageRole;
  content: string;
  capability: string | null;
  turnId: string | null;
  attachments: JsonSafe;
  metadata: JsonSafe;
  parentMessageId: number | null;
  createdAt: Date;
}

export interface TurnEventRecord {
  id: number;
  turnId: string;
  seq: number;
  type: string;
  source: string;
  stage: string;
  content: string;
  metadata: JsonSafe;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

/** Create a new session. Returns the session ID. */
export async function createSession(
  userId: string,
  options: {
    title?: string;
    capability?: string;
    preferences?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<string> {
  const data: Record<string, unknown> = {
    userId,
    title: options.title ?? 'New Chat',
    capability: options.capability ?? null,
  };
  if (options.preferences) data.preferences = options.preferences;
  if (options.metadata) data.metadata = options.metadata;

  const session = await prisma.dtSession.create({
    data: data as Parameters<typeof prisma.dtSession.create>[0]['data'],
  });
  log.debug(`Session created: ${session.id} (user: ${userId})`);
  return session.id;
}

/** Get a session by ID. Returns null if not found. */
export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  return prisma.dtSession.findUnique({
    where: { id: sessionId },
  });
}

/** Ensure a user exists; auto-create if missing (for middleware-injected userIds). */
async function ensureUser(userId: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return;

  await prisma.user.create({
    data: { id: userId, name: userId },
  });
  log.debug(`Auto-created user: ${userId}`);
}

/** Ensure a session exists; create if it doesn't. Returns the session. */
export async function ensureSession(
  sessionId: string,
  userId: string,
): Promise<SessionRecord> {
  // Ensure the user exists first (FK constraint: DtSession.userId → User.id)
  await ensureUser(userId);

  const existing = await prisma.dtSession.findUnique({ where: { id: sessionId } });
  if (existing) {
    // Touch updatedAt so incremental snapshot queries detect this session
    return prisma.dtSession.update({
      where: { id: sessionId },
      data: { title: existing.title }, // no-op write triggers @updatedAt
    });
  }

  return prisma.dtSession.create({
    data: { id: sessionId, userId, title: 'New Chat' },
  });
}

/** List sessions for a user, newest first. */
export async function listSessions(
  userId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<SessionRecord[]> {
  return prisma.dtSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 50,
    skip: options.offset ?? 0,
  });
}

/** Update session title. */
export async function updateSessionTitle(
  sessionId: string,
  title: string,
): Promise<boolean> {
  try {
    await prisma.dtSession.update({
      where: { id: sessionId },
      data: { title },
    });
    return true;
  } catch {
    return false;
  }
}

/** Update session compressed summary (used by context builder). */
export async function updateSessionSummary(
  sessionId: string,
  summary: string,
  upToMessageId: number,
): Promise<boolean> {
  try {
    await prisma.dtSession.update({
      where: { id: sessionId },
      data: {
        compressedSummary: summary,
        summaryUpToMsgId: upToMessageId,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Update session preferences. */
export async function updateSessionPreferences(
  sessionId: string,
  preferences: Record<string, unknown>,
): Promise<boolean> {
  try {
    await prisma.dtSession.update({
      where: { id: sessionId },
      data: { preferences: asJson(preferences) },
    });
    return true;
  } catch {
    return false;
  }
}

/** Delete a session and all its turns/messages/events (cascade). */
export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    await prisma.dtSession.delete({ where: { id: sessionId } });
    log.debug(`Session deleted: ${sessionId}`);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Turn CRUD
// ---------------------------------------------------------------------------

/** Create a new turn within a session. Returns the turn ID. */
export async function createTurn(
  sessionId: string,
  options: { capability?: string } = {},
): Promise<string> {
  const turn = await prisma.dtTurn.create({
    data: {
      sessionId,
      capability: options.capability ?? null,
      status: 'running',
    },
  });
  log.debug(`Turn created: ${turn.id} (session: ${sessionId})`);
  return turn.id;
}

/** Get a turn by ID. Returns null if not found. */
export async function getTurn(turnId: string): Promise<TurnRecord | null> {
  return prisma.dtTurn.findUnique({
    where: { id: turnId },
  });
}

/** Get the currently active (running) turn for a session. */
export async function getActiveTurn(sessionId: string): Promise<TurnRecord | null> {
  return prisma.dtTurn.findFirst({
    where: { sessionId, status: 'running' },
    orderBy: { createdAt: 'desc' },
  });
}

/** List all active turns for a session. */
export async function listActiveTurns(sessionId: string): Promise<TurnRecord[]> {
  return prisma.dtTurn.findMany({
    where: { sessionId, status: 'running' },
    orderBy: { createdAt: 'desc' },
  });
}

/** List all turns for a session, newest first. */
export async function listTurns(sessionId: string): Promise<TurnRecord[]> {
  return prisma.dtTurn.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
  });
}

/** Update turn status and optionally record an error. */
export async function updateTurnStatus(
  turnId: string,
  status: TurnStatus,
  options: { error?: string; tokenUsage?: Record<string, unknown> } = {},
): Promise<boolean> {
  try {
    const finishedAt = status !== 'running' ? new Date() : undefined;
    await prisma.dtTurn.update({
      where: { id: turnId },
      data: {
        status,
        error: options.error ?? undefined,
        tokenUsage: options.tokenUsage ? asJson(options.tokenUsage) : undefined,
        finishedAt,
      },
    });
    log.debug(`Turn ${turnId} → ${status}`);
    return true;
  } catch (err) {
    log.error(`Failed to update turn ${turnId}:`, err);
    return false;
  }
}

/** Cancel a running turn. Returns false if turn not found or already finished. */
export async function cancelTurn(turnId: string): Promise<boolean> {
  const turn = await prisma.dtTurn.findUnique({ where: { id: turnId } });
  if (!turn || turn.status !== 'running') return false;

  return updateTurnStatus(turnId, 'cancelled');
}

// ---------------------------------------------------------------------------
// Message CRUD
// ---------------------------------------------------------------------------

/** Add a message to a session. Returns the message ID. */
export async function addMessage(
  sessionId: string,
  userId: string,
  role: MessageRole,
  content: string,
  options: {
    capability?: string;
    turnId?: string;
    attachments?: Record<string, unknown>[];
    metadata?: Record<string, unknown>;
    parentMessageId?: number;
  } = {},
): Promise<number> {
  const msgData: Record<string, unknown> = {
    sessionId,
    userId,
    role,
    content,
    capability: options.capability ?? null,
    turnId: options.turnId ?? null,
    parentMessageId: options.parentMessageId ?? null,
  };
  if (options.attachments) msgData.attachments = options.attachments;
  if (options.metadata) msgData.metadata = options.metadata;

  const message = await prisma.dtMessage.create({
    data: msgData as Parameters<typeof prisma.dtMessage.create>[0]['data'],
  });
  return message.id;
}

/** Get messages for a session, ordered chronologically. */
export async function getMessages(
  sessionId: string,
  options: { limit?: number; afterId?: number } = {},
): Promise<MessageRecord[]> {
  return prisma.dtMessage.findMany({
    where: {
      sessionId,
      ...(options.afterId ? { id: { gt: options.afterId } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: options.limit,
  });
}

/**
 * Get messages for context building.
 * Walks the parent chain from leafMessageId to build a linear conversation history.
 * Returns messages in chronological order (oldest first).
 */
export async function getMessagesForContext(
  sessionId: string,
  leafMessageId?: number,
): Promise<MessageRecord[]> {
  if (!leafMessageId) {
    // No leaf specified — return all messages (linear mode, no branching)
    return prisma.dtMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Walk the parent chain from leaf to root
  const ancestors: MessageRecord[] = [];
  let currentId: number | null = leafMessageId;

  while (currentId !== null) {
    const msg: MessageRecord | null = await prisma.dtMessage.findUnique({
      where: { id: currentId },
    });
    if (!msg) break;
    ancestors.unshift(msg);
    currentId = msg.parentMessageId;
  }

  return ancestors;
}

/** Get the last message in a session (useful for regenerate). */
export async function getLastMessage(
  sessionId: string,
  role?: MessageRole,
): Promise<MessageRecord | null> {
  return prisma.dtMessage.findFirst({
    where: {
      sessionId,
      ...(role ? { role } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Turn Events
// ---------------------------------------------------------------------------

/** Append a single event to a turn. */
export async function appendTurnEvent(
  turnId: string,
  event: Omit<TurnEventRecord, 'id'>,
): Promise<number> {
  const record = await prisma.dtTurnEvent.create({
    data: {
      turnId,
      seq: event.seq,
      type: event.type,
      source: event.source,
      stage: event.stage,
      content: event.content,
      metadata: event.metadata ?? undefined,
      timestamp: event.timestamp,
    },
  });
  return record.id;
}

/** Batch-flush turn events (used on turn finalization for efficiency). */
export async function flushTurnEvents(
  turnId: string,
  events: Omit<TurnEventRecord, 'id'>[],
): Promise<number> {
  if (events.length === 0) return 0;

  await prisma.dtTurnEvent.createMany({
    data: events.map((e) => ({
      turnId,
      seq: e.seq,
      type: e.type,
      source: e.source,
      stage: e.stage,
      content: e.content,
      metadata: e.metadata ?? undefined,
      timestamp: e.timestamp,
    })),
  });

  log.debug(`Flushed ${events.length} events for turn ${turnId}`);
  return events.length;
}

/** Get turn events, optionally after a given sequence number (for replay). */
export async function getTurnEvents(
  turnId: string,
  options: { afterSeq?: number } = {},
): Promise<TurnEventRecord[]> {
  return prisma.dtTurnEvent.findMany({
    where: {
      turnId,
      ...(options.afterSeq ? { seq: { gt: options.afterSeq } } : {}),
    },
    orderBy: { seq: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Session Service singleton (for DI / future abstraction)
// ---------------------------------------------------------------------------

export const SessionService = {
  createSession,
  getSession,
  ensureSession,
  listSessions,
  updateSessionTitle,
  updateSessionSummary,
  updateSessionPreferences,
  deleteSession,
  createTurn,
  getTurn,
  getActiveTurn,
  listActiveTurns,
  listTurns,
  updateTurnStatus,
  cancelTurn,
  addMessage,
  getMessages,
  getMessagesForContext,
  getLastMessage,
  appendTurnEvent,
  flushTurnEvents,
  getTurnEvents,
} as const;
