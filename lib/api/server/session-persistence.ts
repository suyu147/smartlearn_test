import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createLogger } from '@/lib/logger';
import { getDataDir } from '@/lib/paths';
import type { LearningSession } from '@/lib/store/sessions';

const log = createLogger('server:session-persistence');
const DATA_ROOT = getDataDir('sessions');

function getSessionFilePath(userId: string): string {
  return join(DATA_ROOT, `${userId}.json`);
}

async function ensureDir(): Promise<void> {
  if (!existsSync(DATA_ROOT)) {
    await mkdir(DATA_ROOT, { recursive: true });
  }
}

/**
 * Save all sessions for a user to a file-based store.
 */
export async function saveSessions(
  userId: string,
  sessions: LearningSession[],
): Promise<void> {
  try {
    await ensureDir();
    const filePath = getSessionFilePath(userId);
    await writeFile(filePath, JSON.stringify(sessions, null, 2), 'utf-8');
    log.info(`Saved ${sessions.length} sessions for user=${userId}`);
  } catch (err) {
    log.error('saveSessions failed:', err);
    throw err;
  }
}

/**
 * Load all sessions for a user from the file-based store.
 */
export async function loadSessions(
  userId: string,
): Promise<LearningSession[]> {
  try {
    const filePath = getSessionFilePath(userId);
    if (!existsSync(filePath)) return [];

    const content = await readFile(filePath, 'utf-8');
    const sessions: LearningSession[] = JSON.parse(content);
    return sessions;
  } catch (err) {
    log.error('loadSessions failed:', err);
    return [];
  }
}
