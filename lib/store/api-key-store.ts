import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiGet, apiPost, apiDelete } from '@/lib/api-client';

/**
 * 服务端返回的 API Key 条目（不包含明文）
 */
export interface ApiKeyEntry {
  provider: string;
  label: string;
  isActive: boolean;
}

/**
 * 单个 provider 的 API Key 详情（掩码后的值）
 */
export interface ApiKeyDetail {
  provider: string;
  apiKey: string;      // 掩码后的密钥，如 "sk-a****b1c2"
  hasKey: boolean;
}

interface ApiKeyState {
  /** 所有已存储的 API Key 列表 */
  apiKeys: ApiKeyEntry[];
  /** 是否已完成首次服务端同步 */
  synced: boolean;

  // 本地方法
  setApiKeys: (keys: ApiKeyEntry[]) => void;

  // 服务端同步方法
  syncFromServer: () => Promise<void>;
  storeKey: (provider: string, apiKey: string, label?: string) => Promise<void>;
  getKey: (provider: string) => Promise<ApiKeyDetail | null>;
  deleteKey: (provider: string) => Promise<void>;
}

// 防止并发同步
let syncInProgress = false;

export const useApiKeyStore = create<ApiKeyState>()(
  persist(
    (set) => ({
      apiKeys: [],
      synced: false,

      setApiKeys: (keys) => set({ apiKeys: keys }),

      syncFromServer: async () => {
        if (syncInProgress) return;
        syncInProgress = true;
        try {
          const body = await apiGet<{ apiKeys: ApiKeyEntry[] }>('/api/v1/apikeys');
          const serverKeys = body.apiKeys ?? [];
          set({ apiKeys: serverKeys, synced: true });
        } catch (err) {
          console.warn('[ApiKeyStore] Failed to sync from server:', err);
          set({ synced: true });
        } finally {
          syncInProgress = false;
        }
      },

      storeKey: async (provider: string, apiKey: string, label?: string) => {
        await apiPost('/api/v1/apikeys', { provider, apiKey, label });
        // 更新本地列表
        set((state) => {
          const existing = state.apiKeys.find((k) => k.provider === provider);
          if (existing) {
            return {
              apiKeys: state.apiKeys.map((k) =>
                k.provider === provider
                  ? { ...k, label: label ?? k.label, isActive: true }
                  : k
              ),
            };
          }
          return {
            apiKeys: [
              { provider, label: label ?? '', isActive: true },
              ...state.apiKeys,
            ],
          };
        });
      },

      getKey: async (provider: string) => {
        try {
          const detail = await apiGet<ApiKeyDetail>(
            `/api/v1/apikeys/${provider}`
          );
          return detail;
        } catch (err) {
          console.warn(`[ApiKeyStore] Failed to get key for ${provider}:`, err);
          return null;
        }
      },

      deleteKey: async (provider: string) => {
        await apiDelete(`/api/v1/apikeys/${provider}`);
        set((state) => ({
          apiKeys: state.apiKeys.filter((k) => k.provider !== provider),
        }));
      },
    }),
    {
      name: 'sl-apikey-storage',
      partialize: (state) => {
        const { synced: _synced, ...rest } = state;
        void _synced;
        return rest;
      },
    }
  )
);
