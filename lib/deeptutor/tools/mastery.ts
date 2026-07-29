/**
 * Mastery Tools — 5 tools for the MasteryPath capability (Phase 3a)
 *
 * All five tools share a single module-level context (LearningService,
 * userId, optional LLM call) set via setMasteryToolsContext() before
 * the agent loop starts.
 *
 * Tools:
 *   1. MasteryStatusTool  — Show mastery overview or per-topic status
 *   2. MasteryQuizTool    — Generate an LLM-powered quiz question
 *   3. MasteryGradeTool   — Grade a user's answer and update the skill map
 *   4. MasteryAssessTool  — Comprehensive assessment report (weak/strong/schedule)
 *   5. MasteryBuildTool   — Generate an LLM-powered learning plan
 *
 * Storage layout is managed by LearningServiceImpl (data/learning/{userId}/).
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolResult,
  type ToolPromptHints,
  createToolResult,
  createToolParameter,
  createToolPromptHints,
} from '@/lib/deeptutor/core/tool-protocol';
import type { LearningServiceImpl } from '@/lib/deeptutor/services/learning';
import { createLogger } from '@/lib/logger';

const log = createLogger('MasteryTools');

// ---------------------------------------------------------------------------
// LLM call abstraction
// ---------------------------------------------------------------------------

type LLMCallFn = (params: {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}) => Promise<string>;

// ---------------------------------------------------------------------------
// Shared module-level context
// ---------------------------------------------------------------------------

let _learningService: LearningServiceImpl | null = null;
let _userId: string = 'anonymous';
let _llmCall: LLMCallFn | null = null;

/**
 * Inject the LearningService, userId, and optional LLM call function
 * used by all five mastery tools.  Call once during agent bootstrap,
 * before the agent loop starts processing tool calls.
 */
export function setMasteryToolsContext(
  learning: LearningServiceImpl,
  userId: string,
  llmCall?: LLMCallFn,
): void {
  _learningService = learning;
  _userId = userId;
  _llmCall = llmCall ?? null;
  log.info(`Mastery tools context set for userId=${userId}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireLearningService(): LearningServiceImpl | null {
  if (!_learningService) {
    log.warn('LearningService is not available');
  }
  return _learningService;
}

/**
 * Format a mastery fraction (0.0-1.0) as a percentage string with a
 * simple progress bar.
 */
function formatMasteryPct(mastery: number): string {
  const pct = Math.round(mastery * 100);
  const filled = Math.round(pct / 10);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
  return `${bar} ${pct}%`;
}

/**
 * Format an ISO date string into a short human-readable form.
 */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Safely parse a JSON response from the LLM, stripping markdown fences
 * if the model wraps the output in ```json ... ```.
 */
function parseLLMJson(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  // Strip leading/trailing ```json fences
  if (text.startsWith('```')) {
    const firstNewline = text.indexOf('\n');
    if (firstNewline !== -1) {
      text = text.slice(firstNewline + 1);
    }
    if (text.endsWith('```')) {
      text = text.slice(0, -3);
    }
    text = text.trim();
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool 1: MasteryStatusTool
// ---------------------------------------------------------------------------

export class MasteryStatusTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'mastery_status',
      description:
        'Show the learner\'s mastery overview or detailed status for a specific topic. ' +
        'Returns a table of topics with mastery percentage, streak, and next review date.',
      parameters: [
        createToolParameter({
          name: 'topic',
          type: 'string',
          description:
            'Optional topic name. If provided, shows detailed mastery for that topic only; otherwise shows the full overview.',
          required: false,
          default: '',
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Show mastery status for topics.',
      whenToUse:
        'Use when the learner asks about their progress, mastery levels, streaks, or when they want to know which topics need review.',
      inputFormat: 'topic (optional): a specific topic name to inspect',
      guideline:
        'Call without a topic for a full overview. Call with a topic for detailed information including review history.',
      note: 'Mastery is tracked on a 0-100% scale using spaced repetition.',
      phase: 'mastery',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const topic = ((kwargs.topic as string) ?? '').trim();

    const ls = requireLearningService();
    if (!ls) {
      return createToolResult({
        content: 'LearningService is not available. Mastery tracking requires the learning service to be initialized.',
        success: false,
      });
    }

    try {
      const skillMap = await ls.getSkillMap(_userId);

      if (skillMap.entries.length === 0) {
        return createToolResult({
          content:
            'No mastery data yet. Start learning and answering questions to build your skill map!',
          metadata: { userId: _userId, entryCount: 0 },
        });
      }

      // --- Single-topic detail view ---
      if (topic) {
        const entry = skillMap.entries.find(
          (e) => e.topic.toLowerCase() === topic.toLowerCase(),
        );

        if (!entry) {
          return createToolResult({
            content: `No mastery data found for topic "${topic}". Tracked topics: ${skillMap.entries.map((e) => e.topic).join(', ')}`,
            success: true,
            metadata: { topic, found: false },
          });
        }

        const lines = [
          `Mastery Detail: ${entry.topic}`,
          `========================================`,
          `  Mastery Level : ${formatMasteryPct(entry.mastery)}`,
          `  Streak        : ${entry.streak} correct in a row`,
          `  Difficulty    : ${entry.difficulty} / 5`,
          `  Review Count  : ${entry.reviewCount}`,
          `  Last Reviewed : ${formatDate(entry.lastReviewed)}`,
          `  Next Review   : ${formatDate(entry.nextReviewDate)}`,
        ];

        return createToolResult({
          content: lines.join('\n'),
          metadata: {
            topic: entry.topic,
            mastery: entry.mastery,
            streak: entry.streak,
            difficulty: entry.difficulty,
            reviewCount: entry.reviewCount,
          },
        });
      }

      // --- Full overview table ---
      const header = [
        'Topic',
        'Mastery',
        'Streak',
        'Difficulty',
        'Next Review',
      ];

      const colWidths = [
        Math.max(header[0].length, ...skillMap.entries.map((e) => e.topic.length)),
        14, // "██████████ 100%"
        6,
        10,
        12,
      ];

      const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));

      const headerRow = header.map((h, i) => pad(h, colWidths[i])).join('  ');
      const divider = colWidths.map((w) => '-'.repeat(w)).join('  ');

      const rows = skillMap.entries
        .sort((a, b) => b.mastery - a.mastery)
        .map((e) =>
          [
            pad(e.topic, colWidths[0]),
            pad(formatMasteryPct(e.mastery), colWidths[1]),
            pad(String(e.streak), colWidths[2]),
            pad(`${e.difficulty}/5`, colWidths[3]),
            pad(formatDate(e.nextReviewDate), colWidths[4]),
          ].join('  '),
        );

      const content = [
        `Mastery Overview for ${_userId} (${skillMap.entries.length} topic(s)):`,
        ``,
        headerRow,
        divider,
        ...rows,
        ``,
        `Last updated: ${formatDate(skillMap.updatedAt)}`,
      ].join('\n');

      return createToolResult({
        content,
        metadata: {
          userId: _userId,
          entryCount: skillMap.entries.length,
          topics: skillMap.entries.map((e) => ({
            topic: e.topic,
            mastery: e.mastery,
            streak: e.streak,
          })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('MasteryStatusTool failed:', message);
      return createToolResult({
        content: `Failed to retrieve mastery status: ${message}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Tool 2: MasteryQuizTool
// ---------------------------------------------------------------------------

const QUIZ_SYSTEM_PROMPT = `You are an expert quiz generator for educational content.
Generate clear, well-structured quiz questions that test genuine understanding,
not just memorization. Adapt the difficulty to the requested level.

Always respond with valid JSON only, no additional commentary.`;

export class MasteryQuizTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'mastery_quiz',
      description:
        'Generate a quiz question for a given topic at a specified difficulty level. ' +
        'Returns a question with 4 multiple-choice options, the correct answer, and an explanation.',
      parameters: [
        createToolParameter({
          name: 'topic',
          type: 'string',
          description: 'The topic to generate a quiz question about.',
          required: true,
        }),
        createToolParameter({
          name: 'difficulty',
          type: 'integer',
          description: 'Difficulty level from 1 (beginner) to 5 (expert). Default is 3.',
          required: false,
          default: 3,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Generate a quiz question for a topic.',
      whenToUse:
        'Use when the learner wants to test their knowledge, practice a topic, or when the tutor initiates a mastery check.',
      inputFormat: 'topic: the subject area; difficulty (optional): 1-5 scale',
      guideline:
        'Start at difficulty 3 for new topics. Increase if the learner answers correctly; decrease if they struggle.',
      note: 'After the learner answers, use mastery_grade to record the result.',
      phase: 'mastery',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const topic = (kwargs.topic as string)?.trim();
    const difficulty = Math.min(5, Math.max(1, Math.round((kwargs.difficulty as number) ?? 3)));

    if (!topic) {
      return createToolResult({
        content: 'Error: "topic" is required and must be a non-empty string.',
        success: false,
      });
    }

    if (!_llmCall) {
      return createToolResult({
        content:
          'LLM backend is not available. Quiz generation requires an LLM connection. ' +
          'Please ensure the mastery tools context is configured with an llmCall function.',
        success: false,
        metadata: { topic, difficulty },
      });
    }

    log.info(`Generating quiz for topic="${topic}" difficulty=${difficulty}`);

    try {
      const prompt = [
        `Generate a quiz question about ${topic} at difficulty level ${difficulty}/5.`,
        ``,
        `Format as JSON:`,
        `{`,
        `  "question": "The quiz question text",`,
        `  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],`,
        `  "correctAnswer": "A" | "B" | "C" | "D",`,
        `  "explanation": "Why this is the correct answer"`,
        `}`,
        ``,
        `Rules:`,
        `- Difficulty ${difficulty}/5: ${
          difficulty <= 1
            ? 'basic recall, simple definitions'
            : difficulty <= 2
              ? 'conceptual understanding, straightforward application'
              : difficulty <= 3
                ? 'application and analysis, moderate complexity'
                : difficulty <= 4
                  ? 'synthesis and evaluation, multi-step reasoning'
                  : 'expert-level, edge cases, deep integration of concepts'
        }`,
        `- All four options must be plausible (no joke answers)`,
        `- The question should be unambiguous with exactly one correct answer`,
        `- Respond with JSON only, no markdown fences`,
      ].join('\n');

      const raw = await _llmCall({
        system: QUIZ_SYSTEM_PROMPT,
        prompt,
        temperature: 0.7,
        maxTokens: 1024,
      });

      const parsed = parseLLMJson(raw);
      if (!parsed) {
        log.error('Quiz LLM returned non-JSON response:', raw.slice(0, 200));
        return createToolResult({
          content: `Quiz generation failed: the LLM returned an unparseable response. Raw output:\n${raw}`,
          success: false,
          metadata: { topic, difficulty },
        });
      }

      const question = (parsed.question as string) ?? '';
      const options = (parsed.options as string[]) ?? [];
      const correctAnswer = (parsed.correctAnswer as string) ?? '';
      const explanation = (parsed.explanation as string) ?? '';

      if (!question || options.length < 4 || !correctAnswer) {
        return createToolResult({
          content: `Quiz generation returned incomplete data. Question: "${question}", Options: ${options.length}, Correct: "${correctAnswer}".`,
          success: false,
          metadata: { topic, difficulty, raw: parsed },
        });
      }

      const lines = [
        `Quiz: ${topic} (Difficulty: ${difficulty}/5)`,
        `========================================`,
        ``,
        question,
        ``,
        ...options.map((opt) => `  ${opt}`),
        ``,
        `--- Answer Key ---`,
        `Correct Answer: ${correctAnswer}`,
        `Explanation: ${explanation}`,
      ];

      return createToolResult({
        content: lines.join('\n'),
        metadata: {
          topic,
          difficulty,
          question,
          options,
          correctAnswer,
          explanation,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('MasteryQuizTool failed:', message);
      return createToolResult({
        content: `Quiz generation failed: ${message}`,
        success: false,
        metadata: { topic, difficulty },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Tool 3: MasteryGradeTool
// ---------------------------------------------------------------------------

export class MasteryGradeTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'mastery_grade',
      description:
        'Grade a learner\'s answer to a quiz question, record the result, ' +
        'and update the mastery level for the topic.',
      parameters: [
        createToolParameter({
          name: 'topic',
          type: 'string',
          description: 'The topic this question belongs to.',
          required: true,
        }),
        createToolParameter({
          name: 'question',
          type: 'string',
          description: 'The quiz question that was asked.',
          required: true,
        }),
        createToolParameter({
          name: 'user_answer',
          type: 'string',
          description: 'The answer the learner provided (e.g. "A", "B", "C", or "D").',
          required: true,
        }),
        createToolParameter({
          name: 'correct_answer',
          type: 'string',
          description: 'The correct answer letter (e.g. "A", "B", "C", or "D").',
          required: true,
        }),
        createToolParameter({
          name: 'difficulty',
          type: 'integer',
          description: 'Difficulty level from 1 to 5. Default is 3.',
          required: false,
          default: 3,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Grade a quiz answer and update mastery.',
      whenToUse:
        'Use immediately after the learner answers a quiz question generated by mastery_quiz.',
      inputFormat:
        'topic, question, user_answer (A/B/C/D), correct_answer (A/B/C/D), difficulty (optional 1-5)',
      guideline:
        'Compare user_answer and correct_answer case-insensitively. The tool handles session creation and mastery updates automatically.',
      note: 'Mastery increases on correct answers (SM-2 spaced repetition) and decreases on incorrect ones.',
      phase: 'mastery',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const topic = (kwargs.topic as string)?.trim();
    const question = (kwargs.question as string)?.trim();
    const userAnswer = (kwargs.user_answer as string)?.trim();
    const correctAnswer = (kwargs.correct_answer as string)?.trim();
    const difficulty = Math.min(5, Math.max(1, Math.round((kwargs.difficulty as number) ?? 3)));

    if (!topic) {
      return createToolResult({
        content: 'Error: "topic" is required.',
        success: false,
      });
    }
    if (!question) {
      return createToolResult({
        content: 'Error: "question" is required.',
        success: false,
      });
    }
    if (!userAnswer) {
      return createToolResult({
        content: 'Error: "user_answer" is required.',
        success: false,
      });
    }
    if (!correctAnswer) {
      return createToolResult({
        content: 'Error: "correct_answer" is required.',
        success: false,
      });
    }

    const ls = requireLearningService();
    if (!ls) {
      return createToolResult({
        content: 'LearningService is not available. Grading requires the learning service to be initialized.',
        success: false,
      });
    }

    try {
      // Case-insensitive comparison (normalise to upper-case letter)
      const isCorrect =
        userAnswer.toUpperCase() === correctAnswer.toUpperCase();

      // Create a short-lived session for this single grading event
      const session = await ls.createMasterySession(_userId, [topic]);

      const quizResult = {
        topic,
        question,
        correct: isCorrect,
        difficulty,
        userAnswer,
        correctAnswer,
      };

      // addQuizResult internally calls updateMastery, so the skill map
      // is updated in a single SM-2 step (no double-counting).
      await ls.addQuizResult(_userId, session.id, quizResult);

      // Retrieve the updated entry so we can report the new mastery level
      const skillMap = await ls.getSkillMap(_userId);
      const entry = skillMap.entries.find(
        (e) => e.topic.toLowerCase() === topic.toLowerCase(),
      );

      const masteryPct = entry ? Math.round(entry.mastery * 100) : null;
      const streak = entry?.streak ?? 0;

      const lines = [
        `Grade Result: ${topic}`,
        `========================================`,
        `  Your Answer   : ${userAnswer.toUpperCase()}`,
        `  Correct Answer: ${correctAnswer.toUpperCase()}`,
        `  Result        : ${isCorrect ? 'CORRECT' : 'INCORRECT'}`,
        `  Difficulty    : ${difficulty}/5`,
      ];

      if (masteryPct !== null) {
        lines.push(
          ``,
          `  Mastery Level : ${formatMasteryPct(entry!.mastery)}`,
          `  Streak        : ${streak} correct in a row`,
          `  Next Review   : ${formatDate(entry!.nextReviewDate)}`,
        );
      }

      if (isCorrect) {
        lines.push(``, `Great job! Keep it up.`);
      } else {
        lines.push(``, `Don't worry — review the topic and try again. Spaced repetition will bring it back.`);
      }

      return createToolResult({
        content: lines.join('\n'),
        metadata: {
          topic,
          correct: isCorrect,
          userAnswer: userAnswer.toUpperCase(),
          correctAnswer: correctAnswer.toUpperCase(),
          difficulty,
          mastery: entry?.mastery ?? null,
          streak,
          sessionId: session.id,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('MasteryGradeTool failed:', message);
      return createToolResult({
        content: `Grading failed: ${message}`,
        success: false,
        metadata: { topic },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Tool 4: MasteryAssessTool
// ---------------------------------------------------------------------------

export class MasteryAssessTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'mastery_assess',
      description:
        'Generate a comprehensive mastery assessment report. ' +
        'Shows weak topics, strong topics, upcoming reviews, and overall readiness.',
      parameters: [],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Full mastery assessment report.',
      whenToUse:
        'Use when the learner asks for an overall evaluation, readiness check, or study recommendations.',
      inputFormat: 'No parameters required.',
      guideline:
        'This tool gives a holistic view: weak areas to focus on, strong areas to maintain, and the upcoming review schedule.',
      note: 'Combine with mastery_build to create targeted study plans for weak topics.',
      phase: 'mastery',
    });
  }

  async execute(_kwargs: Record<string, unknown>): Promise<ToolResult> {
    const ls = requireLearningService();
    if (!ls) {
      return createToolResult({
        content: 'LearningService is not available. Assessment requires the learning service to be initialized.',
        success: false,
      });
    }

    try {
      const [weakTopics, strongTopics, schedule, skillMap] = await Promise.all([
        ls.getWeakTopics(_userId),
        ls.getStrongTopics(_userId),
        ls.getSchedule(_userId),
        ls.getSkillMap(_userId),
      ]);

      if (skillMap.entries.length === 0) {
        return createToolResult({
          content:
            'No mastery data available yet. Start learning and answering questions to generate an assessment.',
          metadata: { userId: _userId, entryCount: 0 },
        });
      }

      // Compute overall score (average mastery * 100)
      const avgMastery =
        skillMap.entries.reduce((sum, e) => sum + e.mastery, 0) /
        skillMap.entries.length;
      const overallScore = Math.round(avgMastery * 100);

      // Identify overdue items
      const now = Date.now();
      const overdue = schedule.filter(
        (s) => new Date(s.dueDate).getTime() < now,
      );
      const upcoming = schedule.filter(
        (s) => new Date(s.dueDate).getTime() >= now,
      );

      // Build the report
      const sections: string[] = [];

      sections.push(
        `Mastery Assessment for ${_userId}`,
        `========================================`,
        ``,
        `Overall Score: ${overallScore}/100  ${formatMasteryPct(avgMastery)}`,
        `Total Topics Tracked: ${skillMap.entries.length}`,
        ``,
      );

      // Weak topics
      sections.push(`--- Weak Topics (mastery < 60%) ---`);
      if (weakTopics.length === 0) {
        sections.push(`  No weak topics! All tracked topics are above 60% mastery.`);
      } else {
        for (const t of weakTopics) {
          const entry = skillMap.entries.find(
            (e) => e.topic.toLowerCase() === t.toLowerCase(),
          );
          const pct = entry ? Math.round(entry.mastery * 100) : 0;
          sections.push(`  - ${t}: ${pct}% mastery (streak: ${entry?.streak ?? 0})`);
        }
      }
      sections.push(``);

      // Strong topics
      sections.push(`--- Strong Topics (mastery >= 80%) ---`);
      if (strongTopics.length === 0) {
        sections.push(`  No strong topics yet. Keep practising to build mastery.`);
      } else {
        for (const t of strongTopics) {
          const entry = skillMap.entries.find(
            (e) => e.topic.toLowerCase() === t.toLowerCase(),
          );
          const pct = entry ? Math.round(entry.mastery * 100) : 0;
          sections.push(`  + ${t}: ${pct}% mastery (streak: ${entry?.streak ?? 0})`);
        }
      }
      sections.push(``);

      // Overdue reviews
      sections.push(`--- Overdue Reviews (${overdue.length}) ---`);
      if (overdue.length === 0) {
        sections.push(`  All reviews are up to date.`);
      } else {
        for (const s of overdue.slice(0, 10)) {
          sections.push(
            `  ! ${s.topic} — was due ${formatDate(s.dueDate)} (priority: ${s.priority}/5)`,
          );
        }
        if (overdue.length > 10) {
          sections.push(`  ... and ${overdue.length - 10} more overdue topics.`);
        }
      }
      sections.push(``);

      // Upcoming reviews
      sections.push(`--- Upcoming Reviews (${upcoming.length}) ---`);
      if (upcoming.length === 0) {
        sections.push(`  No upcoming reviews scheduled.`);
      } else {
        for (const s of upcoming.slice(0, 10)) {
          sections.push(
            `  > ${s.topic} — due ${formatDate(s.dueDate)} (priority: ${s.priority}/5)`,
          );
        }
        if (upcoming.length > 10) {
          sections.push(`  ... and ${upcoming.length - 10} more upcoming reviews.`);
        }
      }
      sections.push(``);

      // Recommendations
      sections.push(`--- Recommendations ---`);
      if (weakTopics.length > 0) {
        sections.push(
          `  1. Focus on weak topics: ${weakTopics.slice(0, 5).join(', ')}`,
        );
      }
      if (overdue.length > 0) {
        sections.push(
          `  2. Complete ${overdue.length} overdue review(s) to maintain your streaks.`,
        );
      }
      if (weakTopics.length > 0) {
        sections.push(
          `  3. Use mastery_build to create a targeted learning plan for your weakest topic.`,
        );
      }
      if (weakTopics.length === 0 && overdue.length === 0) {
        sections.push(`  You are in great shape! Consider exploring new topics or increasing difficulty.`);
      }

      const content = sections.join('\n');

      return createToolResult({
        content,
        metadata: {
          userId: _userId,
          overallScore,
          weakTopics,
          strongTopics,
          overdueCount: overdue.length,
          upcomingCount: upcoming.length,
          totalTopics: skillMap.entries.length,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('MasteryAssessTool failed:', message);
      return createToolResult({
        content: `Assessment failed: ${message}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Tool 5: MasteryBuildTool
// ---------------------------------------------------------------------------

const BUILD_SYSTEM_PROMPT = `You are an expert learning strategist. Your job is to create
structured, actionable learning plans that guide a learner from their current
level to mastery of a topic.

Break the topic into progressive milestones with clear descriptions and
realistic time estimates. Suggest concrete resources (types of materials,
not specific URLs) that support each milestone.

Always respond with valid JSON only, no additional commentary.`;

export class MasteryBuildTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'mastery_build',
      description:
        'Create a structured mastery learning plan for a topic. ' +
        'Returns milestones with descriptions, estimated time, and recommended resources.',
      parameters: [
        createToolParameter({
          name: 'topic',
          type: 'string',
          description: 'The topic to create a learning plan for.',
          required: true,
        }),
        createToolParameter({
          name: 'goal',
          type: 'string',
          description:
            'Optional learning goal. If omitted, defaults to "achieve mastery".',
          required: false,
          default: '',
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Create a mastery learning plan for a topic.',
      whenToUse:
        'Use when the learner wants a structured study plan, is starting a new topic, or needs a roadmap to mastery.',
      inputFormat: 'topic: the subject to master; goal (optional): a specific objective',
      guideline:
        'Provide a specific goal when possible (e.g. "pass the AWS exam" instead of "learn AWS") for a more targeted plan.',
      note: 'The plan is generated by an LLM and may need adjustment based on the learner\'s background.',
      phase: 'mastery',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const topic = (kwargs.topic as string)?.trim();
    const goal = ((kwargs.goal as string) ?? '').trim() || 'achieve mastery';

    if (!topic) {
      return createToolResult({
        content: 'Error: "topic" is required and must be a non-empty string.',
        success: false,
      });
    }

    if (!_llmCall) {
      return createToolResult({
        content:
          'LLM backend is not available. Learning plan generation requires an LLM connection. ' +
          'Please ensure the mastery tools context is configured with an llmCall function.',
        success: false,
        metadata: { topic, goal },
      });
    }

    // Optionally read the current mastery level to inform the plan
    let currentMastery = 0;
    const ls = requireLearningService();
    if (ls) {
      try {
        currentMastery = await ls.getMasteryLevel(_userId, topic);
      } catch {
        // Ignore — we just won't include current mastery in the prompt
      }
    }

    log.info(`Building learning plan for topic="${topic}" goal="${goal}"`);

    try {
      const masteryContext =
        currentMastery > 0
          ? `\nCurrent mastery level: ${Math.round(currentMastery * 100)}% — adjust the plan to skip basics if appropriate.`
          : '';

      const prompt = [
        `Create a mastery learning plan for ${topic}.`,
        `Goal: ${goal}.${masteryContext}`,
        ``,
        `Format as JSON:`,
        `{`,
        `  "topic": "${topic}",`,
        `  "goal": "${goal}",`,
        `  "milestones": [`,
        `    {`,
        `      "title": "Milestone title",`,
        `      "description": "What to learn and how to practise",`,
        `      "estimatedTime": "e.g. 2 hours, 1 week"`,
        `    }`,
        `  ],`,
        `  "resources": ["Type of resource or recommended material"]`,
        `}`,
        ``,
        `Rules:`,
        `- Create 4-6 progressive milestones from foundations to advanced`,
        `- Each milestone should be achievable in 1-10 hours`,
        `- Resources should be categories (e.g. "textbook chapters on X", "interactive coding exercises") not specific URLs`,
        `- Respond with JSON only, no markdown fences`,
      ].join('\n');

      const raw = await _llmCall({
        system: BUILD_SYSTEM_PROMPT,
        prompt,
        temperature: 0.5,
        maxTokens: 2048,
      });

      const parsed = parseLLMJson(raw);
      if (!parsed) {
        log.error('Build LLM returned non-JSON response:', raw.slice(0, 200));
        return createToolResult({
          content: `Learning plan generation failed: the LLM returned an unparseable response. Raw output:\n${raw}`,
          success: false,
          metadata: { topic, goal },
        });
      }

      const milestones = (parsed.milestones as Array<Record<string, unknown>>) ?? [];
      const resources = (parsed.resources as string[]) ?? [];

      if (milestones.length === 0) {
        return createToolResult({
          content: `Learning plan generation returned no milestones. Raw response:\n${raw}`,
          success: false,
          metadata: { topic, goal },
        });
      }

      // Format the plan for display
      const lines = [
        `Learning Plan: ${topic}`,
        `Goal: ${goal}`,
        `========================================`,
        ``,
      ];

      milestones.forEach((m, i) => {
        const title = (m.title as string) ?? `Milestone ${i + 1}`;
        const description = (m.description as string) ?? '';
        const estimatedTime = (m.estimatedTime as string) ?? 'N/A';

        lines.push(
          `  ${i + 1}. ${title}`,
          `     ${description}`,
          `     Estimated time: ${estimatedTime}`,
          ``,
        );
      });

      if (resources.length > 0) {
        lines.push(`--- Recommended Resources ---`);
        for (const r of resources) {
          lines.push(`  - ${r}`);
        }
      }

      return createToolResult({
        content: lines.join('\n'),
        metadata: {
          topic,
          goal,
          milestones,
          resources,
          currentMastery,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('MasteryBuildTool failed:', message);
      return createToolResult({
        content: `Learning plan generation failed: ${message}`,
        success: false,
        metadata: { topic, goal },
      });
    }
  }
}
