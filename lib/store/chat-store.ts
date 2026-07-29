import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ToolCall {
  name: string;
  status: string;
  input: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  /** Turn ID from the backend, used for regenerate */
  turnId?: string;
  /** Visualization render mode: svg | chartjs | mermaid | html */
  renderMode?: string;
  /** Image attachments sent with this message (data URLs for display) */
  imageUrls?: string[];
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentCapability: string;
  selectedModel: string;
  addMessage: (msg: ChatMessage) => void;
  removeMessage: (id: string) => void;
  replaceMessage: (id: string, msg: ChatMessage) => void;
  setStreaming: (v: boolean) => void;
  setCapability: (cap: string) => void;
  setModel: (model: string) => void;
  clearMessages: () => void;
  resetForNewUser: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isStreaming: false,
      currentCapability: 'chat',
      selectedModel: 'gpt-4o',

      addMessage: (msg) =>
        set((state) => ({
          messages: [...state.messages, msg],
        })),

      removeMessage: (id) =>
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== id),
        })),

      replaceMessage: (id, msg) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? msg : m)),
        })),

      setStreaming: (v) => set({ isStreaming: v }),

      setCapability: (cap) => set({ currentCapability: cap }),

      setModel: (model) => set({ selectedModel: model }),

      clearMessages: () => set({ messages: [] }),

      resetForNewUser: () => set({ messages: [], isStreaming: false, currentCapability: 'chat', selectedModel: 'gpt-4o' }),
    }),
    { name: 'chat-storage' }
  )
);
