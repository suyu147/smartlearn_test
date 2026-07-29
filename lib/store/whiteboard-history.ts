import { create } from 'zustand';

interface WhiteboardHistoryState {
  snapshots: Array<Array<Record<string, unknown>>>;
  pushSnapshot: (elements: Array<Record<string, unknown>>) => void;
  popSnapshot: () => Array<Record<string, unknown>> | undefined;
  clear: () => void;
}

export const useWhiteboardHistoryStore = create<WhiteboardHistoryState>()((set, get) => ({
  snapshots: [],
  pushSnapshot: (elements) =>
    set((state) => ({ snapshots: [...state.snapshots, elements] })),
  popSnapshot: () => {
    const snapshots = get().snapshots;
    if (snapshots.length === 0) return undefined;
    const last = snapshots[snapshots.length - 1];
    set({ snapshots: snapshots.slice(0, -1) });
    return last;
  },
  clear: () => set({ snapshots: [] }),
}));
