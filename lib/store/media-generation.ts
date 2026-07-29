import { create } from 'zustand';

export interface MediaGenerationTask {
  id: string;
  elementId: string;
  type: 'image' | 'video';
  prompt: string;
  status: 'pending' | 'generating' | 'done' | 'failed';
  resultUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface MediaGenerationState {
  tasks: Record<string, MediaGenerationTask>;
  addTask: (task: MediaGenerationTask) => void;
  updateTask: (id: string, updates: Partial<MediaGenerationTask>) => void;
  removeTask: (id: string) => void;
  getTask: (elementId: string) => MediaGenerationTask | undefined;
}

export const useMediaGenerationStore = create<MediaGenerationState>()((set, get) => ({
  tasks: {},
  addTask: (task) =>
    set((state) => ({ tasks: { ...state.tasks, [task.id]: task } })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: state.tasks[id] ? { ...state.tasks[id], ...updates } : updates as MediaGenerationTask,
      },
    })),
  removeTask: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.tasks;
      return { tasks: rest };
    }),
  getTask: (elementId: string) => {
    const tasks = get().tasks;
    // First try direct ID lookup (task.id matches the placeholder ID like "gen_vid_1")
    if (tasks[elementId]) return tasks[elementId];
    // Fall back to searching by elementId field (the slide element ID)
    return Object.values(tasks).find((t) => t.elementId === elementId);
  },
}));

export function isMediaPlaceholder(src: string): boolean {
  return /^gen_(img|vid)_/.test(src);
}
