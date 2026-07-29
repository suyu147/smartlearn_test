import type { LearnEvent } from '../types';
import type { LearningStateType } from '../state';
import { streamTutorResponse, streamProfileBuildResponse, extractProfileDimensions } from '../helpers/tutor';
import { DEFAULT_DIMENSIONS } from '@/lib/types/profile';
import type { ProfileDimensions } from '@/lib/types/profile';
import { addMessage } from '@/lib/deeptutor/services/session';
import { getLearnerProfileService } from '@/lib/deeptutor/services/learner-profile';
import { createLogger } from '@/lib/logger';

const log = createLogger('TutorRespondNode');
const learnerProfileService = getLearnerProfileService();

function getWriter(config: { configurable?: { writer?: (event: LearnEvent) => void } }) {
  return config.configurable?.writer ?? (() => undefined);
}

function getUserId(config: { configurable?: { userId?: string } }): string {
  return config.configurable?.userId ?? 'anonymous';
}

/**
 * 安全合并：只应用 partial 中的有效数据，跳过空数组/空字符串以防止覆盖已有数据。
 * 当 partial 中的数组为空、字符串为空时，保留 current 中的对应值。
 */
function safeMergeField<T extends Record<string, unknown>>(
  current: T,
  partial: Partial<T> | undefined,
  arrayKeys: (keyof T)[],
): T {
  if (!partial) return current;
  const merged = { ...current, ...partial };
  for (const key of arrayKeys) {
    const pv = partial[key];
    if (Array.isArray(pv) && pv.length === 0) {
      // 空数组不回写，保留 current 原有数据
      merged[key] = current[key];
    }
  }
  return merged;
}

/** 判断标量值是否有效（非空字符串、非零数字） */
function hasValidValue(v: unknown): boolean {
  if (typeof v === 'string') return v.length > 0;
  if (typeof v === 'number') return v > 0;
  if (Array.isArray(v)) return v.length > 0;
  return v != null;
}

function mergeProfileDimensions(
  current: ProfileDimensions,
  partial: Partial<ProfileDimensions>,
): ProfileDimensions {
  return {
    ...DEFAULT_DIMENSIONS,
    ...current,
    ...partial,
    knowledgeBase: safeMergeField(
      { ...DEFAULT_DIMENSIONS.knowledgeBase, ...current.knowledgeBase },
      partial.knowledgeBase,
      ['subjects'],
    ),
    cognitiveStyle: {
      ...DEFAULT_DIMENSIONS.cognitiveStyle,
      ...current.cognitiveStyle,
      ...partial.cognitiveStyle,
      // 空字符串不回写 preference
      preference: partial.cognitiveStyle?.preference && partial.cognitiveStyle.preference.length > 0
        ? partial.cognitiveStyle.preference
        : (current.cognitiveStyle?.preference ?? DEFAULT_DIMENSIONS.cognitiveStyle.preference),
    },
    learningGoals: {
      ...DEFAULT_DIMENSIONS.learningGoals,
      ...current.learningGoals,
      ...partial.learningGoals,
      shortTerm: (partial.learningGoals?.shortTerm && partial.learningGoals.shortTerm.length > 0)
        ? partial.learningGoals.shortTerm
        : (current.learningGoals?.shortTerm ?? DEFAULT_DIMENSIONS.learningGoals.shortTerm),
      longTerm: (partial.learningGoals?.longTerm && partial.learningGoals.longTerm.length > 0)
        ? partial.learningGoals.longTerm
        : (current.learningGoals?.longTerm ?? DEFAULT_DIMENSIONS.learningGoals.longTerm),
    },
    weakPoints: safeMergeField(
      { ...DEFAULT_DIMENSIONS.weakPoints, ...current.weakPoints },
      partial.weakPoints,
      ['topics', 'errorPatterns'],
    ),
    timePreference: {
      ...DEFAULT_DIMENSIONS.timePreference,
      ...current.timePreference,
      ...partial.timePreference,
      preferredDuration: hasValidValue(partial.timePreference?.preferredDuration)
        ? partial.timePreference!.preferredDuration
        : (current.timePreference?.preferredDuration ?? DEFAULT_DIMENSIONS.timePreference.preferredDuration),
      preferredTimeSlot: (partial.timePreference?.preferredTimeSlot && partial.timePreference.preferredTimeSlot.length > 0)
        ? partial.timePreference.preferredTimeSlot
        : (current.timePreference?.preferredTimeSlot ?? DEFAULT_DIMENSIONS.timePreference.preferredTimeSlot),
    },
    interests: safeMergeField(
      { ...DEFAULT_DIMENSIONS.interests, ...current.interests },
      partial.interests,
      ['domains', 'preferredFormats'],
    ),
    learningPace: {
      ...DEFAULT_DIMENSIONS.learningPace,
      ...current.learningPace,
      ...partial.learningPace,
      depthPreference: (partial.learningPace?.depthPreference && partial.learningPace.depthPreference.length > 0)
        ? partial.learningPace.depthPreference
        : (current.learningPace?.depthPreference ?? DEFAULT_DIMENSIONS.learningPace.depthPreference),
    },
    errorPatterns: safeMergeField(
      { ...DEFAULT_DIMENSIONS.errorPatterns, ...current.errorPatterns },
      partial.errorPatterns,
      ['commonMistakes', 'difficultAreas'],
    ),
  };
}


function getSessionId(
  config: { configurable?: { sessionId?: string } },
  state: LearningStateType,
): string | undefined {
  return config.configurable?.sessionId ?? state.sessionId;
}

function isProfileChat(
  config: { configurable?: { profileChat?: boolean; sessionId?: string } },
  sessionId: string | undefined,
): boolean {
  return config.configurable?.profileChat === true || (typeof sessionId === 'string' && sessionId.startsWith('profile-'));
}

export async function tutorRespondNode(
  state: LearningStateType,
  config: { configurable?: { writer?: (event: LearnEvent) => void; userId?: string; sessionId?: string; profileChat?: boolean } },
) {
  const write = getWriter(config);
  const userId = getUserId(config);
  const persistedSessionId = getSessionId(config, state);
  const profileChat = isProfileChat(config, persistedSessionId);

  write({ type: 'phase_start', phase: 'tutor' });

  try {
    // Collect streamed text for profile extraction
    let fullText = '';

    if (profileChat) {
      // Profile-building conversation: use specialized prompt
      const currentProfileDims = (state.profile as ProfileDimensions | undefined) ?? DEFAULT_DIMENSIONS;
      const result = streamProfileBuildResponse(
        state.message,
        state.conversationHistory,
        currentProfileDims,
        state.aiConfig,
      );
      for await (const chunk of result.textStream) {
        fullText += chunk;
        write({ type: 'tutor_response', text: chunk });
      }
    } else {
      // Regular tutor chat: use general tutor prompt
      const result = streamTutorResponse(
        state.message,
        state.conversationHistory,
        state.attachedResources,
        state.currentNodeTitle ?? state.currentNode?.title,
        state.aiConfig,
      );
      for await (const chunk of result.textStream) {
        fullText += chunk;
        write({ type: 'tutor_response', text: chunk });
      }
    }

    write({ type: 'phase_end', phase: 'tutor' });

    // After streaming, extract profile dimensions for profile chats
    if (profileChat && fullText) {
      try {
        write({ type: 'phase_start', phase: 'update_profile' });

        // Build updated conversation including the latest exchange
        const updatedHistory = [
          ...(state.conversationHistory ?? []),
          { role: 'user', content: state.message },
          { role: 'assistant', content: fullText },
        ];

        const currentDimensions = state.profile ?? DEFAULT_DIMENSIONS;
        const extracted = await extractProfileDimensions(updatedHistory, currentDimensions, state.aiConfig);

        if (extracted && Object.keys(extracted).length > 0) {
          const mergedDimensions = mergeProfileDimensions(currentDimensions, extracted);
          write({ type: 'profile_update', dimensions: mergedDimensions });
          log.info(`Profile dimensions extracted and emitted (${Object.keys(extracted).length} fields updated)`);

          await learnerProfileService.updateProfileDimensions(userId, mergedDimensions, 'profile_chat');
          await learnerProfileService.markProfileCompleted(userId, 'profile_chat');
        }

        if (persistedSessionId) {
          await addMessage(persistedSessionId, userId, 'assistant', fullText, {
            capability: 'profile_build',
            metadata: { source: 'profile-chat', profileUpdate: true },
          });
        }

        write({ type: 'phase_end', phase: 'update_profile' });
      } catch (extractError) {
        log.warn('Profile extraction failed, continuing without update:', extractError);
        write({ type: 'phase_end', phase: 'update_profile' });
      }
    }

    return { phase: 'tutor' };
  } catch (error) {
    write({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    write({ type: 'phase_end', phase: 'tutor' });
    return { phase: 'tutor' };
  }
}

