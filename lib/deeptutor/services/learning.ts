import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import {
  getLearnerProfileService,
  type LearningSessionRecord as MasterySession,
  type MasteryEvaluation,
  type MasteryQuizResult,
  type ScheduleEntry,
  type SkillEntry,
  type SkillMap,
} from '@/lib/deeptutor/services/learner-profile';

const log = createLogger('LearningService');
const learnerProfileService = getLearnerProfileService();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export { type SkillEntry, type SkillMap, type MasterySession, type MasteryQuizResult, type MasteryEvaluation, type ScheduleEntry };

export class LearningServiceImpl {
  async getSkillMap(userId: string): Promise<SkillMap> {
    return learnerProfileService.getSkillMap(userId);
  }

  async updateMastery(
    userId: string,
    topic: string,
    correct: boolean,
    difficulty: number,
  ): Promise<SkillEntry> {
    await learnerProfileService.ensureUserProfile(userId);

    const existing = await prisma.learningSkillMastery.findUnique({
      where: { userId_topic: { userId, topic } },
    });

    const boundedDifficulty = clamp(difficulty, 1, 5);
    const lastReviewedAt = new Date();

    const nextState = (() => {
      if (!existing) {
        const mastery = correct ? 0.1 : 0;
        const streak = correct ? 1 : 0;
        const interval = correct ? 1 : 1;
        return {
          mastery,
          streak,
          reviewCount: 1,
          nextReviewAt: daysFromNow(interval),
        };
      }

      if (correct) {
        const streak = existing.streak + 1;
        const mastery = clamp(existing.mastery + 0.1 * (1 + existing.streak * 0.05), 0, 1);
        const interval = Math.min(30, Math.pow(2, streak - 1));
        return {
          mastery,
          streak,
          reviewCount: existing.reviewCount + 1,
          nextReviewAt: daysFromNow(interval),
        };
      }

      return {
        mastery: clamp(existing.mastery - 0.15 * boundedDifficulty, 0, 1),
        streak: 0,
        reviewCount: existing.reviewCount + 1,
        nextReviewAt: daysFromNow(1),
      };
    })();

    const entry = await prisma.learningSkillMastery.upsert({
      where: { userId_topic: { userId, topic } },
      update: {
        mastery: nextState.mastery,
        streak: nextState.streak,
        reviewCount: nextState.reviewCount,
        lastReviewedAt,
        nextReviewAt: nextState.nextReviewAt,
        difficulty: boundedDifficulty,
      },
      create: {
        userId,
        topic,
        mastery: nextState.mastery,
        streak: nextState.streak,
        reviewCount: nextState.reviewCount,
        lastReviewedAt,
        nextReviewAt: nextState.nextReviewAt,
        difficulty: boundedDifficulty,
      },
    });

    log.debug(`updateMastery userId=${userId} topic=${topic} correct=${correct} mastery=${entry.mastery.toFixed(3)}`);

    return {
      topic: entry.topic,
      mastery: entry.mastery,
      lastReviewed: entry.lastReviewedAt?.toISOString() ?? lastReviewedAt.toISOString(),
      reviewCount: entry.reviewCount,
      streak: entry.streak,
      nextReviewDate: entry.nextReviewAt?.toISOString() ?? daysFromNow(1).toISOString(),
      difficulty: entry.difficulty ?? boundedDifficulty,
    };
  }

  async getMasteryLevel(userId: string, topic: string): Promise<number> {
    try {
      const entry = await prisma.learningSkillMastery.findUnique({
        where: { userId_topic: { userId, topic } },
        select: { mastery: true },
      });
      return entry?.mastery ?? 0;
    } catch (error) {
      log.error('getMasteryLevel failed', error);
      return 0;
    }
  }

  async getWeakTopics(userId: string, threshold: number = 0.6): Promise<string[]> {
    try {
      const map = await this.getSkillMap(userId);
      return map.entries.filter((entry) => entry.mastery < threshold).map((entry) => entry.topic);
    } catch (error) {
      log.error('getWeakTopics failed', error);
      return [];
    }
  }

  async getStrongTopics(userId: string, threshold: number = 0.8): Promise<string[]> {
    try {
      const map = await this.getSkillMap(userId);
      return map.entries.filter((entry) => entry.mastery >= threshold).map((entry) => entry.topic);
    } catch (error) {
      log.error('getStrongTopics failed', error);
      return [];
    }
  }

  async createMasterySession(userId: string, topics: string[]): Promise<MasterySession> {
    await learnerProfileService.ensureUserProfile(userId);

    const session = await prisma.learningMasterySession.create({
      data: {
        userId,
        topics,
      },
      include: { quizAttempts: true },
    });

    return {
      id: session.id,
      userId: session.userId,
      topics,
      quizResults: [],
      evaluation: null,
      startedAt: session.startedAt.toISOString(),
      completedAt: null,
    };
  }

  async addQuizResult(
    _userId: string,
    sessionId: string,
    result: MasteryQuizResult,
  ): Promise<MasterySession | null> {
    const session = await prisma.learningMasterySession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!session) {
      return null;
    }

    await prisma.learningQuizAttempt.create({
      data: {
        masterySessionId: session.id,
        userId: session.userId,
        topic: result.topic,
        question: result.question,
        correct: result.correct,
        difficulty: result.difficulty,
        userAnswer: result.userAnswer,
        correctAnswer: result.correctAnswer,
      },
    });

    return this.getSession(sessionId);
  }

  async completeMasterySession(
    _userId: string,
    sessionId: string,
    evaluation: MasteryEvaluation,
  ): Promise<MasterySession | null> {
    const session = await prisma.learningMasterySession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!session) {
      return null;
    }

    await prisma.learningMasterySession.update({
      where: { id: sessionId },
      data: {
        evaluation: evaluation as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    return this.getSession(sessionId);
  }

  async getSession(sessionId: string): Promise<MasterySession | null> {
    const session = await prisma.learningMasterySession.findUnique({
      where: { id: sessionId },
      include: {
        quizAttempts: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return null;
    }

    return {
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
      completedAt: session.completedAt?.toISOString() ?? null,
    };
  }

  async getSessions(userId: string): Promise<MasterySession[]> {
    return learnerProfileService.getRecentSessions(userId, 100);
  }

  async getSchedule(userId: string): Promise<ScheduleEntry[]> {
    return learnerProfileService.getSchedule(userId);
  }

  async refreshSchedule(userId: string): Promise<ScheduleEntry[]> {
    const skillMap = await this.getSkillMap(userId);
    const dueTopics = skillMap.entries
      .filter((entry) => new Date(entry.nextReviewDate).getTime() <= Date.now())
      .sort((a, b) => a.mastery - b.mastery);

    await prisma.learningScheduleEntry.deleteMany({ where: { userId } });

    if (dueTopics.length > 0) {
      await prisma.learningScheduleEntry.createMany({
        data: dueTopics.map((entry, index) => ({
          userId,
          topic: entry.topic,
          dueAt: new Date(entry.nextReviewDate),
          priority: Math.max(1, 5 - Math.floor(entry.mastery * 5) + Math.min(index, 1)),
          status: 'pending',
        })),
      });
    }

    return this.getSchedule(userId);
  }
}

let singleton: LearningServiceImpl | null = null;

export function getLearningService(): LearningServiceImpl {
  if (!singleton) {
    singleton = new LearningServiceImpl();
  }
  return singleton;
}
