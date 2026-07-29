'use client';

import { useEffect } from 'react';
import { useSettingsStoreV2 } from '@/lib/store/settings-store';

/**
 * Unified settings hook — reads from the V2 store as the canonical source
 * and exposes V1-compatible field names via aliases.
 *
 * V1 components can migrate to this hook incrementally without changing
 * their field-name conventions. Once every consumer uses this hook the
 * V1 store (`useSettingsStore`) can be retired.
 */
export function useUnifiedSettings() {
  const settings = useSettingsStoreV2();

  // Trigger a one-time server sync on first mount
  useEffect(() => {
    if (!settings.hydrated) {
      settings.syncFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // ---- V2 fields (direct) ----
    provider: settings.smartlearnProviderId ?? '',
    model: settings.defaultModel,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    theme: settings.theme,
    language: settings.language,
    thinkingMode: settings.thinkingMode,
    autoContextWindow: settings.autoContextWindow,
    rateLimitEnabled: settings.rateLimitEnabled,

    // ---- V1 bridge aliases ----
    providerId: settings.smartlearnProviderId ?? '',
    modelId: settings.smartlearnModelId ?? '',
    apiKey: settings.smartlearnApiKey ?? '',
    baseUrl: settings.smartlearnBaseUrl ?? '',
    sparkApiKey: settings.sparkApiKey ?? '',
    sparkApiSecret: settings.sparkApiSecret ?? '',
    sparkModelId: settings.sparkModelId ?? '',
    ttsConfig: {
      providerId: settings.ttsProviderId,
      voice: settings.ttsVoice,
      speed: settings.ttsSpeed,
      providersConfig: settings.ttsProvidersConfig,
    },
    asrConfig: {
      providerId: settings.asrProviderId,
      language: settings.asrLanguage,
      providersConfig: settings.asrProvidersConfig,
    },
    generatePptImages: settings.generatePptImages,
    maxTurns: settings.maxTurns,
    selectedAgentIds: settings.selectedAgentIds,
    disabledAgentIds: settings.disabledAgentIds ?? [],

    // ---- Sync state ----
    hydrated: settings.hydrated,

    // ---- Actions ----
    setTheme: settings.setTheme,
    setLanguage: settings.setLanguage,
    setProvider: (id: string) =>
      settings.setSmartlearnModel(id, settings.smartlearnModelId ?? ''),
    setModel: settings.setDefaultModel,
    setApiKey: settings.setSmartlearnApiKey,
    setBaseUrl: settings.setSmartlearnBaseUrl,
    setTemperature: settings.setTemperature,
    setMaxTokens: settings.setMaxTokens,
    toggleThinkingMode: settings.toggleThinkingMode,
    setSparkApiKey: settings.setSparkApiKey,
    setSparkApiSecret: settings.setSparkApiSecret,
    setSparkModelId: settings.setSparkModelId,
    setGeneratePptImages: settings.setGeneratePptImages,
    setMaxTurns: settings.setMaxTurns,
    setSelectedAgentIds: settings.setSelectedAgentIds,
    setDisabledAgentIds: settings.setDisabledAgentIds,
    syncToServer: settings.syncToServer,
    syncFromServer: settings.syncFromServer,
  };
}
