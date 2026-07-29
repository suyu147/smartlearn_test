import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db/client';
import { DEFAULT_DIMENSIONS } from '../lib/types/profile';

type JsonRecord = Record<string, unknown>;

const dataRoot = join(process.cwd(), 'data', 'learning');

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asDate(value: unknown, fallback: Date): Date {
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}

async function ensureUser(userId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, name: userId },
  });
}

async function migrateProfile(userId: string, directory: string): Promise<void> {
  const profile = readJson(join(directory, 'profile.json'));
  const dimensions = asRecord(asRecord(profile).dimensions ?? profile);

  if (Object.keys(dimensions).length === 0) {
    await prisma.learningProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, dimensions: json(DEFAULT_DIMENSIONS) },
    });
    return;
  }

  await prisma.learningProfile.upsert({
    where: { userId },
    update: { dimensions: json(dimensions) },
    create: { userId, dimensions: json(dimensions) },
  });
}

async function migrateSkillMap(userId: string, directory: string): Promise<void> {
  const source = asRecord(readJson(join(directory, 'skill-map.json')));
  const entries = asArray(source.entries ?? source.skills ?? source);

  for (const value of entries) {
    const entry = asRecord(value);
    const topic = asString(entry.topic ?? entry.name);
    if (!topic) continue;

    const lastReviewedAt = asDate(entry.lastReviewed ?? entry.lastPracticed, new Date(0));
    const nextReviewAt = asDate(entry.nextReviewDate ?? entry.nextReviewAt, new Date());

    await prisma.learningSkillMastery.upsert({
      where: { userId_topic: { userId, topic } },
      update: {
        mastery: asNumber(entry.mastery, 0),
        lastReviewedAt,
        reviewCount: Math.trunc(asNumber(entry.reviewCount ?? entry.attempts, 0)),
        streak: Math.trunc(asNumber(entry.streak, 0)),
        nextReviewAt,
        difficulty: asNumber(entry.difficulty, 3),
        metadata: json(entry),
      },
      create: {
        userId,
        topic,
        mastery: asNumber(entry.mastery, 0),
        lastReviewedAt,
        reviewCount: Math.trunc(asNumber(entry.reviewCount ?? entry.attempts, 0)),
        streak: Math.trunc(asNumber(entry.streak, 0)),
        nextReviewAt,
        difficulty: asNumber(entry.difficulty, 3),
        metadata: json(entry),
      },
    });
  }
}

async function migrateSchedule(userId: string, directory: string): Promise<void> {
  const source = readJson(join(directory, 'schedule.json'));
  const entries = asArray(asRecord(source).entries ?? source);

  for (const value of entries) {
    const entry = asRecord(value);
    const topic = asString(entry.topic);
    if (!topic) continue;

    const dueAt = asDate(entry.dueDate ?? entry.dueAt ?? entry.date, new Date());
    const existing = await prisma.learningScheduleEntry.findFirst({
      where: { userId, topic, dueAt },
      select: { id: true },
    });

    if (existing) continue;

    await prisma.learningScheduleEntry.create({
      data: {
        userId,
        topic,
        dueAt,
        priority: Math.trunc(asNumber(entry.priority, 0)),
        status: asString(entry.status, 'pending'),
        metadata: json(entry),
      },
    });
  }
}

async function migrateSessions(userId: string, directory: string): Promise<void> {
  const source = readJson(join(directory, 'sessions.json'));
  const sessions = asArray(asRecord(source).sessions ?? source);

  for (const value of sessions) {
    const session = asRecord(value);
    const sourceId = asString(session.id);
    const existing = sourceId
      ? await prisma.learningMasterySession.findUnique({ where: { id: sourceId }, select: { id: true } }).catch(() => null)
      : null;
    if (existing) continue;

    const topics = asArray(session.topics).filter((topic): topic is string => typeof topic === 'string');
    const attempts = asArray(session.quizResults ?? session.results ?? session.attempts);
    const created = await prisma.learningMasterySession.create({
      data: {
        ...(sourceId ? { id: sourceId } : {}),
        userId,
        title: asString(session.title),
        topics: json(topics),
        evaluation: json(asRecord(session.evaluation)),
        startedAt: asDate(session.startedAt ?? session.createdAt, new Date()),
        completedAt: session.completedAt ? asDate(session.completedAt, new Date()) : null,
        metadata: json({ source: 'legacy-file-migration' }),
      },
    });

    for (const value of attempts) {
      const attempt = asRecord(value);
      const topic = asString(attempt.topic);
      if (!topic) continue;
      await prisma.learningQuizAttempt.create({
        data: {
          masterySessionId: created.id,
          userId,
          topic,
          question: asString(attempt.question),
          userAnswer: asString(attempt.userAnswer),
          correctAnswer: asString(attempt.correctAnswer),
          correct: Boolean(attempt.correct),
          difficulty: asNumber(attempt.difficulty, 3),
          explanation: asString(attempt.explanation),
          metadata: json({ source: 'legacy-file-migration' }),
        },
      });
    }
  }
}

async function main(): Promise<void> {
  if (!existsSync(dataRoot)) {
    console.log('No legacy learning data directory found.');
    return;
  }

  const userIds = readdirSync(dataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const userId of userIds) {
    const directory = join(dataRoot, userId);
    await ensureUser(userId);
    await migrateProfile(userId, directory);
    await migrateSkillMap(userId, directory);
    await migrateSchedule(userId, directory);
    await migrateSessions(userId, directory);
    console.log(`Migrated legacy learner data for ${userId}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
