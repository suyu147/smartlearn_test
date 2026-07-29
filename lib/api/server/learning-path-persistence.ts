import prisma from '@/lib/utils/database';
import { createLogger } from '@/lib/logger';
import type { LearningPath } from '@/lib/types/learning-path';

const log = createLogger('server:learning-path-persistence');

/** Serialize value to a Prisma-safe JSON input using the same pattern as the existing codebase. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toJsonSafe(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Save a batch of learning paths for a user.
 * Uses upsert by path id so repeated saves are idempotent.
 */
export async function saveLearningPaths(
  userId: string,
  paths: LearningPath[],
): Promise<void> {
  if (paths.length === 0) return;

  const operations = paths.map((p) =>
    prisma.learningPath.upsert({
      where: { id: p.id },
      update: {
        goal: p.goal,
        nodes: toJsonSafe(p.nodes),
        edges: toJsonSafe(p.edges),
        status: p.status,
      },
      create: {
        id: p.id,
        userId,
        goal: p.goal,
        nodes: toJsonSafe(p.nodes),
        edges: toJsonSafe(p.edges),
        status: p.status,
      },
    }),
  );

  await prisma.$transaction(operations);
  log.info(`Saved ${operations.length} learning paths for user=${userId}`);
}

/**
 * Load all learning paths for a user.
 */
export async function loadLearningPaths(
  userId: string,
): Promise<LearningPath[]> {
  const records = await prisma.learningPath.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });

  return records.map(mapDbPathToFrontend);
}

function mapDbPathToFrontend(
  record: Awaited<ReturnType<typeof prisma.learningPath.findFirst>>,
): LearningPath {
  if (!record) throw new Error('Unexpected null learning path record');
  return {
    id: record.id,
    userId: record.userId,
    goal: record.goal,
    nodes: record.nodes as unknown as LearningPath['nodes'],
    edges: record.edges as unknown as LearningPath['edges'],
    status: record.status as LearningPath['status'],
    estimatedDays: Math.max(1, ((record.nodes as unknown[]) ?? []).length),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
