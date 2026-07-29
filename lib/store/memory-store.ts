import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getApiToken } from '@/lib/auth-token';

export interface MemoryEntry {
  id: string;
  layer: 'L1' | 'L2' | 'L3';
  content: string;
  tags: string[];
  timestamp: string;
  source?: string;
}

interface ConsolidateResult {
  consolidated: boolean;
  traceCount?: number;
  surface?: string;
  reason?: string;
}

interface MemoryState {
  entries: MemoryEntry[];
  activeLayer: 'L1' | 'L2' | 'L3';
  synced: boolean;
  setActiveLayer: (l: 'L1' | 'L2' | 'L3') => void;
  addEntry: (e: MemoryEntry) => void;
  removeEntry: (id: string) => void;
  consolidate: (surface?: string) => Promise<ConsolidateResult>;
  syncFromServer: (surface?: string) => Promise<void>;
  writeEntry: (entry: MemoryEntry) => Promise<void>;
}

/** Build a stable ID from layer + timestamp + random suffix. */
function makeId(layer: string): string {
  return `${layer.toLowerCase()}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Build auth headers from localStorage token for API requests.
 * Mirrors the pattern used by the chat API client.
 * In 'disabled' or 'single' auth mode, the middleware auto-injects
 * headers, so no token is needed. In 'multi' mode, the token must
 * be present to avoid 401.
 */
function buildAuthHeaders(): Record<string, string> {
  const token = getApiToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      activeLayer: 'L1',
      synced: false,

      setActiveLayer: (l) => set({ activeLayer: l }),

      addEntry: (e) =>
        set((state) => ({
          entries: [...state.entries, e],
        })),

      removeEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        })),

      // ------------------------------------------------------------------
      // Consolidate — POST /api/v1/memory/consolidate
      // Triggers L1 → L2 consolidation on the server, then refreshes local
      // entries so the UI reflects the new state.
      // ------------------------------------------------------------------
      consolidate: async (surface = 'chat') => {
        try {
          const headers = buildAuthHeaders();

          const res = await fetch(
            `/api/v1/memory/consolidate?surface=${encodeURIComponent(surface)}`,
            { method: 'POST', headers },
          );

          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            let err: Record<string, unknown> = { error: `HTTP ${res.status}` };
            if (errText) {
              try { err = JSON.parse(errText); } catch { err = { error: errText.slice(0, 500) }; }
            }
            console.error(`[MemoryStore] consolidate failed: HTTP ${res.status}`, err);
            return { consolidated: false, reason: String(err.error ?? err.message ?? `HTTP ${res.status}`) };
          }

          const json = (await res.json()) as { success: boolean; data: ConsolidateResult };
          const result = json.data;

          // Refresh local entries from the server so the store stays in sync.
          if (result.consolidated) {
            await get().syncFromServer(surface);
          }

          return result;
        } catch (err) {
          console.error('[MemoryStore] consolidate error:', err);
          return {
            consolidated: false,
            reason: err instanceof Error ? err.message : 'Unknown error',
          };
        }
      },

      // ------------------------------------------------------------------
      // syncFromServer — pull L3 (all slots) and L2 summary into local state
      // ------------------------------------------------------------------
      syncFromServer: async (surface = 'chat') => {
        try {
          const headers = buildAuthHeaders();

          // Fetch all L3 synthesis slots and the L2 summary for the surface in parallel.
          const [l3Res, l2Res] = await Promise.all([
            fetch(`/api/v1/memory?layer=all_l3`, { headers }),
            fetch(`/api/v1/memory?layer=l2&surface=${encodeURIComponent(surface)}`, { headers }),
          ]);

          const newEntries: MemoryEntry[] = [];

          // --- L3 ---
          if (l3Res.ok) {
            const l3Json = await l3Res.json();
            const l3Text: string = l3Json.data ?? '';

            if (l3Text.trim()) {
              // The all_l3 response is markdown with "## SlotName" headings
              // separated by "---". Split into per-slot entries.
              const sections = l3Text.split(/\n---\n/);
              for (const section of sections) {
                const headingMatch = section.match(/^## (\w+)\n\n([\s\S]*)$/);
                if (headingMatch) {
                  const slot = headingMatch[1].toLowerCase();
                  const content = headingMatch[2].trim();
                  if (content) {
                    newEntries.push({
                      id: makeId('L3'),
                      layer: 'L3',
                      content,
                      tags: ['synthesis', slot],
                      timestamp: new Date().toISOString(),
                      source: slot,
                    });
                  }
                } else if (section.trim()) {
                  // Fallback: treat the whole section as one entry.
                  newEntries.push({
                    id: makeId('L3'),
                    layer: 'L3',
                    content: section.trim(),
                    tags: ['synthesis'],
                    timestamp: new Date().toISOString(),
                    source: 'general',
                  });
                }
              }
            }
          }

          // --- L2 ---
          if (l2Res.ok) {
            const l2Json = await l2Res.json();
            const l2Text: string = l2Json.data ?? '';

            if (l2Text.trim()) {
              newEntries.push({
                id: makeId('L2'),
                layer: 'L2',
                content: l2Text.trim(),
                tags: ['summary', surface],
                timestamp: new Date().toISOString(),
                source: surface,
              });
            }
          }

          set({ entries: newEntries, synced: true });
        } catch (err) {
          console.error('[MemoryStore] syncFromServer error:', err);
          // Don't flip synced to true on failure.
        }
      },

      // ------------------------------------------------------------------
      // writeEntry — POST /api/v1/memory with layer-appropriate body
      // ------------------------------------------------------------------
      writeEntry: async (entry) => {
        let body: Record<string, unknown>;

        switch (entry.layer) {
          case 'L1': {
            // L1 trace event: { event: { surface, kind, payload }, content }
            body = {
              content: entry.content,
              event: {
                surface: entry.source ?? 'chat',
                kind: entry.tags[0] ?? 'event',
                payload: { content: entry.content },
              },
            };
            break;
          }
          case 'L3': {
            // L3 synthesis slot: { slot, content }
            body = {
              slot: entry.source ?? 'recent',
              content: entry.content,
            };
            break;
          }
          case 'L2':
          default: {
            // L2 summary: { surface, content }
            body = {
              surface: entry.source ?? 'chat',
              content: entry.content,
            };
            break;
          }
        }

        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...buildAuthHeaders(),
          };

          const res = await fetch('/api/v1/memory', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            console.error('[MemoryStore] writeEntry failed:', err);
            throw new Error(err.error ?? `HTTP ${res.status}`);
          }

          // Optimistically add to local store if not already present.
          const exists = get().entries.some((e) => e.id === entry.id);
          if (!exists) {
            get().addEntry(entry);
          }
        } catch (err) {
          console.error('[MemoryStore] writeEntry error:', err);
          throw err;
        }
      },
    }),
    {
      name: 'sl-memory-storage',
      partialize: (state) => {
        // Exclude synced flag so syncFromServer runs on each page load.
        const { synced: _synced, ...rest } = state;
        void _synced;
        return rest;
      },
    },
  ),
);
