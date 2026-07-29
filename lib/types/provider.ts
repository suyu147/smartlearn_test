export type ProviderType = 'openai' | 'anthropic' | 'google';

export interface ThinkingCapability {
  toggleable: boolean;
  budgetAdjustable: boolean;
  defaultEnabled: boolean;
}

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  thinking?: ThinkingCapability;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  outputWindow?: number;
  capabilities: ModelCapabilities;
}

export interface ThinkingConfig {
  enabled?: boolean;
  budgetTokens?: number;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  type: ProviderType;
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
  icon?: string;
  models: ModelInfo[];
}

export interface ModelConfig {
  providerId: ProviderId;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: ProviderType;
  requiresApiKey?: boolean;
  proxy?: string;
}

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'glm'
  | 'qwen'
  | 'deepseek'
  | 'kimi'
  | 'minimax'
  | 'siliconflow'
  | 'doubao'
  | 'grok'
  | 'spark';
