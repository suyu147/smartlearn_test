import { createLogger } from '@/lib/logger';
import { getApiToken } from '@/lib/auth-token';
import type { ProfileDimensions } from '@/lib/types/profile';

const log = createLogger('LearningProfileAPI');

interface ProfileResponse {
  profile?: {
    id?: string | null;
    userId?: string;
    version?: number;
    dimensions?: ProfileDimensions;
    updatedAt?: string | null;
    completedAt?: string | null;
    lastSource?: string | null;
    isNew?: boolean;
  };
  analytics?: unknown;
  weakPoints?: unknown[];
  errors?: unknown[];
  recentSessions?: unknown[];
  quizStats?: unknown;
  recentQuizAttempts?: unknown[];
}

/** Build auth headers for raw fetch calls */
function authHeaders(): Record<string, string> {
  const token = getApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Fetch learning profile from server */
export async function fetchProfile(
  userId: string,
): Promise<ProfileResponse | null> {
  try {
    const res = await fetch(
      '/api/v1/smartlearn/profile',
      { headers: { ...authHeaders(), 'x-user-id': userId } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as ProfileResponse;
    return data;
  } catch (err) {
    log.error('fetchProfile failed:', err);
    return null;
  }
}

/** Save learning profile to server */
export async function saveProfile(
  userId: string,
  dimensions: ProfileDimensions,
): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/smartlearn/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        ...authHeaders(),
      },
      body: JSON.stringify({ userId, dimensions }),
    });
    return res.ok;
  } catch (err) {
    log.error('saveProfile failed:', err);
    return false;
  }
}
