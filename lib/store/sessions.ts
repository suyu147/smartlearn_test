import { generateId } from '@/lib/utils';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LearningSession {
  id: string;
  profileId: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  status: 'active' | 'completed' | 'paused';
}

export interface TutorChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachedResourceIds?: string[];
}

interface SessionsState {
  sessions: LearningSession[];
  currentSessionId: string | null;
  tutorMessagesBySession: Record<string, TutorChatMessage[]>;

  createSession: (profileId: string, goal: string) => LearningSession;
  switchSession: (sessionId: string | null) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  deleteSession: (sessionId: string) => void;
  updateSessionStatus: (sessionId: string, status: LearningSession['status']) => void;
  setTutorMessages: (sessionId: string, messages: TutorChatMessage[]) => void;
  appendTutorMessage: (sessionId: string, message: TutorChatMessage) => void;
  updateTutorMessage: (sessionId: string, messageId: string, content: string) => void;
  clearTutorMessages: (sessionId: string) => void;
  getTutorMessages: (sessionId: string) => TutorChatMessage[];

  getCurrentSession: () => LearningSession | null;
  getSessionsCount: () => number;
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      tutorMessagesBySession: {},

      createSession: (profileId: string, goal: string) => {
        const now = new Date().toISOString();
        const state = get();

        // 自动补全当前活跃会话（如果存在且不同于新profile）
        let updatedSessions = [...state.sessions];
        if (state.currentSessionId) {
          updatedSessions = updatedSessions.map(s =>
            s.id === state.currentSessionId && s.status === 'active'
              ? { ...s, status: 'completed' as const, updatedAt: now }
              : s
          );
        }

        const session: LearningSession = {
          id: generateId(),
          profileId,
          goal,
          title: goal.slice(0, 30) + (goal.length > 30 ? '...' : ''),
          createdAt: now,
          updatedAt: now,
          status: 'active',
        };
        set({
          sessions: [...updatedSessions, session],
          currentSessionId: session.id,
        });
        return session;
      },

      switchSession: (sessionId) => {
        set({ currentSessionId: sessionId });
      },

      updateSessionTitle: (sessionId, title) => {
        set({
          sessions: get().sessions.map(s =>
            s.id === sessionId ? { ...s, title, updatedAt: new Date().toISOString() } : s
          ),
        });
      },

      updateSessionStatus: (sessionId, status) => {
        set({
          sessions: get().sessions.map(s =>
            s.id === sessionId ? { ...s, status, updatedAt: new Date().toISOString() } : s
          ),
        });
      },

      setTutorMessages: (sessionId, messages) => {
        set((state) => ({
          tutorMessagesBySession: {
            ...state.tutorMessagesBySession,
            [sessionId]: messages,
          },
        }));
      },

      appendTutorMessage: (sessionId, message) => {
        set((state) => ({
          tutorMessagesBySession: {
            ...state.tutorMessagesBySession,
            [sessionId]: [...(state.tutorMessagesBySession[sessionId] ?? []), message],
          },
        }));
      },

      updateTutorMessage: (sessionId, messageId, content) => {
        set((state) => ({
          tutorMessagesBySession: {
            ...state.tutorMessagesBySession,
            [sessionId]: (state.tutorMessagesBySession[sessionId] ?? []).map((message) =>
              message.id === messageId ? { ...message, content } : message,
            ),
          },
        }));
      },

      clearTutorMessages: (sessionId) => {
        set((state) => ({
          tutorMessagesBySession: {
            ...state.tutorMessagesBySession,
            [sessionId]: [],
          },
        }));
      },

      getTutorMessages: (sessionId) => get().tutorMessagesBySession[sessionId] ?? [],

      deleteSession: (sessionId) => {
        set((state) => {
          const sessions = state.sessions.filter((session) => session.id !== sessionId);
          const { [sessionId]: _removedMessages, ...tutorMessagesBySession } = state.tutorMessagesBySession;
          return {
            sessions,
            tutorMessagesBySession,
            currentSessionId: state.currentSessionId === sessionId
              ? sessions[0]?.id || null
              : state.currentSessionId,
          };
        });
      },

      getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return sessions.find(s => s.id === currentSessionId) || null;
      },

      getSessionsCount: () => get().sessions.length,
    }),
    { name: 'learning-sessions-storage' },
  )
);