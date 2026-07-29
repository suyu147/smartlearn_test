/**
 * Auth Store — Frontend authentication state management
 *
 * Zustand store that tracks the current user, auth mode, and JWT token.
 * Provides login/logout/register actions that call the backend auth endpoints.
 *
 * The JWT token is also pushed into lib/auth-token.ts so that the shared
 * api-client.ts can inject it as an Authorization header on every request.
 */

import { create } from 'zustand';
import { setApiToken, getApiToken } from '@/lib/auth-token';
import { clearAllUserData } from './clear-user-data';
import { useSessionStore } from './session-store';

/**
 * Decode JWT payload in the browser (no verification — middleware already
 * verified it). Returns null if the token is malformed.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export type AuthMode = 'disabled' | 'single' | 'multi';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  mode: AuthMode | null;
  isInitialized: boolean;
  /** Whether the user has completed the onboarding profile builder */
  hasProfile: boolean;

  /** Login with credentials (multi mode). Also works for disabled mode (empty creds). */
  login: (username: string, password: string) => Promise<void>;

  /** Register a new user (multi mode only). */
  register: (username: string, password: string) => Promise<void>;

  /** Clear auth state and token. */
  logout: () => void;

  /** Update hasProfile state (called by onboarding page after completion). */
  setHasProfile: (hasProfile: boolean) => void;

  /**
   * Initialize auth state on app startup.
   * Calls GET /api/v1/auth/status to discover the auth mode and obtain a token.
   * In disabled/single mode, the server returns a pre-issued token and user.
   * In multi mode, user is null — the frontend must show a login form.
   */
  initAuth: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  mode: null,
  isInitialized: false,
  hasProfile: false,

  login: async (username, password) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `登录失败 (${res.status})`);
    }

    const { data } = (await res.json()) as {
      data: { token: string; user: AuthUser };
    };

    setApiToken(data.token);
    set({ token: data.token, user: data.user });
    // Reset sessions so they are re-fetched for the new user
    useSessionStore.getState().resetSessions();
    useSessionStore.getState().fetchSessions();
  },

  register: async (username, password) => {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `注册失败 (${res.status})`);
    }

    const { data } = (await res.json()) as {
      data: { token: string; user: AuthUser };
    };

    setApiToken(data.token);
    set({ token: data.token, user: data.user });
    // Reset sessions so they are re-fetched for the new user
    useSessionStore.getState().resetSessions();
    useSessionStore.getState().fetchSessions();
  },

  logout: () => {
    setApiToken(null);
    clearAllUserData();
    set({ token: null, user: null, hasProfile: false });
  },

  setHasProfile: (hasProfile) => {
    set({ hasProfile });
  },

  initAuth: async () => {
    try {
      const res = await fetch('/api/v1/auth/status');

      if (!res.ok) {
        // Server error — assume disabled mode to avoid blocking the app
        set({ mode: 'disabled', isInitialized: true });
        return;
      }

      const { data } = (await res.json()) as {
        data: {
          mode: AuthMode;
          user: AuthUser | null;
          token?: string;
          hasProfile?: boolean;
        };
      };

      // In disabled/single mode, the status endpoint returns a pre-issued
      // token so the frontend can immediately use it for API calls.
      // In multi mode, the status endpoint does NOT return a token (the
      // request is sent without Authorization), so we must restore the
      // token from localStorage (set during login) and decode the user.
      let resolvedToken = data.token ?? null;
      let resolvedUser = data.user ?? null;
      let resolvedHasProfile = data.hasProfile ?? false;

      if (!resolvedToken) {
        // Multi mode: try to recover token from localStorage
        const stored = getApiToken();
        if (stored) {
          const payload = decodeJwtPayload(stored);
          if (payload?.userId) {
            resolvedToken = stored;
            resolvedUser = {
              id: payload.userId as string,
              username: (payload.username as string) ?? '',
              role: (payload.role as 'admin' | 'user') ?? 'user',
            };
            // Warm the in-memory cache so subsequent calls are fast
            setApiToken(stored);

            // Verify profile status for this user
            try {
              const statusRes = await fetch('/api/v1/auth/status', {
                headers: { Authorization: `Bearer ${stored}` },
              });
              if (statusRes.ok) {
                const statusData = (await statusRes.json()) as {
                  data: { hasProfile?: boolean };
                };
                resolvedHasProfile = statusData.data?.hasProfile ?? false;
              }
            } catch {
              // Non-critical — hasProfile defaults to false
            }
          } else {
            // Malformed token in localStorage — clear it
            setApiToken(null);
          }
        }
      } else {
        setApiToken(resolvedToken);
      }

      set({
        mode: data.mode,
        user: resolvedUser,
        token: resolvedToken,
        hasProfile: resolvedHasProfile,
        isInitialized: true,
      });

      // Fetch sessions for the resolved user
      if (resolvedUser) {
        useSessionStore.getState().fetchSessions();
      }
    } catch {
      // Network error or server unavailable — assume disabled mode
      set({ mode: 'disabled', isInitialized: true });
    }
  },
}));
