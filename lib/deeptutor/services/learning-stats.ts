/**
 * Learning Stats Service
 *
 * Aggregates real learning statistics from the database for the homepage
 * dashboard. All queries are scoped by userId and executed in parallel
 * via Promise.all for minimal latency.
 */

import { prisma } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningStatsResponse {
  /** Study duration in minutes */
  minutes: number;
  /** Total quiz attempts */
  answered: number;
  /** Accuracy percentage (0–100), 0 when no attempts */
  accuracy: number;
  /** Number of distinct study days */
  days: number;
  /** Total DtSession count */
  sessions: number;
  /** DtSessions with at least one running turn */
  activeSessions: number;
  /** DtKnowledgeBase count */
  knowledgeBases: number;
  /** Sum of DtKnowledgeBase.documentCount */
  totalDocs: number;
  /** MemoryEntry count */
  memoryEntries: number;
  /** Week-over-week accuracy change (positive = improvement) */
  weeklyChange: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the Monday 00:00 of the week that contains `date`. */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // getDay(): 0=Sun, 1=Mon, … 6=Sat → shift so Monday=0
  const offset = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LearningStatsService {
  /**
   * Compute all learning stats for the given user.
   * Returns zeroed defaults when the user has no data.
   */
  async getStats(userId: string): Promise<LearningStatsResponse> {
    // ---- Parallel batch 1: simple counts & aggregates ----
    const [
      quizCount,
      correctCount,
      sessionCount,
      knowledgeBaseCount,
      docSumResult,
      memoryCount,
    ] = await Promise.all([
      prisma.learningQuizAttempt.count({ where: { userId } }).catch(() => 0),
      prisma.learningQuizAttempt
        .count({ where: { userId, correct: true } })
        .catch(() => 0),
      prisma.dtSession.count({ where: { userId } }).catch(() => 0),
      prisma.dtKnowledgeBase.count({ where: { userId } }).catch(() => 0),
      prisma.dtKnowledgeBase
        .aggregate({
          where: { userId },
          _sum: { documentCount: true },
        })
        .then((r) => r._sum.documentCount ?? 0)
        .catch(() => 0),
      prisma.memoryEntry.count({ where: { userId } }).catch(() => 0),
    ]);

    const totalDocs = typeof docSumResult === 'number' ? docSumResult : 0;
    const accuracy = quizCount > 0 ? Math.round((correctCount / quizCount) * 1000) / 10 : 0;

    // ---- Parallel batch 2: raw SQL queries (date math & distinct) ----
    const [minutesResult, daysResult, activeSessionsResult, weeklyChangeResult] =
      await Promise.all([
        this.queryMinutes(userId),
        this.queryStudyDays(userId),
        this.queryActiveSessions(userId),
        this.queryWeeklyChange(userId),
      ]);

    // ---- Fallback: estimate minutes from session count if no mastery data ----
    const minutes =
      minutesResult > 0 ? minutesResult : sessionCount > 0 ? sessionCount * 5 : 0;

    return {
      minutes,
      answered: quizCount,
      accuracy,
      days: daysResult,
      sessions: sessionCount,
      activeSessions: activeSessionsResult,
      knowledgeBases: knowledgeBaseCount,
      totalDocs,
      memoryEntries: memoryCount,
      weeklyChange: weeklyChangeResult,
    };
  }

  // -------------------------------------------------------------------------
  // Raw SQL helpers
  // -------------------------------------------------------------------------

  /**
   * Total study minutes from LearningMasterySession.
   * Sums (completedAt - startedAt) for completed sessions.
   */
  private async queryMinutes(userId: string): Promise<number> {
    try {
      const rows = await prisma.$queryRaw<Array<{ total_minutes: number }>>`
        SELECT COALESCE(
          SUM(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60), 0
        )::float AS total_minutes
        FROM learning_mastery_sessions
        WHERE user_id = ${userId}
          AND completed_at IS NOT NULL
      `;
      return Math.round(rows[0]?.total_minutes ?? 0);
    } catch {
      return 0;
    }
  }

  /**
   * Number of distinct calendar days the user has studied.
   * Primary source: learning_quiz_attempts. Fallback: dt_sessions.
   */
  private async queryStudyDays(userId: string): Promise<number> {
    try {
      // Try quiz attempts first
      const quizRows = await prisma.$queryRaw<Array<{ day_count: number }>>`
        SELECT COUNT(DISTINCT (created_at::date))::int AS day_count
        FROM learning_quiz_attempts
        WHERE user_id = ${userId}
      `;
      const quizDays = quizRows[0]?.day_count ?? 0;
      if (quizDays > 0) return quizDays;

      // Fallback: dt_sessions
      const sessionRows = await prisma.$queryRaw<Array<{ day_count: number }>>`
        SELECT COUNT(DISTINCT (created_at::date))::int AS day_count
        FROM dt_sessions
        WHERE user_id = ${userId}
      `;
      return sessionRows[0]?.day_count ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Count sessions that have at least one running turn.
   */
  private async queryActiveSessions(userId: string): Promise<number> {
    try {
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(DISTINCT s.id)::int AS count
        FROM dt_sessions s
        JOIN dt_turns t ON t.session_id = s.id
        WHERE s.user_id = ${userId}
          AND t.status = 'running'
      `;
      return rows[0]?.count ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Compute week-over-week accuracy change.
   * Returns the difference (this_week_accuracy - last_week_accuracy),
   * or 0 if there's not enough data.
   */
  private async queryWeeklyChange(userId: string): Promise<number> {
    try {
      const now = new Date();
      const thisWeekStart = getWeekStart(now);
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      const [thisWeek, lastWeek] = await Promise.all([
        prisma.$queryRaw<
          Array<{ total: number; correct: number }>
        >`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE correct = true)::int AS correct
          FROM learning_quiz_attempts
          WHERE user_id = ${userId}
            AND created_at >= ${thisWeekStart}
        `,
        prisma.$queryRaw<
          Array<{ total: number; correct: number }>
        >`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE correct = true)::int AS correct
          FROM learning_quiz_attempts
          WHERE user_id = ${userId}
            AND created_at >= ${lastWeekStart}
            AND created_at < ${thisWeekStart}
        `,
      ]);

      const thisTotal = thisWeek[0]?.total ?? 0;
      const thisCorrect = thisWeek[0]?.correct ?? 0;
      const lastTotal = lastWeek[0]?.total ?? 0;
      const lastCorrect = lastWeek[0]?.correct ?? 0;

      if (thisTotal === 0 || lastTotal === 0) return 0;

      const thisAcc = (thisCorrect / thisTotal) * 100;
      const lastAcc = (lastCorrect / lastTotal) * 100;

      return Math.round((thisAcc - lastAcc) * 10) / 10;
    } catch {
      return 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let learningStatsService: LearningStatsService | null = null;

export function getLearningStatsService(): LearningStatsService {
  if (!learningStatsService) {
    learningStatsService = new LearningStatsService();
  }
  return learningStatsService;
}
