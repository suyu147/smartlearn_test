import { createLogger } from '@/lib/logger';
import type { Resource } from '@/lib/types/resource';
import { getApiToken } from '@/lib/auth-token';

const log = createLogger('ResourcesAPI');

/**
 * Build auth headers for raw fetch calls.
 */
function authHeaders(): Record<string, string> {
  const token = getApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fetch all resources for a user from the server.
 * Uses /api/v1/resources/sync endpoint.
 */
export async function fetchResources(userId: string): Promise<Resource[]> {
  try {
    const res = await fetch(
      `/api/v1/resources/sync?userId=${encodeURIComponent(userId)}`,
      { headers: { ...authHeaders() } },
    );
    if (!res.ok) {
      log.warn(`fetchResources failed: HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    return json?.data?.resources ?? [];
  } catch (err) {
    log.error('fetchResources failed:', err);
    return [];
  }
}

/**
 * Save resources to the server.
 * Uses POST /api/v1/resources/sync endpoint.
 * Returns true if the save was successful.
 */
export async function saveResources(
  userId: string,
  resources: Resource[],
): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/resources/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        ...authHeaders(),
      },
      body: JSON.stringify({ resources }),
    });
    if (!res.ok) {
      log.warn(`saveResources failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    log.error('saveResources failed:', err);
    return false;
  }
}
