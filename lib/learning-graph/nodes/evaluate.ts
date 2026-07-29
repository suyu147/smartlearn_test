import type { LearnEvent } from '../types';
import type { LearningStateType } from '../state';
import { evaluateQuizResults } from '../helpers/evaluate';

import { persistLearningEvaluation } from '../persistence';

function getWriter(config: { configurable?: { writer?: (event: LearnEvent) => void } }) {
  return config.configurable?.writer ?? (() => undefined);
}

function getUserId(config: { configurable?: { userId?: string } }): string {
  return config.configurable?.userId ?? 'anonymous';
}

export async function evaluateNode(
  state: LearningStateType,
  config: { configurable?: { writer?: (event: LearnEvent) => void; userId?: string } },
) {
  const write = getWriter(config);
  write({ type: 'phase_start', phase: 'evaluate' });

  try {
    if (state.quizResults.length === 0) {
      const fallback = { weakPoints: [], strongPoints: state.currentNode?.knowledgePoints ?? [], suggestedFocus: [], profileUpdate: null, feedback: '已完成当前节点，未提供测验结果。' };
      await persistLearningEvaluation({
        userId: getUserId(config),
        sessionId: state.sessionId,
        topics: state.currentNode?.knowledgePoints ?? [],
        quizResults: [],
        evaluation: { ...fallback, overallScore: 100 },
      });
      write({ type: 'evaluation_result', evaluation: fallback, score: 100 });
      write({ type: 'phase_end', phase: 'evaluate' });
      return { evaluationResult: fallback, evaluationScore: 100, evaluationFeedback: null, phase: 'evaluate' };
    }

    const { evaluation, score, text } = await evaluateQuizResults(state.quizResults, state.profile, state.aiConfig);
    for (const chunk of text.match(/.{1,80}/g) ?? []) write({ type: 'text_delta', text: chunk });
    if (evaluation) {
      await persistLearningEvaluation({
        userId: getUserId(config),
        sessionId: state.sessionId,
        topics: state.currentNode?.knowledgePoints ?? [],
        quizResults: state.quizResults.map((result) => ({
          topic: result.knowledgePoints[0] ?? 'general',
          question: result.question,
          correct: result.correct,
          difficulty: result.difficulty,
          userAnswer: result.userAnswer,
          correctAnswer: result.correctAnswer,
        })),
        evaluation: { weakPoints: evaluation.weakPoints, strongPoints: evaluation.strongPoints, suggestedFocus: evaluation.suggestedFocus, overallScore: score, feedback: evaluation.feedback },
      });
      write({ type: 'evaluation_result', evaluation, score });
    }
    write({ type: 'phase_end', phase: 'evaluate' });
    return { evaluationResult: evaluation, evaluationScore: score, evaluationFeedback: evaluation ? { weakPoints: evaluation.weakPoints, strongPoints: evaluation.strongPoints, suggestedFocus: evaluation.suggestedFocus } : null, phase: 'evaluate' };
  } catch (error) {
    write({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    write({ type: 'phase_end', phase: 'evaluate' });
    return { phase: 'evaluate', evaluationFeedback: null };
  }
}
