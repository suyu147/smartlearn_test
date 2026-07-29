import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiGet, apiPost, apiDelete } from '@/lib/api-client';

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  blockCount: number;
  indexStatus: 'ready' | 'indexing' | 'pending' | 'error';
  createdAt: string;
}

/**
 * Raw KB shape returned by the server (Prisma DtKnowledgeBase model).
 * Field names differ from the local KnowledgeBase interface.
 */
interface ServerKB {
  id: string;
  name: string;
  description: string;
  status: string; // DtKbStatus: initializing | processing | ready | error | needs_reindex
  documentCount: number;
  totalChunks: number;
  createdAt: string;
  _count?: { documents: number };
}

/** Map a server KB record to the local KnowledgeBase interface. */
function mapServerKb(server: ServerKB): KnowledgeBase {
  const statusMap: Record<string, KnowledgeBase['indexStatus']> = {
    initializing: 'pending',
    processing: 'indexing',
    ready: 'ready',
    error: 'error',
    needs_reindex: 'pending',
  };

  return {
    id: server.id,
    name: server.name,
    description: server.description,
    documentCount: server._count?.documents ?? server.documentCount ?? 0,
    blockCount: server.totalChunks ?? 0,
    indexStatus: statusMap[server.status] ?? 'pending',
    createdAt:
      typeof server.createdAt === 'string'
        ? server.createdAt
        : new Date(server.createdAt).toISOString(),
  };
}

interface KnowledgeState {
  knowledgeBases: KnowledgeBase[];
  /** True after the first syncFromServer call completes (prevents duplicate syncs). */
  synced: boolean;
  addKB: (kb: KnowledgeBase) => void;
  removeKB: (id: string) => void;
  updateKB: (id: string, updates: Partial<KnowledgeBase>) => void;
  // Server sync methods
  syncFromServer: () => Promise<void>;
  createKBOnServer: (name: string, description?: string) => Promise<void>;
  deleteKBOnServer: (id: string) => Promise<void>;
}

// Module-level flag to prevent concurrent sync calls
let syncInProgress = false;

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set) => ({
      knowledgeBases: [],
      synced: false,

      addKB: (kb) =>
        set((state) => ({
          knowledgeBases: [...state.knowledgeBases, kb],
        })),

      removeKB: (id) =>
        set((state) => ({
          knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
        })),

      updateKB: (id, updates) =>
        set((state) => ({
          knowledgeBases: state.knowledgeBases.map((kb) =>
            kb.id === id ? { ...kb, ...updates } : kb
          ),
        })),

      // -----------------------------------------------------------------
      // Server sync
      // -----------------------------------------------------------------

      syncFromServer: async () => {
        if (syncInProgress) return;
        syncInProgress = true;
        try {
          const body = await apiGet<{ knowledgeBases: ServerKB[] }>('/api/v1/knowledge');
          const serverKbs: ServerKB[] = body.knowledgeBases ?? [];
          set({
            knowledgeBases: serverKbs.map(mapServerKb),
            synced: true,
          });
        } catch (err) {
          console.warn('[KnowledgeStore] Failed to sync from server:', err);
          // Mark synced even on failure to prevent retry loops
          set({ synced: true });
        } finally {
          syncInProgress = false;
        }
      },

      createKBOnServer: async (name, description) => {
        const body = await apiPost<{ knowledgeBase: ServerKB }>('/api/v1/knowledge', {
          name,
          description: description ?? '',
        });
        const serverKb: ServerKB | undefined = body.knowledgeBase;
        if (serverKb) {
          set((state) => ({
            knowledgeBases: [
              mapServerKb(serverKb),
              ...state.knowledgeBases,
            ],
          }));
        }
      },

      deleteKBOnServer: async (id) => {
        await apiDelete(`/api/v1/knowledge/${id}`);
        set((state) => ({
          knowledgeBases: state.knowledgeBases.filter(
            (kb) => kb.id !== id
          ),
        }));
      },
    }),
    {
      name: 'sl-knowledge-storage',
      partialize: (state) => {
        // Exclude synced so syncFromServer runs on each page load.
        const { synced: _synced, ...rest } = state;
        void _synced; // suppress unused-var lint
        return rest;
      },
    }
  )
);
