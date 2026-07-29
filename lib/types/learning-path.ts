import type { ResourceReference } from './resource';

export type PathNodeStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface LearningPathNode {
  id: string;
  title: string;
  knowledgePoints: string[];
  resources: ResourceReference[];
  estimatedMinutes: number;
  prerequisites: string[];
  status: PathNodeStatus;
  quizId?: string;
}

export interface LearningPathEdge {
  from: string;
  to: string;
  condition?: string;
}

export type PathStatus = 'active' | 'completed' | 'archived';

export interface LearningPath {
  id: string;
  userId: string;
  goal: string;
  nodes: LearningPathNode[];
  edges: LearningPathEdge[];
  estimatedDays: number;
  status: PathStatus;
  createdAt: string;
  updatedAt: string;
}
