import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiGet, apiPost, apiDelete } from '@/lib/api-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('SessionStoreV2');

export interface Session {
  id: string;
  title: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'failed';
  // SmartLearn-specific session metadata (optional for backward compatibility)
  smartlearnProfileId?: string;
  smartlearnGoal?: string;
  smartlearnNodeCount?: number;
}

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  /** True after the first fetchSessions call completes (prevents duplicate fetches) */
  sessionsLoaded: boolean;
  addSession: (s: Session) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  getSessionsByMode: (mode: string) => Session[];
  /** Clear all sessions and reset sessionsLoaded so fetchSessions will re-fetch */
  resetSessions: () => void;
  // Server sync methods (all non-blocking / fire-and-forget)
  fetchSessions: () => Promise<void>;
  createSessionOnServer: (session: Session) => Promise<void>;
  deleteSessionOnServer: (id: string) => Promise<void>;
}

// Module-level flag to prevent concurrent fetch calls
let fetchInProgress = false;

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      sessionsLoaded: false,

      addSession: (s) =>
        set((state) => ({
          sessions: [...state.sessions, s],
        })),

      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId:
            state.activeSessionId === id ? null : state.activeSessionId,
        })),

      setActiveSession: (id) => set({ activeSessionId: id }),

      updateSession: (id, updates) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      getSessionsByMode: (mode) =>
        get().sessions.filter((s) => s.mode === mode),

      resetSessions: () => {
        set({ sessions: [], activeSessionId: null, sessionsLoaded: false });
      },

      // ------------------------------------------------------------------
      // Server sync (all non-blocking — errors caught and logged silently)
      // ------------------------------------------------------------------

      fetchSessions: async () => {
        if (fetchInProgress || get().sessionsLoaded) return;
        fetchInProgress = true;
        try {
          const serverSessions = await apiGet<Session[]>(
            '/api/v1/sessions',
          );
          set({ sessions: serverSessions, sessionsLoaded: true });
          log.info('Sessions fetched from server:', serverSessions.length);
        } catch (err) {
          log.warn('Failed to fetch sessions from server:', err);
          // Mark loaded even on failure to prevent retry loops
          set({ sessionsLoaded: true });
        } finally {
          fetchInProgress = false;
        }
      },

      createSessionOnServer: async (session) => {
        try {
          await apiPost('/api/v1/sessions', session);
          log.info('Session created on server:', session.id);
        } catch (err) {
          log.warn('Failed to create session on server:', err);
        }
      },

      deleteSessionOnServer: async (id) => {
        try {
          await apiDelete(`/api/v1/sessions/${id}`);
          log.info('Session deleted on server:', id);
        } catch (err) {
          log.warn('Failed to delete session on server:', err);
        }
      },
    }),
    {
      name: 'sl-session-storage',
      partialize: (state) => {
        // Exclude sessionsLoaded so fetchSessions runs on each page load.
        // Methods are functions and automatically stripped by JSON serialization.
        const { sessionsLoaded: _sessionsLoaded, ...rest } = state;
        void _sessionsLoaded; // suppress unused-var lint
        return rest;
      },
    },
  ),
);
