'use client';

import { useEffect, useMemo } from 'react';
import { useSessionStore } from '@/lib/store/session-store';
import type { Session } from '@/lib/store/session-store';

/**
 * A session enriched with V1-compatible alias fields.
 *
 * V1 code expects `profileId` and `goal` at the top level; in V2 these
 * live under `smartlearnProfileId` and `smartlearnGoal`. This type
 * exposes both so consumers can migrate gradually.
 */
export interface UnifiedSession extends Session {
  /** V1 alias for smartlearnProfileId */
  profileId: string | undefined;
  /** V1 alias for smartlearnGoal */
  goal: string | undefined;
}

/**
 * Unified sessions hook — reads from the V2 session store as the canonical
 * source and provides V1-compatible methods (`createSession`, `switchSession`,
 * `deleteSession`, etc.).
 *
 * V1 components can migrate to this hook incrementally. Once every consumer
 * uses this hook the V1 store (`useSessionsStore`) can be retired.
 */
export function useUnifiedSessions() {
  const store = useSessionStore();

  // Trigger a one-time server fetch on first mount
  useEffect(() => {
    if (!store.sessionsLoaded) {
      store.fetchSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map sessions to include V1-compatible alias fields
  const sessions: UnifiedSession[] = useMemo(
    () =>
      store.sessions.map((s) => ({
        ...s,
        profileId: s.smartlearnProfileId,
        goal: s.smartlearnGoal,
      })),
    [store.sessions],
  );

  const currentSession: UnifiedSession | null = useMemo(() => {
    const found = store.sessions.find(
      (s) => s.id === store.activeSessionId,
    );
    if (!found) return null;
    return {
      ...found,
      profileId: found.smartlearnProfileId,
      goal: found.smartlearnGoal,
    };
  }, [store.sessions, store.activeSessionId]);

  return {
    // ---- State ----
    sessions,
    activeSessionId: store.activeSessionId,
    sessionsLoaded: store.sessionsLoaded,
    currentSession,

    // ---- V2 methods (direct) ----
    addSession: store.addSession,
    updateSession: store.updateSession,
    getSessionsByMode: store.getSessionsByMode,

    // ---- V1-compatible method aliases ----

    /** Create a session locally AND on the server (fire-and-forget) */
    createSession: (session: Session) => {
      store.addSession(session);
      store.createSessionOnServer(session);
    },

    /** Switch the active session (V1 name: switchSession) */
    switchSession: store.setActiveSession,

    /** Also exposed under the V2 name for consistency */
    setActiveSession: store.setActiveSession,

    /** Remove a session locally AND on the server (fire-and-forget) */
    removeSession: (id: string) => {
      store.removeSession(id);
      store.deleteSessionOnServer(id);
    },

    /** Alias for removeSession (V1 name: deleteSession) */
    deleteSession: (id: string) => {
      store.removeSession(id);
      store.deleteSessionOnServer(id);
    },

    /** Get the currently active session (V1 name) */
    getCurrentSession: (): UnifiedSession | null => currentSession,

    /** Total number of sessions */
    getSessionsCount: (): number => store.sessions.length,

    // ---- Server sync (advanced — prefer the convenience methods above) ----
    fetchSessions: store.fetchSessions,
    createSessionOnServer: store.createSessionOnServer,
    deleteSessionOnServer: store.deleteSessionOnServer,
  };
}
