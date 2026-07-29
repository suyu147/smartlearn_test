/**
 * Auth Token — Frontend-only JWT token storage
 *
 * Standalone module used by api-client.ts to inject Authorization headers.
 * Kept separate from auth-store.ts to avoid circular imports.
 *
 * Persists to localStorage so the token survives page refreshes and
 * module re-initialization (important in multi-user mode).
 */

const STORAGE_KEY = 'auth-jwt';

let _token: string | null = null;

/** Get the current JWT token (null = no auth). */
export function getApiToken(): string | null {
  if (_token) return _token;
  // Fallback: read from localStorage if in-memory cache is empty
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        _token = stored;
        return _token;
      }
    } catch {
      // localStorage unavailable (SSR, privacy mode, etc.)
    }
  }
  return null;
}

/** Set the JWT token for subsequent API requests. Pass null to clear. */
export function setApiToken(token: string | null): void {
  _token = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEY, token);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable
    }
  }
}
