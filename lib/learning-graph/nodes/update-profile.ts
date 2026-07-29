import type { LearnEvent } from '../types';
import type { LearningStateType } from '../state';

function getWriter(config: { configurable?: { writer?: (event: LearnEvent) => void } }) {
  return config.configurable?.writer ?? (() => undefined);
}

export async function updateProfileNode(
  state: LearningStateType,
  config: { configurable?: { writer?: (event: LearnEvent) => void } },
) {
  const write = getWriter(config);
  write({ type: 'phase_start', phase: 'update_profile' });

  try {
    const nextProfile = state.evaluationResult?.profileUpdate ?? state.profile;
    write({ type: 'profile_update', dimensions: nextProfile });
    write({ type: 'phase_end', phase: 'update_profile' });
    return { updatedProfile: nextProfile, profile: nextProfile, phase: 'update_profile' };
  } catch (error) {
    write({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    write({ type: 'phase_end', phase: 'update_profile' });
    return { phase: 'update_profile' };
  }
}
