import { createLogger } from '@/lib/logger';
import { getApiToken } from '@/lib/auth-token';
import type { LearningPath } from '@/lib/types/learning-path';

const log = createLogger('LearningPathAPI');

interface LearningPathResponse {
  data?: {
    learningPaths?: LearningPath[];
  };
}

/** Build auth headers for raw fetch calls */
function authHeaders(): Record<string, string> {
  const token = getApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Fetch all learning paths for the current user from server */
export async function fetchLearningPaths(userId: string): Promise<LearningPath[]> {
  try {
    const res = await fetch(
      `/api/v1/smartlearn/profile?userId=${encodeURIComponent(userId)}`,
      { headers: { ...authHeaders() } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as LearningPathResponse;
    return data?.data?.learningPaths ?? [];
  } catch (err) {
    log.error('fetchLearningPaths failed:', err);
    return [];
  }
}

interface SaveLearningPathPayload {
  userId: string;
  dimensions: Record<string, unknown> & { _type: string };
}

/** Save a learning path to server */
export async function saveLearningPath(
  userId: string,
  path: LearningPath,
): Promise<boolean> {
  try {
    const payload: SaveLearningPathPayload = {
      userId,
      dimensions: { ...path, _type: 'learningPath' },
    };
    const res = await fetch('/api/v1/smartlearn/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        ...authHeaders(),
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    log.error('saveLearningPath failed:', err);
    return false;
  }
}
