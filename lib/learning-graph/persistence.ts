import { prisma } from '@/lib/db/client';

const REVIEW_INTERVAL_DAYS = [1, 3, 7, 30] as const;

function nextReviewDate(reviewCount: number, now: Date): Date {
  const index = Math.min(Math.max(reviewCount, 0), REVIEW_INTERVAL_DAYS.length - 1);
  const date = new Date(now);
  date.setDate(date.getDate() + REVIEW_INTERVAL_DAYS[index]);
  return date;
}

export interface LearningGraphPersistenceInput {
  userId: string;
  sessionId: string;
  topics: string[];
  quizResults: Array<{
    topic: string;
    question: string;
    correct: boolean;
    difficulty: number;
    userAnswer: string;
    correctAnswer: string;
  }>;
  evaluation: {
    weakPoints: string[];
    strongPoints: string[];
    suggestedFocus: string[];
    overallScore: number;
    feedback: string;
  } | null;
}

export async function persistLearningEvaluation(input: LearningGraphPersistenceInput): Promise<void> {
  const now = new Date();
  await prisma.user.upsert({
    where: { id: input.userId },
    update: {},
    create: { id: input.userId, name: input.userId },
  });

  await prisma.learningMasterySession.upsert({
    where: { id: input.sessionId },
    update: {
      topics: input.topics,
      ...(input.evaluation ? { evaluation: input.evaluation } : {}),
      completedAt: now,
    },
    create: {
      id: input.sessionId,
      userId: input.userId,
      topics: input.topics,
      ...(input.evaluation ? { evaluation: input.evaluation } : {}),
      completedAt: now,
    },
  });

  for (const result of input.quizResults) {
    await prisma.learningQuizAttempt.create({
      data: {
        masterySessionId: input.sessionId,
        userId: input.userId,
        topic: result.topic,
        question: result.question,
        userAnswer: result.userAnswer,
        correctAnswer: result.correctAnswer,
        correct: result.correct,
        difficulty: result.difficulty,
      },
    });

    const existing = await prisma.learningSkillMastery.findUnique({
      where: { userId_topic: { userId: input.userId, topic: result.topic } },
    });
    const reviewCount = (existing?.reviewCount ?? 0) + 1;
    const previousMastery = existing?.mastery ?? 0;
    const mastery = Math.max(0, Math.min(1, previousMastery * 0.7 + (result.correct ? 0.3 : 0)));
    const streak = result.correct ? (existing?.streak ?? 0) + 1 : 0;

    await prisma.learningSkillMastery.upsert({
      where: { userId_topic: { userId: input.userId, topic: result.topic } },
      update: {
        mastery,
        lastReviewedAt: now,
        reviewCount,
        streak,
        nextReviewAt: nextReviewDate(reviewCount, now),
        difficulty: result.difficulty,
      },
      create: {
        userId: input.userId,
        topic: result.topic,
        mastery,
        lastReviewedAt: now,
        reviewCount,
        streak,
        nextReviewAt: nextReviewDate(reviewCount, now),
        difficulty: result.difficulty,
      },
    });
  }
}

export async function initializeLearningTopics(userId: string, topics: string[]): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, name: userId },
  });

  for (const topic of topics) {
    await prisma.learningSkillMastery.upsert({
      where: { userId_topic: { userId, topic } },
      update: {},
      create: {
        userId,
        topic,
        mastery: 0,
        difficulty: 3,
        nextReviewAt: new Date(),
      },
    });

    await prisma.learningScheduleEntry.upsert({
      where: { id: `${userId}:${topic}` },
      update: {},
      create: {
        id: `${userId}:${topic}`,
        userId,
        topic,
        dueAt: new Date(),
        priority: 1,
      },
    });
  }
}
