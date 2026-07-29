import { Annotation } from '@langchain/langgraph';
import type { Scene } from '@/lib/types/stage';
import type { LearningPathNode } from '@/lib/types/learning-path';
import type { ProfileDimensions } from '@/lib/types/profile';
import type { Resource, ResourceType } from '@/lib/types/resource';
import type { PriorNodeFeedback, ResourceDecisionResultV2 } from '@/lib/generation/resource-decision';
import type { EvaluationResultPayload, LearnRequest, LearnerSnapshot, QuizResultPayload } from './types';

export const LearningState = Annotation.Root({
  action: Annotation<LearnRequest['action']>(),
  sessionId: Annotation<string>(),
  profile: Annotation<ProfileDimensions>(),
  goal: Annotation<string>(),
  completedNodes: Annotation<LearningPathNode[]>(),
  currentNodeId: Annotation<string | null>(),
  quizResults: Annotation<QuizResultPayload[]>(),
  message: Annotation<string>(),
  conversationHistory: Annotation<Array<{ role: string; content: string; attachedResourceIds?: string[] }>>(),
  attachedResources: Annotation<Array<{ id: string; type: Resource['type']; title: string; content: string }>>(),
  currentNodeTitle: Annotation<string | null>(),
  aiConfig: Annotation<NonNullable<LearnRequest['aiConfig']> | undefined>(),
  resourceFeedback: Annotation<PriorNodeFeedback[]>(),
  nodeDecisionOverrides: Annotation<Record<string, ResourceType[]>>(),
  currentNode: Annotation<LearningPathNode | null>(),
  learnerSnapshot: Annotation<LearnerSnapshot | null>(),
  resourcePlan: Annotation<ResourceDecisionResultV2 | null>(),
  generatedResources: Annotation<Resource[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),
  evaluationResult: Annotation<EvaluationResultPayload | null>(),
  evaluationScore: Annotation<number | null>(),
  evaluationFeedback: Annotation<{ weakPoints: string[]; strongPoints: string[]; suggestedFocus: string[] } | null>(),
  updatedProfile: Annotation<ProfileDimensions | null>(),
  pptScenes: Annotation<Scene[] | null>(),
  phase: Annotation<string>(),
});

export type LearningStateType = typeof LearningState.State;
