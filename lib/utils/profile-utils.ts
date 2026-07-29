import type { ProfileDimensions } from '@/lib/types/profile';

const TOTAL_DIMENSIONS = 8;

function getFilledDimensionsCount(dimensions: ProfileDimensions | null | undefined): number {
  if (!dimensions) return 0;

  let filledCount = 0;

  if (dimensions.knowledgeBase?.subjects?.length > 0) filledCount++;
  // Count if the user has expressed any learning style preference (default '' means not yet filled)
  if (dimensions.cognitiveStyle?.preference && dimensions.cognitiveStyle.preference.length > 0) filledCount++;
  if (dimensions.learningGoals?.shortTerm?.length > 0 || !!dimensions.learningGoals?.longTerm) filledCount++;
  if (dimensions.weakPoints?.topics?.length > 0 || dimensions.weakPoints?.errorPatterns?.length > 0) filledCount++;
  // Default preferredDuration=0 and preferredTimeSlot='' mean not yet set by user/AI
  if ((dimensions.timePreference?.preferredDuration ?? 0) > 0 || (dimensions.timePreference?.preferredTimeSlot?.length ?? 0) > 0) filledCount++;
  if (dimensions.interests?.domains?.length > 0) filledCount++;
  // Default depthPreference='' means not yet set; any non-empty value counts as filled
  if (dimensions.learningPace?.depthPreference && dimensions.learningPace.depthPreference.length > 0) filledCount++;
  if (dimensions.errorPatterns?.commonMistakes?.length > 0 || dimensions.errorPatterns?.difficultAreas?.length > 0) filledCount++;

  return filledCount;
}

export function isProfileComplete(dimensions: ProfileDimensions | null | undefined): boolean {
  return getFilledDimensionsCount(dimensions) >= TOTAL_DIMENSIONS;
}

export function calculateProfileCompleteness(dimensions: ProfileDimensions | null | undefined): number {
  return Math.round((getFilledDimensionsCount(dimensions) / TOTAL_DIMENSIONS) * 100);
}

export function calculateDimensionScores(dimensions: ProfileDimensions): Record<keyof ProfileDimensions, number> {
  return {
    knowledgeBase: Math.min(100, (dimensions.knowledgeBase.subjects.length > 0 ? 60 : 0) + dimensions.knowledgeBase.subjects.reduce((acc, s) => acc + (s.mastery > 0 ? 10 : 0), 0)),
    cognitiveStyle: dimensions.cognitiveStyle.preference ? 100 : (dimensions.cognitiveStyle.type !== 'reading' ? 70 : 30),
    learningGoals: (dimensions.learningGoals.shortTerm.length > 0 ? 50 : 0) + (dimensions.learningGoals.longTerm ? 50 : 0),
    weakPoints: (dimensions.weakPoints.topics.length > 0 ? 60 : 0) + (dimensions.weakPoints.errorPatterns.length > 0 ? 40 : 0),
    timePreference: (dimensions.timePreference.preferredDuration > 0 ? 70 : 0) + (dimensions.timePreference.preferredTimeSlot ? 30 : 0),
    interests: (dimensions.interests.domains.length > 0 ? 50 : 0) + (dimensions.interests.preferredFormats.length > 1 ? 50 : 0),
    learningPace: dimensions.learningPace.speed !== 'moderate' ? 100 : 50,
    errorPatterns: (dimensions.errorPatterns.commonMistakes.length > 0 ? 60 : 0) + (dimensions.errorPatterns.difficultAreas.length > 0 ? 40 : 0),
  };
}
