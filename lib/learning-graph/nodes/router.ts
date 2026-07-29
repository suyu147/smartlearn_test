import type { LearningStateType } from '../state';

export function routeByAction(state: LearningStateType) {
  switch (state.action) {
    case 'start':
      return 'plan_node';
    case 'generate_resources':
      // Skip plan_node — go directly to analyze_learner for an existing node
      return 'analyze_learner';
    case 'node_complete':
    case 'quiz_result':
      return 'evaluate';
    case 'tutor_chat':
      return 'tutor_respond';
    default:
      return '__end__';
  }
}
