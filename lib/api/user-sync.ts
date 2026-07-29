import { createLogger } from '@/lib/logger';
import { getApiToken } from '@/lib/auth-token';
import { useSessionsStore, type LearningSession } from '@/lib/store/sessions';
import { useLearningPathStore } from '@/lib/store/learning-path';
import { useResourcesStore } from '@/lib/store/resources';
import type { LearningPath } from '@/lib/types/learning-path';
import type { Resource } from '@/lib/types/resource';

const log = createLogger('UserSync');

interface SyncResponse {
  sessions?: LearningSession[];
  learningPaths?: LearningPath[];
  resources?: Resource[];
}

function authHeaders(): Record<string, string> {
  const token = getApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Load all user state from the server and merge into local stores.
 * Only restores data when the local store is empty (fresh device).
 *
 * @param userId - The current user's ID
 */
export async function loadUserStateFromServer(userId: string): Promise<void> {
  try {
    const res = await fetch(
      `/api/v1/user/sync?userId=${encodeURIComponent(userId)}`,
      { headers: { ...authHeaders() } },
    );
    if (!res.ok) {
      log.warn(`loadUserStateFromServer failed: HTTP ${res.status}`);
      return;
    }
    const json = await res.json();
    const data = json?.data as SyncResponse | undefined;
    if (!data) return;

    const hasData = !!(data.sessions?.length || data.learningPaths?.length || data.resources?.length);
    if (!hasData) return;

    // 1. Restore sessions (only if local is empty → fresh device)
    if (data.sessions && data.sessions.length > 0) {
      const currentSessions = useSessionsStore.getState().sessions;
      if (currentSessions.length === 0) {
        const lastSession = data.sessions.reduce((latest, s) =>
          s.updatedAt > latest.updatedAt ? s : latest,
        );
        // Directly set sessions into the store
        useSessionsStore.setState({
          sessions: data.sessions,
          currentSessionId: lastSession.id,
        });
        log.info(`Restored ${data.sessions.length} sessions from server`);
      }
    }

    // 2. Restore learning paths (only if local is empty)
    if (data.learningPaths && data.learningPaths.length > 0) {
      const currentPath = useLearningPathStore.getState().path;
      if (!currentPath) {
        const latest = data.learningPaths.reduce((latest, p) =>
          p.updatedAt > latest.updatedAt ? p : latest,
        );
        useLearningPathStore.getState().setPath(latest);
        log.info(`Restored ${data.learningPaths.length} learning paths from server`);
      }
    }

    // 3. Restore resources via store's syncFromServer (merges with current session)
    if (data.resources && data.resources.length > 0) {
      const sid = useSessionsStore.getState().currentSessionId;
      if (sid) {
        await useResourcesStore.getState().syncFromServer(userId, sid);
      }
    }
  } catch (err) {
    log.error('loadUserStateFromServer failed:', err);
  }
}

/**
 * Save all user state (sessions + learning paths + resources) to the server.
 */
export async function saveUserStateToServer(userId: string): Promise<void> {
  try {
    const sessionState = useSessionsStore.getState();
    const pathState = useLearningPathStore.getState();
    const resourceState = useResourcesStore.getState();

    const payload: {
      sessions?: LearningSession[];
      learningPaths?: LearningPath[];
      resources?: Resource[];
    } = {};

    if (sessionState.sessions.length > 0) {
      payload.sessions = sessionState.sessions;
    }
    if (pathState.path) {
      payload.learningPaths = [pathState.path];
    }

    // Collect all unique resources across all sessions
    const allResources = Object.values(resourceState.storedResources).flat();
    const seen = new Set<string>();
    payload.resources = allResources.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    if (!payload.sessions && !payload.learningPaths && !payload.resources) return;

    const res = await fetch('/api/v1/user/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        ...authHeaders(),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      log.warn(`saveUserStateToServer failed: HTTP ${res.status}`);
      return;
    }

    log.info(`Saved user state to server for user=${userId}`);
  } catch (err) {
    log.error('saveUserStateToServer failed:', err);
  }
}
