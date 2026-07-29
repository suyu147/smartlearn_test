import type { LearnEvent } from '../types';
import type { LearningStateType } from '../state';

function getWriter(config: { configurable?: { writer?: (event: LearnEvent) => void } }) {
  return config.configurable?.writer ?? (() => undefined);
}

function inferCurrentStage(state: LearningStateType): 'overview' | 'concept' | 'practice' | 'review' {
  const title = `${state.currentNode?.title ?? ''} ${state.currentNode?.knowledgePoints.join(' ') ?? ''}`.toLowerCase();
  if (title.includes('练习') || title.includes('作业')) return 'practice';
  if (title.includes('复习') || title.includes('总结')) return 'review';
  if (state.completedNodes.length === 0) return 'overview';
  return 'concept';
}

export async function analyzeLearnerNode(
  state: LearningStateType,
  config: { configurable?: { writer?: (event: LearnEvent) => void } },
) {
  const write = getWriter(config);
  write({ type: 'phase_start', phase: 'analyze' });

  try {
    const learnerSnapshot = {
      preferredFormats: state.profile?.interests?.preferredFormats ?? [],
      weakTopics: state.profile?.weakPoints?.topics ?? [],
      recentQuizScores: state.resourceFeedback
        .map((item) => item.quizScore)
        .filter((score): score is number => typeof score === 'number')
        .slice(-3),
      engagedTypes: Array.from(new Set(state.resourceFeedback.flatMap((item) => [
        ...(item.acceptedTypes ?? []),
        ...(item.clickedTypes ?? []),
        ...(item.viewedTypes ?? []),
      ]))),
      timeBudget: state.profile?.timePreference?.preferredDuration
        ? `${state.profile.timePreference.preferredDuration}分钟`
        : null,
      currentStage: inferCurrentStage(state),
    };

    write({ type: 'phase_end', phase: 'analyze' });
    return { learnerSnapshot, phase: 'analyze' };
  } catch (error) {
    write({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    write({ type: 'phase_end', phase: 'analyze' });
    return { phase: 'analyze' };
  }
}
