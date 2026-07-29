import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PriorNodeFeedback, ResourceDecisionResultV2 } from '@/lib/generation/resource-decision';
import type { ResourceType } from '@/lib/types/resource';

export interface ResourceDecisionLog {
  sessionId: string;
  nodeId: string;
  createdAt: string;
  result: ResourceDecisionResultV2;
}

export interface NodeDecisionOverride {
  selectedTypes: ResourceType[];
  updatedAt: string;
}

export interface NodeDecisionFeedback {
  nodeId: string;
  acceptedTypes: ResourceType[];
  rejectedTypes: ResourceType[];
  clickedTypes: ResourceType[];
  viewedTypes: ResourceType[];
  dwellMsByType: Partial<Record<ResourceType, number>>;
  quizCompleted?: boolean;
  quizScore?: number;
  updatedAt: string;
}

interface ResourceDecisionsState {
  logsBySession: Record<string, ResourceDecisionLog[]>;
  overridesBySession: Record<string, Record<string, NodeDecisionOverride>>;
  feedbackBySession: Record<string, NodeDecisionFeedback[]>;
  addDecisionLog: (log: ResourceDecisionLog) => void;
  setNodeOverride: (sessionId: string, nodeId: string, selectedTypes: ResourceType[]) => void;
  clearNodeOverride: (sessionId: string, nodeId: string) => void;
  recordResourceClick: (sessionId: string, nodeId: string, type: ResourceType) => void;
  recordResourceView: (sessionId: string, nodeId: string, type: ResourceType, dwellMs: number) => void;
  recordQuizResult: (sessionId: string, nodeId: string, score: number, completed: boolean) => void;
  getLogsForSession: (sessionId: string) => ResourceDecisionLog[];
  getDecisionLogsForSession: (sessionId: string) => ResourceDecisionLog[];
  getOverrideForSession: (sessionId: string) => Record<string, ResourceType[]>;
  getFeedbackForSession: (sessionId: string) => PriorNodeFeedback[];
  clearSessionLogs: (sessionId: string) => void;
}

export const useResourceDecisionsStore = create<ResourceDecisionsState>()(
  persist(
    (set, get) => ({
      logsBySession: {},
      overridesBySession: {},
      feedbackBySession: {},

      addDecisionLog: (log) => {
        set((state) => {
          const logs = state.logsBySession[log.sessionId] ?? [];
          const nextLogs = [...logs.filter((item) => item.nodeId !== log.nodeId), log];
          return {
            logsBySession: {
              ...state.logsBySession,
              [log.sessionId]: nextLogs,
            },
          };
        });
      },

      setNodeOverride: (sessionId, nodeId, selectedTypes) => {
        set((state) => {
          const overrides = state.overridesBySession[sessionId] ?? {};
          const previousLog = (state.logsBySession[sessionId] ?? []).find((log) => log.nodeId === nodeId);
          const allTypes = previousLog?.result.items.map((item) => item.type) ?? ['document', 'mindmap', 'quiz', 'video', 'code', 'reading', 'ppt'];
          const feedback = state.feedbackBySession[sessionId] ?? [];
          const previousFeedback = feedback.find((item) => item.nodeId === nodeId);
          const nextFeedback = [
            ...feedback.filter((item) => item.nodeId !== nodeId),
            {
              nodeId,
              acceptedTypes: selectedTypes,
              rejectedTypes: allTypes.filter((type) => !selectedTypes.includes(type)),
              clickedTypes: previousFeedback?.clickedTypes ?? [],
              viewedTypes: previousFeedback?.viewedTypes ?? [],
              dwellMsByType: previousFeedback?.dwellMsByType ?? {},
              quizCompleted: previousFeedback?.quizCompleted,
              quizScore: previousFeedback?.quizScore,
              updatedAt: new Date().toISOString(),
            },
          ];

          return {
            overridesBySession: {
              ...state.overridesBySession,
              [sessionId]: {
                ...overrides,
                [nodeId]: {
                  selectedTypes,
                  updatedAt: new Date().toISOString(),
                },
              },
            },
            feedbackBySession: {
              ...state.feedbackBySession,
              [sessionId]: nextFeedback,
            },
          };
        });
      },

      clearNodeOverride: (sessionId, nodeId) => {
        set((state) => {
          const overrides = state.overridesBySession[sessionId] ?? {};
          const { [nodeId]: _removed, ...restOverrides } = overrides;
          return {
            overridesBySession: {
              ...state.overridesBySession,
              [sessionId]: restOverrides,
            },
          };
        });
      },

      recordResourceClick: (sessionId, nodeId, type) => {
        set((state) => {
          const feedback = state.feedbackBySession[sessionId] ?? [];
          const previousFeedback = feedback.find((item) => item.nodeId === nodeId);
          const nextItem: NodeDecisionFeedback = {
            nodeId,
            acceptedTypes: previousFeedback?.acceptedTypes ?? [],
            rejectedTypes: previousFeedback?.rejectedTypes ?? [],
            clickedTypes: Array.from(new Set([...(previousFeedback?.clickedTypes ?? []), type])),
            viewedTypes: previousFeedback?.viewedTypes ?? [],
            dwellMsByType: previousFeedback?.dwellMsByType ?? {},
            quizCompleted: previousFeedback?.quizCompleted,
            quizScore: previousFeedback?.quizScore,
            updatedAt: new Date().toISOString(),
          };
          return {
            feedbackBySession: {
              ...state.feedbackBySession,
              [sessionId]: [...feedback.filter((item) => item.nodeId !== nodeId), nextItem],
            },
          };
        });
      },

      recordResourceView: (sessionId, nodeId, type, dwellMs) => {
        set((state) => {
          const feedback = state.feedbackBySession[sessionId] ?? [];
          const previousFeedback = feedback.find((item) => item.nodeId === nodeId);
          const previousDwell = previousFeedback?.dwellMsByType?.[type] ?? 0;
          const nextItem: NodeDecisionFeedback = {
            nodeId,
            acceptedTypes: previousFeedback?.acceptedTypes ?? [],
            rejectedTypes: previousFeedback?.rejectedTypes ?? [],
            clickedTypes: previousFeedback?.clickedTypes ?? [],
            viewedTypes: Array.from(new Set([...(previousFeedback?.viewedTypes ?? []), type])),
            dwellMsByType: {
              ...(previousFeedback?.dwellMsByType ?? {}),
              [type]: previousDwell + Math.max(dwellMs, 0),
            },
            quizCompleted: previousFeedback?.quizCompleted,
            quizScore: previousFeedback?.quizScore,
            updatedAt: new Date().toISOString(),
          };
          return {
            feedbackBySession: {
              ...state.feedbackBySession,
              [sessionId]: [...feedback.filter((item) => item.nodeId !== nodeId), nextItem],
            },
          };
        });
      },

      recordQuizResult: (sessionId, nodeId, score, completed) => {
        set((state) => {
          const feedback = state.feedbackBySession[sessionId] ?? [];
          const previousFeedback = feedback.find((item) => item.nodeId === nodeId);
          const nextItem: NodeDecisionFeedback = {
            nodeId,
            acceptedTypes: previousFeedback?.acceptedTypes ?? [],
            rejectedTypes: previousFeedback?.rejectedTypes ?? [],
            clickedTypes: previousFeedback?.clickedTypes ?? [],
            viewedTypes: previousFeedback?.viewedTypes ?? [],
            dwellMsByType: previousFeedback?.dwellMsByType ?? {},
            quizCompleted: completed,
            quizScore: score,
            updatedAt: new Date().toISOString(),
          };
          return {
            feedbackBySession: {
              ...state.feedbackBySession,
              [sessionId]: [...feedback.filter((item) => item.nodeId !== nodeId), nextItem],
            },
          };
        });
      },

      getLogsForSession: (sessionId) => get().logsBySession[sessionId] ?? [],

      getDecisionLogsForSession: (sessionId) => get().logsBySession[sessionId] ?? [],

      getOverrideForSession: (sessionId) => {
        const overrides = get().overridesBySession[sessionId] ?? {};
        return Object.fromEntries(
          Object.entries(overrides).map(([nodeId, override]) => [nodeId, override.selectedTypes]),
        );
      },

      getFeedbackForSession: (sessionId) => {
        const feedback = get().feedbackBySession[sessionId] ?? [];
        return feedback.map((item) => ({
          nodeId: item.nodeId,
          acceptedTypes: item.acceptedTypes,
          rejectedTypes: item.rejectedTypes,
          clickedTypes: item.clickedTypes,
          viewedTypes: item.viewedTypes,
          dwellMsByType: item.dwellMsByType,
          quizCompleted: item.quizCompleted,
          quizScore: item.quizScore,
        }));
      },

      clearSessionLogs: (sessionId) => {
        set((state) => {
          const { [sessionId]: _removed, ...restLogs } = state.logsBySession;
          const { [sessionId]: _removedOverrides, ...restOverrides } = state.overridesBySession;
          const { [sessionId]: _removedFeedback, ...restFeedback } = state.feedbackBySession;
          return {
            logsBySession: restLogs,
            overridesBySession: restOverrides,
            feedbackBySession: restFeedback,
          };
        });
      },
    }),
    {
      name: 'resource-decisions-storage',
      version: 2,
      partialize: (state) => ({
        logsBySession: state.logsBySession,
        overridesBySession: state.overridesBySession,
        feedbackBySession: state.feedbackBySession,
      }),
    },
  ),
);
