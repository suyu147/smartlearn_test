import type { Scene } from '@/lib/types/stage';
import type { LearningPath, LearningPathNode } from '@/lib/types/learning-path';
import type { ProfileDimensions } from '@/lib/types/profile';
import type { Resource, ResourceType } from '@/lib/types/resource';
import type { PriorNodeFeedback, ResourceDecisionResultV2 } from '@/lib/generation/resource-decision';

export interface QuizResultPayload {
  questionId: string;
  question: string;
  knowledgePoints: string[];
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
  difficulty: number;
}

export interface EvaluationResultPayload {
  weakPoints: string[];
  strongPoints: string[];
  suggestedFocus: string[];
  profileUpdate: ProfileDimensions | null;
  feedback: string;
}

export interface LearnRequest {
  action: 'start' | 'node_complete' | 'quiz_result' | 'tutor_chat' | 'generate_resources';
  sessionId: string;
  profile: ProfileDimensions;
  goal: string;
  completedNodes: LearningPathNode[];
  currentNodeId: string | null;
  quizResults?: QuizResultPayload[];
  message?: string;
  conversationHistory?: { role: string; content: string; attachedResourceIds?: string[] }[];
  attachedResources?: { id: string; type: Resource['type']; title: string; content: string }[];
  currentNodeTitle?: string;
  aiConfig?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string };
  resourceFeedback?: PriorNodeFeedback[];
  nodeDecisionOverrides?: Record<string, ResourceType[]>;
}

export interface LearnerSnapshot {
  preferredFormats: string[];
  weakTopics: string[];
  recentQuizScores: number[];
  engagedTypes: ResourceType[];
  timeBudget: string | null;
  currentStage: 'overview' | 'concept' | 'practice' | 'review';
}

export type LearnEvent =
  | { type: 'phase_start'; phase: 'plan' | 'analyze' | 'resource_plan' | 'generate' | 'evaluate' | 'update_profile' | 'tutor' }
  | { type: 'phase_end'; phase: 'plan' | 'analyze' | 'resource_plan' | 'generate' | 'evaluate' | 'update_profile' | 'tutor' }
  | { type: 'text_delta'; text: string }
  | { type: 'node_ready'; node: LearningPathNode }
  | { type: 'resource_decision'; nodeId: string; decision: ResourceDecisionResultV2 }
  | { type: 'resource_delta'; resource: Resource }
  | { type: 'ppt_ready'; scenes: Scene[]; nodeId?: string; userId?: string; knowledgePoints?: string[] }
  | { type: 'evaluation_result'; evaluation: EvaluationResultPayload; score: number }
  | { type: 'profile_update'; dimensions: ProfileDimensions }
  | { type: 'path_update'; path: LearningPath }
  | { type: 'tutor_response'; text: string }
  | { type: 'agent_status'; agentId: string; agentName: string; status: 'running' | 'completed' | 'failed'; resourceType: ResourceType }
  | { type: 'error'; message: string }
  | { type: 'done' };
