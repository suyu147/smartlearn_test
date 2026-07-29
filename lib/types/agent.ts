import type { LearningProfile } from './profile';
import type { Resource } from './resource';
import type { LearningPath } from './learning-path';

export type AgentTaskType = 'profile_build' | 'resource_gen' | 'tutor' | 'evaluate';

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  color?: string;
}

export interface AgentState {
  userId: string;
  profile: LearningProfile | null;
  currentTask: AgentTaskType;
  messages: AgentMessage[];
  generatedResources: Resource[];
  learningPath: LearningPath | null;
  activeAgents: string[];
  errors: string[];
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  timestamp: number;
}

export const AGENTS: Record<string, AgentInfo> = {
  orchestrator: {
    id: 'orchestrator',
    name: '编排器',
    description: '全局调度，协调各Agent协作',
    color: '#6366f1',
  },
  profile: {
    id: 'profile',
    name: '画像Agent',
    description: '通过多轮对话构建学习画像',
    color: '#8b5cf6',
  },
  document: {
    id: 'document',
    name: '文档Agent',
    description: '生成个性化讲解文档和拓展阅读',
    color: '#06b6d4',
  },
  quiz: {
    id: 'quiz',
    name: '题库Agent',
    description: '生成不同类型和难度的练习题',
    color: '#f59e0b',
  },
  multimodal: {
    id: 'multimodal',
    name: '多模态Agent',
    description: '生成思维导图、视频等多模态资源',
    color: '#ec4899',
  },
  code: {
    id: 'code',
    name: '代码Agent',
    description: '生成可运行的代码示例和实操案例',
    color: '#10b981',
  },
  tutor: {
    id: 'tutor',
    name: '辅导Agent',
    description: '智能辅导，多模态答疑',
    color: '#14b8a6',
  },
  evaluation: {
    id: 'evaluation',
    name: '评估Agent',
    description: '学习效果评估与画像更新',
    color: '#64748b',
  },
};
