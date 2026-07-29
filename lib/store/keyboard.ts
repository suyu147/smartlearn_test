import { create } from 'zustand';

interface KeyboardState {
  ctrlOrShiftKeyActive: () => boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  setCtrlKey: (active: boolean) => void;
  setShiftKey: (active: boolean) => void;
}

export const useKeyboardStore = create<KeyboardState>()((set, get) => ({
  ctrlKey: false,
  shiftKey: false,
  ctrlOrShiftKeyActive: () => get().ctrlKey || get().shiftKey,
  setCtrlKey: (ctrlKey) => set({ ctrlKey }),
  setShiftKey: (shiftKey) => set({ shiftKey }),
}));
