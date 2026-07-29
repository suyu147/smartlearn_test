import { create } from 'zustand';
import profileChatPrompt from '@/lib/prompts/profile-chat-prompt.json';
import resourcePrompts from '@/lib/prompts/resource-prompts.json';
import tutorChatPrompt from '@/lib/prompts/tutor-chat-prompt.json';
import evaluationPrompt from '@/lib/prompts/evaluation-prompt.json';

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelId?: string;
  color?: string;
  avatar?: string;
  tools?: string[];
  taskTypes?: string[];
  createdAt?: string;
  updatedAt?: string;
  isDefault?: boolean;
}

const defaultAgents: AgentConfig[] = [
  {
    id: 'profile',
    name: '画像Agent',
    description: '通过多轮对话构建学习画像',
    systemPrompt: profileChatPrompt.systemPrompt,
    taskTypes: ['profile_build'],
    isDefault: true,
  },
  {
    id: 'document',
    name: '文档Agent',
    description: '生成个性化讲解文档和拓展阅读',
    systemPrompt: resourcePrompts.document,
    taskTypes: ['resource_gen'],
    isDefault: true,
  },
  {
    id: 'quiz',
    name: '题库Agent',
    description: '生成不同类型和难度的练习题',
    systemPrompt: resourcePrompts.quiz,
    taskTypes: ['resource_gen'],
    isDefault: true,
  },
  {
    id: 'code',
    name: '代码Agent',
    description: '生成可运行的代码示例和实操案例',
    systemPrompt: resourcePrompts.code,
    taskTypes: ['resource_gen'],
    isDefault: true,
  },
  {
    id: 'tutor',
    name: '辅导Agent',
    description: '智能辅导，多模态答疑',
    systemPrompt: tutorChatPrompt.systemPrompt,
    taskTypes: ['tutor'],
    isDefault: true,
  },
  {
    id: 'evaluation',
    name: '评估Agent',
    description: '学习效果评估与画像更新',
    systemPrompt: evaluationPrompt.systemPrompt,
    taskTypes: ['evaluate'],
    isDefault: true,
  },
  {
    id: 'mindmap',
    name: '思维导图Agent',
    description: '生成知识点思维导图',
    systemPrompt: resourcePrompts.mindmap,
    taskTypes: ['resource_gen'],
    isDefault: true,
  },
  {
    id: 'video',
    name: '视频Agent',
    description: '搜索和推荐教学视频',
    systemPrompt: resourcePrompts.video,
    taskTypes: ['resource_gen'],
    isDefault: true,
  },
  {
    id: 'ppt',
    name: '课件Agent',
    description: '生成动态交互课件',
    systemPrompt: resourcePrompts.ppt,
    taskTypes: ['resource_gen'],
    isDefault: true,
  },
  {
    id: 'reading',
    name: '拓展阅读Agent',
    description: '策展拓展阅读材料',
    systemPrompt: resourcePrompts.reading,
    taskTypes: ['resource_gen'],
    isDefault: true,
  },
];

interface AgentRegistryState {
  agents: AgentConfig[];
  registerAgent: (agent: AgentConfig) => void;
  unregisterAgent: (id: string) => void;
  getAgent: (id: string) => AgentConfig | undefined;
  getAllAgents: () => AgentConfig[];
}

export const useAgentRegistry = create<AgentRegistryState>()((set, get) => ({
  agents: defaultAgents,
  registerAgent: (agent) =>
    set((state) => ({
      agents: [...state.agents.filter((a) => a.id !== agent.id), agent],
    })),
  unregisterAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
    })),
  getAgent: (id) => get().agents.find((a) => a.id === id),
  getAllAgents: () => get().agents,
}));
