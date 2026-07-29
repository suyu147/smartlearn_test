/**
 * UserSettingsService — Server-side settings persistence
 */

import { createLogger } from '@/lib/logger';
import prisma from '@/lib/db/client';

const log = createLogger('UserSettingsService');

export interface UserSettingsData {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingMode?: boolean;
  theme?: string;
  language?: string;
  smartlearnProviderId?: string;
  smartlearnModelId?: string;
  smartlearnBaseUrl?: string;
  generatePptImages?: boolean;
  maxTurns?: number;
  maxResourceConcurrency?: number;
  ttsProviderId?: string;
  ttsVoice?: string;
  ttsSpeed?: number;
  ttsProvidersConfig?: Record<string, unknown>;
  asrProviderId?: string;
  asrLanguage?: string;
  asrProvidersConfig?: Record<string, unknown>;
  selectedAgentIds?: string[];
  disabledAgentIds?: string[];
  autoContextWindow?: boolean;
  contextWindowThreshold?: number;
  rateLimitEnabled?: boolean;
}

export class UserSettingsService {
  async getSettings(userId: string): Promise<UserSettingsData | null> {
    try {
      const record = await prisma.userSettings.findUnique({ where: { userId } });
      if (!record) return null;

      return {
        provider: record.provider ?? undefined,
        model: record.model ?? undefined,
        temperature: record.temperature,
        maxTokens: record.maxTokens,
        thinkingMode: record.thinkingMode,
        theme: record.theme,
        language: record.language,
        smartlearnProviderId: record.smartlearnProviderId ?? undefined,
        smartlearnModelId: record.smartlearnModelId ?? undefined,
        smartlearnBaseUrl: record.smartlearnBaseUrl ?? undefined,
        generatePptImages: record.generatePptImages,
        maxTurns: record.maxTurns,
        maxResourceConcurrency: record.maxResourceConcurrency,
        ttsProviderId: record.ttsProviderId ?? undefined,
        ttsVoice: record.ttsVoice ?? undefined,
        ttsSpeed: record.ttsSpeed,
        ttsProvidersConfig: record.ttsProvidersConfig as Record<string, unknown> | undefined,
        asrProviderId: record.asrProviderId ?? undefined,
        asrLanguage: record.asrLanguage ?? undefined,
        asrProvidersConfig: record.asrProvidersConfig as Record<string, unknown> | undefined,
        selectedAgentIds: record.selectedAgentIds ?? undefined,
        disabledAgentIds: record.disabledAgentIds ?? undefined,
        autoContextWindow: record.autoContextWindow,
        contextWindowThreshold: record.contextWindowThreshold,
        rateLimitEnabled: record.rateLimitEnabled,
      };
    } catch (err) {
      log.error('getSettings failed:', err);
      return null;
    }
  }

  async updateSettings(userId: string, data: UserSettingsData): Promise<boolean> {
    try {
      // Ensure user exists
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, name: 'anonymous' },
      });

      await prisma.userSettings.upsert({
        where: { userId },
        update: {
          ...this.toDbFields(data),
        },
        create: {
          userId,
          ...this.toDbFields(data),
        },
      });
      return true;
    } catch (err) {
      log.error('updateSettings failed:', err);
      return false;
    }
  }

  private toDbFields(data: UserSettingsData): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields[key] = value;
      }
    }
    return fields;
  }
}
