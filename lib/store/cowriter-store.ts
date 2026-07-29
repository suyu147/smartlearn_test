import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CowriterDoc {
  id: string;
  title: string;
  content: string;
  version: number;
  lastEdited: string;
  status: 'saved' | 'editing' | 'ai-generating';
}

interface CowriterState {
  documents: CowriterDoc[];
  activeDocId: string | null;
  /** True after the first syncFromServer call completes (prevents duplicate fetches) */
  synced: boolean;
  addDoc: (d: CowriterDoc) => void;
  removeDoc: (id: string) => void;
  setActiveDoc: (id: string) => void;
  updateDocContent: (id: string, content: string) => void;
  // Server sync methods
  syncFromServer: () => Promise<void>;
  createDocOnServer: (title: string, content: string) => Promise<void>;
  deleteDocOnServer: (id: string) => Promise<void>;
  syncDocToServer: (id: string) => Promise<void>;
}

// Module-level flag to prevent concurrent sync calls
let syncInProgress = false;

export const useCowriterStore = create<CowriterState>()(
  persist(
    (set, get) => ({
      documents: [],
      activeDocId: null,
      synced: false,

      addDoc: (d) =>
        set((state) => ({
          documents: [...state.documents, d],
        })),

      removeDoc: (id) =>
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
          activeDocId:
            state.activeDocId === id ? null : state.activeDocId,
        })),

      setActiveDoc: (id) => set({ activeDocId: id }),

      updateDocContent: (id, content) =>
        set((state) => ({
          documents: state.documents.map((d) =>
            d.id === id
              ? {
                  ...d,
                  content,
                  version: d.version + 1,
                  lastEdited: new Date().toISOString(),
                  status: 'editing' as const,
                }
              : d
          ),
        })),

      // ------------------------------------------------------------------
      // Server sync (all non-blocking — errors caught and logged)
      // ------------------------------------------------------------------

      syncFromServer: async () => {
        if (syncInProgress || get().synced) return;
        syncInProgress = true;
        try {
          const res = await fetch('/api/v1/co-writer');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const serverDocs: CowriterDoc[] = (data as Record<string, unknown>[]).map(
            (d) => ({
              id: String(d.id),
              title: String(d.title ?? ''),
              content: String(d.content ?? ''),
              version: Number(d.version ?? 1),
              lastEdited: String(d.lastEdited ?? d.updatedAt ?? ''),
              status: 'saved' as const,
            }),
          );
          set({ documents: serverDocs, synced: true });
        } catch (err) {
          console.error('[CowriterStore] Failed to sync from server:', err);
          // Mark synced even on failure to prevent retry loops
          set({ synced: true });
        } finally {
          syncInProgress = false;
        }
      },

      createDocOnServer: async (title, content) => {
        try {
          const res = await fetch('/api/v1/co-writer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const newDoc: CowriterDoc = {
            id: String(data.id),
            title: String(data.title ?? title),
            content: String(data.content ?? content),
            version: Number(data.version ?? 1),
            lastEdited: String(data.lastEdited ?? data.updatedAt ?? new Date().toISOString()),
            status: 'saved' as const,
          };
          set((state) => ({
            documents: [...state.documents, newDoc],
          }));
        } catch (err) {
          console.error('[CowriterStore] Failed to create doc on server:', err);
        }
      },

      deleteDocOnServer: async (id) => {
        try {
          const res = await fetch(`/api/v1/co-writer/${id}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          set((state) => ({
            documents: state.documents.filter((d) => d.id !== id),
            activeDocId:
              state.activeDocId === id ? null : state.activeDocId,
          }));
        } catch (err) {
          console.error('[CowriterStore] Failed to delete doc on server:', err);
        }
      },

      syncDocToServer: async (id) => {
        try {
          const doc = get().documents.find((d) => d.id === id);
          if (!doc) {
            console.error('[CowriterStore] syncDocToServer: doc not found locally:', id);
            return;
          }
          const res = await fetch(`/api/v1/co-writer/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: doc.title, content: doc.content }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          set((state) => ({
            documents: state.documents.map((d) =>
              d.id === id
                ? {
                    ...d,
                    title: String(data.title ?? d.title),
                    content: String(data.content ?? d.content),
                    version: Number(data.version ?? d.version),
                    lastEdited: String(data.lastEdited ?? data.updatedAt ?? d.lastEdited),
                    status: 'saved' as const,
                  }
                : d
            ),
          }));
        } catch (err) {
          console.error('[CowriterStore] Failed to sync doc to server:', err);
        }
      },
    }),
    {
      name: 'sl-cowriter-storage',
      partialize: (state) => {
        // Exclude synced so syncFromServer runs on each page load.
        // Methods are functions and automatically stripped by JSON serialization.
        const { synced: _synced, ...rest } = state;
        void _synced; // suppress unused-var lint
        return rest;
      },
    },
  ),
);
