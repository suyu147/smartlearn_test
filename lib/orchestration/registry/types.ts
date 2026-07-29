import type { TTSProviderId } from '@/lib/audio/types';

export interface VoiceConfig {
  providerId: TTSProviderId;
  voiceId: string;
  modelId?: string;
  speed?: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelId?: string;
  color?: string;
  avatar?: string;
  tools?: string[];
  role?: string;
  persona?: string;
  allowedActions?: string[];
  voiceConfig?: VoiceConfig;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  isDefault?: boolean;
}
