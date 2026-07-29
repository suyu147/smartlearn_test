import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ResourceType } from '@/lib/types/resource';

export interface AgentActivityEntry {
  agentId: string;
  agentName: string;
  status: 'running' | 'completed' | 'failed';
  resourceType: ResourceType;
  timestamp: number;
}

interface AgentActivityState {
  agentStatuses: Record<string, AgentActivityEntry>;
  activityLog: AgentActivityEntry[];
  updateAgentStatus: (entry: Omit<AgentActivityEntry, 'timestamp'>) => void;
  getActivityLog: () => AgentActivityEntry[];
  clearAll: () => void;
}

export const useAgentActivityStore = create<AgentActivityState>()(
  persist(
    (set, get) => ({
      agentStatuses: {},
      activityLog: [],

      updateAgentStatus: (entry) => {
        const fullEntry = { ...entry, timestamp: Date.now() };
        set((state) => ({
          agentStatuses: { ...state.agentStatuses, [entry.agentId]: fullEntry },
          activityLog: [...state.activityLog, fullEntry].slice(-100), // 保留最近100条
        }));
      },

      getActivityLog: () => get().activityLog,
      clearAll: () => set({ agentStatuses: {}, activityLog: [] }),
    }),
    { name: 'agent-activity-storage', partialize: (state) => ({ activityLog: state.activityLog }) },
  ),
);
