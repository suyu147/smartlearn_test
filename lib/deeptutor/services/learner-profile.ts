import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/client';
import { DEFAULT_DIMENSIONS, type ProfileDimensions } from '@/lib/types/profile';

export interface SkillEntry {
  topic: string;
  mastery: number;
  lastReviewed: string;
  reviewCount: number;
  streak: number;
  nextReviewDate: string;
  difficulty: number;
}

export interface SkillMap {
  userId: string;
  entries: SkillEntry[];
  updatedAt: string;
}

export interface MasteryQuizResult {
  topic: string;
  question: string;
  correct: boolean;
  difficulty: number;
  userAnswer: string;
  correctAnswer: string;
}

export interface MasteryEvaluation {
  weakPoints: string[];
  strongPoints: string[];
  suggestedFocus: string[];
  overallScore: number;
  feedback: string;
}

export interface LearningSessionRecord {
  id: string;
  userId: string;
  topics: string[];
  quizResults: MasteryQuizResult[];
  evaluation: MasteryEvaluation | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ScheduleEntry {
  topic: string;
  dueDate: string;
  priority: number;
}

export interface LearnerProfileRecord {
  id: string | null;
  userId: string;
  version: number;
  dimensions: ProfileDimensions;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  lastSource: string | null;
  isNew: boolean;
}

export interface QuizStats {
  totalAttempts: number;
  correctCount: number;
  errorCount: number;
  accuracy: number | null;
}

export interface RecentQuizAttempt {
  topic: string;
  question: string;
  correct: boolean;
  difficulty: number;
  userAnswer: string;
  correctAnswer: string;
  createdAt: string;
}

export interface LearnerSnapshot {
  profile: LearnerProfileRecord;
  analytics: {
    skillMap: SkillMap;
    weakTopics: string[];
    strongTopics: string[];
    schedule: ScheduleEntry[];
  };
  weakPoints: Array<{ topic: string; mastery: number; priority: number; attempts: number; errors: number }>;
  errors: Array<{ topic: string; count: number; latestAt: string }>;
  recentSessions: LearningSessionRecord[];
  quizStats: QuizStats;
  recentQuizAttempts: RecentQuizAttempt[];
}

function mergeDimensions(partial?: Partial<ProfileDimensions>): ProfileDimensions {
  if (!partial) {
    return structuredClone(DEFAULT_DIMENSIONS);
  }

  return {
    ...DEFAULT_DIMENSIONS,
    ...partial,
    knowledgeBase: { ...DEFAULT_DIMENSIONS.knowledgeBase, ...partial.knowledgeBase },
    cognitiveStyle: { ...DEFAULT_DIMENSIONS.cognitiveStyle, ...partial.cognitiveStyle },
    learningGoals: { ...DEFAULT_DIMENSIONS.learningGoals, ...partial.learningGoals },
    weakPoints: { ...DEFAULT_DIMENSIONS.weakPoints, ...partial.weakPoints },
    timePreference: { ...DEFAULT_DIMENSIONS.timePreference, ...partial.timePreference },
    interests: { ...DEFAULT_DIMENSIONS.interests, ...partial.interests },
    learningPace: { ...DEFAULT_DIMENSIONS.learningPace, ...partial.learningPace },
    errorPatterns: { ...DEFAULT_DIMENSIONS.errorPatterns, ...partial.errorPatterns },
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toIso(value?: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function ensureUser(userId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, name: userId === 'anonymous' ? 'Anonymous' : userId },
  });
}

function buildWeakTopics(entries: SkillEntry[]): string[] {
  return entries
    .filter((entry) => entry.mastery < 0.6)
    .sort((a, b) => a.mastery - b.mastery)
    .map((entry) => entry.topic);
}

function buildStrongTopics(entries: SkillEntry[]): string[] {
  return entries
    .filter((entry) => entry.mastery >= 0.8)
    .sort((a, b) => b.mastery - a.mastery)
    .map((entry) => entry.topic);
}

export class LearnerProfileService {
  async ensureUserProfile(userId: string): Promise<LearnerProfileRecord> {
    await ensureUser(userId);

    const existing = await prisma.learningProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      return this.mapProfile(existing, false);
    }

    const created = await prisma.learningProfile.create({
      data: {
        userId,
        version: 1,
        dimensions: toJson(mergeDimensions()),
      },
    });

    return this.mapProfile(created, true);
  }

  async getProfile(userId: string): Promise<LearnerProfileRecord> {
    const existing = await prisma.learningProfile.findUnique({ where: { userId } });

    if (!existing) {
      return this.ensureUserProfile(userId);
    }

    return this.mapProfile(existing, false);
  }

  async updateProfileDimensions(
    userId: string,
    partial: Partial<ProfileDimensions>,
    source?: string,
  ): Promise<LearnerProfileRecord> {
    const current = await this.getProfile(userId);
    const merged = mergeDimensions({ ...current.dimensions, ...partial });

    const updated = await prisma.learningProfile.update({
      where: { userId },
      data: {
        dimensions: toJson(merged),
        version: { increment: 1 },
        lastSource: source ?? current.lastSource ?? undefined,
      },
    });

    return this.mapProfile(updated, false);
  }

  async replaceProfileDimensions(
    userId: string,
    dimensions: Partial<ProfileDimensions>,
    source?: string,
  ): Promise<LearnerProfileRecord> {
    await this.ensureUserProfile(userId);
    const updated = await prisma.learningProfile.update({
      where: { userId },
      data: {
        dimensions: toJson(mergeDimensions(dimensions)),
        version: { increment: 1 },
        lastSource: source,
      },
    });

    return this.mapProfile(updated, false);
  }

  async markProfileCompleted(userId: string, source = 'profile_chat'): Promise<LearnerProfileRecord> {
    await this.ensureUserProfile(userId);

    await prisma.user.update({
      where: { id: userId },
      data: { profileCompletedAt: new Date() },
    });

    const updated = await prisma.learningProfile.update({
      where: { userId },
      data: {
        completedAt: new Date(),
        version: { increment: 1 },
        lastSource: source,
      },
    });

    return this.mapProfile(updated, false);
  }

  async getSkillMap(userId: string): Promise<SkillMap> {
    await ensureUser(userId);

    const entries = await prisma.learningSkillMastery.findMany({
      where: { userId },
      orderBy: [{ nextReviewAt: 'asc' }, { topic: 'asc' }],
    });

    return {
      userId,
      entries: entries.map((entry) => ({
        topic: entry.topic,
        mastery: entry.mastery,
        lastReviewed: entry.lastReviewedAt?.toISOString() ?? new Date(0).toISOString(),
        reviewCount: entry.reviewCount,
        streak: entry.streak,
        nextReviewDate: entry.nextReviewAt?.toISOString() ?? new Date().toISOString(),
        difficulty: entry.difficulty ?? 3,
      })),
      updatedAt: new Date().toISOString(),
    };
  }

  async getRecentSessions(userId: string, limit = 20): Promise<LearningSessionRecord[]> {
    const sessions = await prisma.learningMasterySession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        quizAttempts: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      userId: session.userId,
      topics: Array.isArray(session.topics) ? (session.topics as string[]) : [],
      quizResults: session.quizAttempts.map((attempt) => ({
        topic: attempt.topic,
        question: attempt.question,
        correct: attempt.correct,
        difficulty: attempt.difficulty ?? 3,
        userAnswer: attempt.userAnswer ?? '',
        correctAnswer: attempt.correctAnswer ?? '',
      })),
      evaluation: (session.evaluation as MasteryEvaluation | null) ?? null,
      startedAt: session.startedAt.toISOString(),
      completedAt: toIso(session.completedAt),
    }));
  }

  async getSchedule(userId: string): Promise<ScheduleEntry[]> {
    const entries = await prisma.learningScheduleEntry.findMany({
      where: { userId },
      orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }],
    });

    return entries.map((entry) => ({
      topic: entry.topic,
      dueDate: entry.dueAt.toISOString(),
      priority: entry.priority,
    }));
  }

  async getQuizStats(userId: string): Promise<QuizStats> {
    await ensureUser(userId);
    const [total, correct] = await Promise.all([
      prisma.learningQuizAttempt.count({ where: { userId } }),
      prisma.learningQuizAttempt.count({ where: { userId, correct: true } }),
    ]);
    return {
      totalAttempts: total,
      correctCount: correct,
      errorCount: total - correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : null,
    };
  }

  async getRecentQuizAttempts(userId: string, limit = 20): Promise<RecentQuizAttempt[]> {
    await ensureUser(userId);
    const attempts = await prisma.learningQuizAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return attempts.map((a) => ({
      topic: a.topic,
      question: a.question,
      correct: a.correct,
      difficulty: a.difficulty ?? 3,
      userAnswer: a.userAnswer ?? '',
      correctAnswer: a.correctAnswer ?? '',
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async getLearnerSnapshot(userId: string): Promise<LearnerSnapshot> {
    const [profile, skillMap, schedule, recentSessions, errorGroups, quizStats, recentQuizAttempts] =
      await Promise.all([
        this.getProfile(userId),
        this.getSkillMap(userId),
        this.getSchedule(userId),
        this.getRecentSessions(userId),
        prisma.learningQuizAttempt.groupBy({
          by: ['topic'],
          where: { userId, correct: false },
          _count: { topic: true },
          _max: { createdAt: true },
          orderBy: { _count: { topic: 'desc' } },
        }),
        this.getQuizStats(userId),
        this.getRecentQuizAttempts(userId),
      ]);

    const weakTopics = buildWeakTopics(skillMap.entries);
    const strongTopics = buildStrongTopics(skillMap.entries);

    // Build error-count map from errorGroups (correct: false)
    const errorCountsMap = new Map<string, number>();
    for (const g of errorGroups) {
      errorCountsMap.set(g.topic, g._count.topic);
    }

    // Enrich weak points with real attempts/errors from LearningQuizAttempt
    let weakTopicAttemptsMap = new Map<string, number>();
    if (weakTopics.length > 0) {
      const allAttemptsByTopic = await prisma.learningQuizAttempt.groupBy({
        by: ['topic'],
        where: { userId, topic: { in: weakTopics } },
        _count: { _all: true },
      });
      for (const g of allAttemptsByTopic) {
        weakTopicAttemptsMap.set(g.topic, g._count._all);
      }
    }

    return {
      profile,
      analytics: {
        skillMap,
        weakTopics,
        strongTopics,
        schedule,
      },
      weakPoints: skillMap.entries
        .filter((entry) => entry.mastery < 0.6)
        .sort((a, b) => a.mastery - b.mastery)
        .map((entry, index) => ({
          topic: entry.topic,
          mastery: entry.mastery,
          priority: index + 1,
          attempts: weakTopicAttemptsMap.get(entry.topic) ?? 0,
          errors: errorCountsMap.get(entry.topic) ?? 0,
        })),
      errors: errorGroups.map((group) => ({
        topic: group.topic,
        count: group._count.topic,
        latestAt: group._max.createdAt?.toISOString() ?? new Date(0).toISOString(),
      })),
      recentSessions,
      quizStats,
      recentQuizAttempts,
    };
  }

  private mapProfile(
    profile: {
      id: string;
      userId: string;
      version: number;
      dimensions: Prisma.JsonValue;
      createdAt: Date;
      updatedAt: Date;
      completedAt: Date | null;
      lastSource: string | null;
    },
    isNew: boolean,
  ): LearnerProfileRecord {
    return {
      id: profile.id,
      userId: profile.userId,
      version: profile.version,
      dimensions: mergeDimensions(profile.dimensions as Partial<ProfileDimensions>),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      completedAt: toIso(profile.completedAt),
      lastSource: profile.lastSource,
      isNew,
    };
  }
}

let learnerProfileService: LearnerProfileService | null = null;

export function getLearnerProfileService(): LearnerProfileService {
  if (!learnerProfileService) {
    learnerProfileService = new LearnerProfileService();
  }

  return learnerProfileService;
}
