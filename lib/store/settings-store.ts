import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiGet, apiPut } from '@/lib/api-client';
import { createLogger } from '@/lib/logger';
import type {
  TTSProviderId,
  ASRProviderId,
  TTSProviderConfig,
  ASRProviderConfig,
} from '@/lib/audio/types';

const log = createLogger('SettingsStoreV2');

/** Shape of settings returned by the server (all fields optional for safe merging) */
interface ServerSettingsResponse {
  theme?: 'light' | 'dark' | 'snow' | 'glass' | 'system';
  language?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingMode?: boolean;
  autoContextWindow?: boolean;
  contextWindowThreshold?: number;
  rateLimitEnabled?: boolean;
  sparkApiKey?: string;
  sparkApiSecret?: string;
  sparkModelId?: string;
  generatePptImages?: boolean;
  maxTurns?: string;
  selectedAgentIds?: string[];
  smartlearnProviderId?: string;
  smartlearnModelId?: string;
  smartlearnApiKey?: string;
  smartlearnBaseUrl?: string;
  disabledAgentIds?: string[];
  maxResourceConcurrency?: number;
  ttsProviderId?: TTSProviderId;
  ttsVoice?: string;
  ttsSpeed?: number;
  asrProviderId?: ASRProviderId;
  asrLanguage?: string;
}

interface SettingsState {
  // LLM
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  thinkingMode: boolean;
  autoContextWindow: boolean;
  contextWindowThreshold: number;
  rateLimitEnabled: boolean;
  // Appearance
  theme: 'light' | 'dark' | 'snow' | 'glass' | 'system';
  language: string;
  // SmartLearn-specific settings (bridged from v1 useSettingsStore)
  smartlearnProviderId?: string;
  smartlearnModelId?: string;
  smartlearnApiKey?: string;
  smartlearnBaseUrl?: string;
  disabledAgentIds?: string[];
  maxResourceConcurrency?: number;
  // V1 bridge: Spark LLM provider
  sparkApiKey: string;
  sparkApiSecret: string;
  sparkModelId: string;
  // V1 bridge: PPT / agent selection
  generatePptImages: boolean;
  maxTurns: string;
  selectedAgentIds: string[];
  // V1 bridge: TTS
  ttsProviderId: TTSProviderId;
  ttsVoice: string;
  ttsSpeed: number;
  ttsProvidersConfig: Partial<Record<TTSProviderId, TTSProviderConfig>>;
  // V1 bridge: ASR
  asrProviderId: ASRProviderId;
  asrLanguage: string;
  asrProvidersConfig: Partial<Record<ASRProviderId, ASRProviderConfig>>;
  // Sync state (not persisted — resets on each page load)
  hydrated: boolean;
  // Methods — LLM
  setDefaultModel: (m: string) => void;
  setTemperature: (t: number) => void;
  setMaxTokens: (n: number) => void;
  toggleThinkingMode: () => void;
  toggleAutoContextWindow: () => void;
  toggleRateLimit: () => void;
  // Methods — Appearance
  setTheme: (t: SettingsState['theme']) => void;
  setLanguage: (l: string) => void;
  // Methods — SmartLearn
  setSmartlearnModel: (providerId: string, modelId: string) => void;
  setSmartlearnApiKey: (key: string) => void;
  setSmartlearnBaseUrl: (url: string) => void;
  setDisabledAgentIds: (ids: string[]) => void;
  setMaxResourceConcurrency: (n: number) => void;
  // Methods — V1 bridge setters
  setSparkApiKey: (key: string) => void;
  setSparkApiSecret: (secret: string) => void;
  setSparkModelId: (id: string) => void;
  setGeneratePptImages: (enabled: boolean) => void;
  setMaxTurns: (turns: string) => void;
  setSelectedAgentIds: (ids: string[]) => void;
  // Methods — Server sync
  syncFromServer: () => Promise<void>;
  syncToServer: () => Promise<void>;
}

// Module-level flag to prevent concurrent sync calls across multiple components
let syncInProgress = false;

export const useSettingsStoreV2 = create<SettingsState>()(
  persist(
    (set, get) => ({
      // LLM defaults
      defaultModel: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096,
      thinkingMode: true,
      autoContextWindow: true,
      contextWindowThreshold: 0.9,
      rateLimitEnabled: false,
      // Appearance defaults
      theme: 'system',
      language: 'zh-CN',
      // SmartLearn defaults
      smartlearnProviderId: '',
      smartlearnModelId: '',
      smartlearnApiKey: '',
      smartlearnBaseUrl: '',
      disabledAgentIds: [],
      maxResourceConcurrency: 3,
      // V1 bridge defaults — Spark
      sparkApiKey: '',
      sparkApiSecret: '',
      sparkModelId: 'generalv3',
      // V1 bridge defaults — PPT / agents
      generatePptImages: false,
      maxTurns: '',
      selectedAgentIds: [],
      // V1 bridge defaults — TTS
      ttsProviderId: 'openai-tts' as TTSProviderId,
      ttsVoice: 'alloy',
      ttsSpeed: 1.0,
      ttsProvidersConfig: {},
      // V1 bridge defaults — ASR
      asrProviderId: 'openai-whisper' as ASRProviderId,
      asrLanguage: 'auto',
      asrProvidersConfig: {},
      // Sync state
      hydrated: false,

      // LLM methods
      setDefaultModel: (m) => set({ defaultModel: m }),
      setTemperature: (t) => set({ temperature: t }),
      setMaxTokens: (n) => set({ maxTokens: n }),
      toggleThinkingMode: () =>
        set((state) => ({ thinkingMode: !state.thinkingMode })),
      toggleAutoContextWindow: () =>
        set((state) => ({ autoContextWindow: !state.autoContextWindow })),
      toggleRateLimit: () =>
        set((state) => ({ rateLimitEnabled: !state.rateLimitEnabled })),

      // Appearance methods
      setTheme: (t) => set({ theme: t }),
      setLanguage: (l) => set({ language: l }),

      // SmartLearn methods
      setSmartlearnModel: (providerId, modelId) =>
        set({ smartlearnProviderId: providerId, smartlearnModelId: modelId }),
      setSmartlearnApiKey: (key) => set({ smartlearnApiKey: key }),
      setSmartlearnBaseUrl: (url) => set({ smartlearnBaseUrl: url }),
      setDisabledAgentIds: (ids) => set({ disabledAgentIds: ids }),
      setMaxResourceConcurrency: (n) => set({ maxResourceConcurrency: n }),

      // V1 bridge setters
      setSparkApiKey: (key) => set({ sparkApiKey: key }),
      setSparkApiSecret: (secret) => set({ sparkApiSecret: secret }),
      setSparkModelId: (id) => set({ sparkModelId: id }),
      setGeneratePptImages: (enabled) => set({ generatePptImages: enabled }),
      setMaxTurns: (turns) => set({ maxTurns: turns }),
      setSelectedAgentIds: (ids) => set({ selectedAgentIds: ids }),

      // ------------------------------------------------------------------
      // Server sync
      // ------------------------------------------------------------------

      syncFromServer: async () => {
        if (syncInProgress || get().hydrated) return;
        syncInProgress = true;
        try {
          const server = await apiGet<ServerSettingsResponse>(
            '/api/v1/settings',
          );

          // Merge only explicitly defined server fields into local state
          const merged: Partial<SettingsState> = {};
          if (server.theme !== undefined) merged.theme = server.theme;
          if (server.language !== undefined) merged.language = server.language;
          if (server.defaultModel !== undefined)
            merged.defaultModel = server.defaultModel;
          if (server.temperature !== undefined)
            merged.temperature = server.temperature;
          if (server.maxTokens !== undefined)
            merged.maxTokens = server.maxTokens;
          if (server.thinkingMode !== undefined)
            merged.thinkingMode = server.thinkingMode;
          if (server.autoContextWindow !== undefined)
            merged.autoContextWindow = server.autoContextWindow;
          if (server.contextWindowThreshold !== undefined)
            merged.contextWindowThreshold = server.contextWindowThreshold;
          if (server.rateLimitEnabled !== undefined)
            merged.rateLimitEnabled = server.rateLimitEnabled;
          if (server.sparkApiKey !== undefined)
            merged.sparkApiKey = server.sparkApiKey;
          if (server.sparkApiSecret !== undefined)
            merged.sparkApiSecret = server.sparkApiSecret;
          if (server.sparkModelId !== undefined)
            merged.sparkModelId = server.sparkModelId;
          if (server.generatePptImages !== undefined)
            merged.generatePptImages = server.generatePptImages;
          if (server.maxTurns !== undefined) merged.maxTurns = server.maxTurns;
          if (server.selectedAgentIds !== undefined)
            merged.selectedAgentIds = server.selectedAgentIds;
          if (server.smartlearnProviderId !== undefined)
            merged.smartlearnProviderId = server.smartlearnProviderId;
          if (server.smartlearnModelId !== undefined)
            merged.smartlearnModelId = server.smartlearnModelId;
          if (server.smartlearnApiKey !== undefined)
            merged.smartlearnApiKey = server.smartlearnApiKey;
          if (server.smartlearnBaseUrl !== undefined)
            merged.smartlearnBaseUrl = server.smartlearnBaseUrl;
          if (server.disabledAgentIds !== undefined)
            merged.disabledAgentIds = server.disabledAgentIds;
          if (server.maxResourceConcurrency !== undefined)
            merged.maxResourceConcurrency = server.maxResourceConcurrency;
          if (server.ttsProviderId !== undefined)
            merged.ttsProviderId = server.ttsProviderId;
          if (server.ttsVoice !== undefined) merged.ttsVoice = server.ttsVoice;
          if (server.ttsSpeed !== undefined) merged.ttsSpeed = server.ttsSpeed;
          if (server.asrProviderId !== undefined)
            merged.asrProviderId = server.asrProviderId;
          if (server.asrLanguage !== undefined)
            merged.asrLanguage = server.asrLanguage;

          merged.hydrated = true;
          set(merged);
          log.info('Settings synced from server');
        } catch (err) {
          log.warn('Failed to sync settings from server:', err);
          // Mark hydrated even on failure to prevent retry loops
          set({ hydrated: true });
        } finally {
          syncInProgress = false;
        }
      },

      syncToServer: async () => {
        const s = get();
        const payload: ServerSettingsResponse = {
          theme: s.theme,
          language: s.language,
          defaultModel: s.defaultModel,
          temperature: s.temperature,
          maxTokens: s.maxTokens,
          thinkingMode: s.thinkingMode,
          autoContextWindow: s.autoContextWindow,
          contextWindowThreshold: s.contextWindowThreshold,
          rateLimitEnabled: s.rateLimitEnabled,
          sparkApiKey: s.sparkApiKey,
          sparkApiSecret: s.sparkApiSecret,
          sparkModelId: s.sparkModelId,
          generatePptImages: s.generatePptImages,
          maxTurns: s.maxTurns,
          selectedAgentIds: s.selectedAgentIds,
          smartlearnProviderId: s.smartlearnProviderId,
          smartlearnModelId: s.smartlearnModelId,
          smartlearnApiKey: s.smartlearnApiKey,
          smartlearnBaseUrl: s.smartlearnBaseUrl,
          disabledAgentIds: s.disabledAgentIds,
          maxResourceConcurrency: s.maxResourceConcurrency,
          ttsProviderId: s.ttsProviderId,
          ttsVoice: s.ttsVoice,
          ttsSpeed: s.ttsSpeed,
          asrProviderId: s.asrProviderId,
          asrLanguage: s.asrLanguage,
        };
        try {
          await apiPut('/api/v1/settings', payload);
          log.info('Settings synced to server');
        } catch (err) {
          log.warn('Failed to sync settings to server:', err);
        }
      },
    }),
    {
      name: 'sl-settings-storage',
      partialize: (state) => {
        // Exclude hydrated from persistence so syncFromServer runs on each page load.
        // Methods are functions and automatically stripped by JSON serialization.
        const { hydrated: _hydrated, ...rest } = state;
        void _hydrated; // suppress unused-var lint
        return rest;
      },
    },
  ),
);
