import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LearningPath, LearningPathNode, PathNodeStatus } from '@/lib/types/learning-path';
import { useSessionsStore } from './sessions';
import { fetchLearningPaths, saveLearningPath } from '@/lib/api/learning-path-api';
import { createLogger } from '@/lib/logger';

const log = createLogger('LearningPathStore');

function getNodeDependencies(path: LearningPath, node: LearningPathNode) {
  if (node.prerequisites.length > 0) {
    return node.prerequisites;
  }

  return path.edges.filter((edge) => edge.to === node.id).map((edge) => edge.from);
}

function reconcilePathStatuses(path: LearningPath): LearningPath {
  const completedNodeIds = new Set(
    path.nodes.filter((node) => node.status === 'completed').map((node) => node.id),
  );

  const eligibleNodeIds = new Set(
    path.nodes
      .filter((node) => node.status !== 'completed')
      .filter((node) => getNodeDependencies(path, node).every((dependencyId) => completedNodeIds.has(dependencyId)))
      .map((node) => node.id),
  );

  let nextActiveNodeId = path.nodes.find(
    (node) => node.status === 'in_progress' && eligibleNodeIds.has(node.id),
  )?.id;

  if (!nextActiveNodeId) {
    nextActiveNodeId = path.nodes.find(
      (node) => node.status !== 'completed' && eligibleNodeIds.has(node.id),
    )?.id;
  }

  return {
    ...path,
    nodes: path.nodes.map((node) => {
      if (node.status === 'completed') {
        return { ...node, status: 'completed' as const };
      }

      if (!eligibleNodeIds.has(node.id)) {
        return { ...node, status: 'locked' as const };
      }

      if (node.id === nextActiveNodeId) {
        return { ...node, status: 'in_progress' as const };
      }

      return { ...node, status: 'available' as const };
    }),
  };
}

interface StoredPathData {
  [sessionId: string]: LearningPath;
}

interface LearningPathState {
  storedPaths: StoredPathData;
  path: LearningPath | null;
  isPlanning: boolean;
  synced: boolean;

  setPath: (path: LearningPath | null) => void;
  updateNodeStatus: (nodeId: string, status: PathNodeStatus) => void;
  setPlanning: (planning: boolean) => void;
  loadPathForSession: (sessionId: string) => void;
  reset: () => void;
  getPathForSession: (sessionId: string) => LearningPath | null;
  /** 彻底删除指定会话的路径数据 */
  deleteSessionData: (sessionId: string) => void;
  /** Fetch paths from server and merge with local state */
  syncFromServer: (userId: string) => Promise<void>;
  /** Push local paths to server */
  syncToServer: (userId: string) => Promise<void>;
}

export const useLearningPathStore = create<LearningPathState>()(
  persist(
    (set, get) => ({
      storedPaths: {},
      path: null,
      isPlanning: false,
      synced: false,

      setPath: (newPath) => {
        const sessionId = useSessionsStore.getState().currentSessionId;
        if (!sessionId) return;
        set((state) => ({
          path: newPath,
          storedPaths: newPath
            ? { ...state.storedPaths, [sessionId]: newPath }
            : state.storedPaths,
        }));
      },

      updateNodeStatus: (nodeId, status) => {
        const sessionId = useSessionsStore.getState().currentSessionId;
        set((state) => {
          const currentPath = state.path ?? state.storedPaths[sessionId ?? ''] ?? null;
          if (!currentPath) return state;
          const updatedPath = reconcilePathStatuses({
            ...currentPath,
            nodes: currentPath.nodes.map((node) =>
              node.id === nodeId ? { ...node, status } : node,
            ),
          });
          if (!sessionId) return { path: updatedPath };
          return {
            path: updatedPath,
            storedPaths: { ...state.storedPaths, [sessionId]: updatedPath },
          };
        });
      },

      setPlanning: (isPlanning) => set({ isPlanning }),

      loadPathForSession: (sessionId) => {
        set((state) => ({
          path: state.storedPaths[sessionId] ?? null,
        }));
      },

      reset: () => {
        const sessionId = useSessionsStore.getState().currentSessionId;
        if (!sessionId) return set({ path: null });
        set((state) => {
          const { [sessionId]: _, ...rest } = state.storedPaths;
          return { storedPaths: rest, path: null, isPlanning: false };
        });
      },

      getPathForSession: (sessionId: string) => {
        return get().storedPaths[sessionId] ?? null;
      },

      deleteSessionData: (sessionId: string) => {
        set((state) => {
          const { [sessionId]: _, ...rest } = state.storedPaths;
          return { storedPaths: rest, path: state.path, isPlanning: state.isPlanning };
        });
      },

      syncFromServer: async (userId: string) => {
        if (get().synced) return;
        try {
          const serverPaths = await fetchLearningPaths(userId);
          if (serverPaths.length > 0) {
            set((state) => {
              const merged = { ...state.storedPaths };
              for (const serverPath of serverPaths) {
                // Server data supplements local; do not overwrite existing local paths
                if (!merged[serverPath.id]) {
                  merged[serverPath.id] = serverPath;
                }
              }
              return { storedPaths: merged, synced: true };
            });
          } else {
            set({ synced: true });
          }
        } catch (err) {
          log.error('syncFromServer failed:', err);
          set({ synced: true });
        }
      },

      syncToServer: async (userId: string) => {
        const { storedPaths } = get();
        try {
          for (const path of Object.values(storedPaths)) {
            await saveLearningPath(userId, path);
          }
        } catch (err) {
          log.error('syncToServer failed:', err);
        }
      },
    }),
    {
      name: 'learning-path-storage',
      version: 2,
      partialize: (state) => ({ storedPaths: state.storedPaths }),
      migrate: () => ({ storedPaths: {} }),
    },
  ),
);