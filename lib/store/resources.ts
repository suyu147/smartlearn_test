import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Resource, ResourceType } from '@/lib/types/resource';
import { useSessionsStore } from './sessions';
import { fetchResources, saveResources } from '@/lib/api/resources-api';
import { createLogger } from '@/lib/logger';

const log = createLogger('ResourcesStore');

interface StoredResourcesData {
  [sessionId: string]: Resource[];
}

interface ResourcesState {
  storedResources: StoredResourcesData;
  resources: Resource[];
  generatingTypes: ResourceType[];
  /** Whether data has been synced FROM the server for the current userId */
  synced: boolean;
  /** Which userId the synced flag refers to (reset when user switches) */
  lastSyncedUserId: string;

  addResource: (resource: Resource) => void;
  updateResource: (id: string, updates: Partial<Resource>) => void;
  removeResource: (id: string) => void;
  setGeneratingTypes: (types: ResourceType[]) => void;
  getResourcesByType: (type: ResourceType) => Resource[];
  loadResourcesForSession: (sessionId: string) => void;
  getResourcesForSession: (sessionId: string) => Resource[];
  reset: () => void;
  /** 彻底删除指定会话的资源数据 */
  deleteSessionData: (sessionId: string) => void;
  /** Fetch resources from server (by userId) and merge into current session */
  syncFromServer: (userId: string, sessionId: string) => Promise<void>;
  /** Push resources for all sessions to server (by userId) */
  syncToServer: (userId: string) => Promise<void>;
}

export const useResourcesStore = create<ResourcesState>()(
  persist(
    (set, get) => ({
      storedResources: {},
      resources: [],
      generatingTypes: [],
      synced: false,
      lastSyncedUserId: '',

      addResource: (resource) => {
        const sessionId = useSessionsStore.getState().currentSessionId;
        set((state) => {
          const updated = [...state.resources, resource];
          if (!sessionId) return { resources: updated };
          return {
            resources: updated,
            storedResources: { ...state.storedResources, [sessionId]: updated },
          };
        });
      },

      updateResource: (id, updates) => {
        const sessionId = useSessionsStore.getState().currentSessionId;
        set((state) => {
          const updated = state.resources.map((r) =>
            r.id === id ? { ...r, ...updates } : r,
          );
          if (!sessionId) return { resources: updated };
          return {
            resources: updated,
            storedResources: { ...state.storedResources, [sessionId]: updated },
          };
        });
      },

      removeResource: (id) => {
        const sessionId = useSessionsStore.getState().currentSessionId;
        set((state) => {
          const updated = state.resources.filter((r) => r.id !== id);
          if (!sessionId) return { resources: updated };
          return {
            resources: updated,
            storedResources: { ...state.storedResources, [sessionId]: updated },
          };
        });
      },

      setGeneratingTypes: (generatingTypes) => set({ generatingTypes }),

      getResourcesByType: (type) => get().resources.filter((r) => r.type === type),

      loadResourcesForSession: (sessionId) => {
        set((state) => ({
          resources: state.storedResources[sessionId] ?? [],
        }));
      },

      getResourcesForSession: (sessionId: string) => {
        return get().storedResources[sessionId] ?? [];
      },

      deleteSessionData: (sessionId: string) => {
        set((state) => {
          const { [sessionId]: _, ...rest } = state.storedResources;
          return { storedResources: rest, resources: state.resources, generatingTypes: state.generatingTypes };
        });
      },

      reset: () => {
        const sessionId = useSessionsStore.getState().currentSessionId;
        if (!sessionId) return set({ resources: [], generatingTypes: [] });
        set((state) => {
          const { [sessionId]: _, ...rest } = state.storedResources;
          return { storedResources: rest, resources: [], generatingTypes: [] };
        });
      },

      /**
       * Load resources from server for the given userId and merge them
       * into the current session's resource list.
       */
      syncFromServer: async (userId: string, sessionId: string) => {
        const state = get();
        // Reset sync flag when user changes
        if (state.lastSyncedUserId !== userId) {
          set({ synced: false, lastSyncedUserId: userId });
        }
        if (get().synced) return;

        try {
          const serverResources = await fetchResources(userId);
          if (serverResources.length > 0) {
            set((s) => {
              const existing = s.storedResources[sessionId] ?? [];
              const existingIds = new Set(existing.map((r) => r.id));
              const newOnes = serverResources.filter((r) => !existingIds.has(r.id));
              if (newOnes.length === 0) return { synced: true };

              const merged = [...existing, ...newOnes];
              return {
                storedResources: { ...s.storedResources, [sessionId]: merged },
                resources: s.resources.length > 0 ? [...s.resources, ...newOnes] : merged,
                synced: true,
              };
            });
          } else {
            set({ synced: true });
          }
        } catch (err) {
          log.error('syncFromServer failed:', err);
          set({ synced: true });
        }
      },

      /**
       * Push all resources across ALL sessions to the server.
       * This ensures resources from multiple sessions are persisted,
       * not just the current one.
       */
      syncToServer: async (userId: string) => {
        const { storedResources } = get();
        // Collect all resources across all sessions
        const allResources = Object.values(storedResources).flat();
        // Deduplicate by id
        const seen = new Set<string>();
        const unique = allResources.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });

        if (unique.length === 0) return;

        try {
          await saveResources(userId, unique);
          log.info(`Synced ${unique.length} resources to server for user=${userId}`);
        } catch (err) {
          log.error('syncToServer failed:', err);
        }
      },
    }),
    {
      name: 'resources-storage',
      version: 3,
      partialize: (state) => ({
        storedResources: state.storedResources,
        lastSyncedUserId: state.lastSyncedUserId,
      }),
      migrate: (persisted: unknown) => {
        const old = persisted as { storedResources?: StoredResourcesData };
        return { storedResources: old.storedResources ?? {}, lastSyncedUserId: '' };
      },
    },
  ),
);
