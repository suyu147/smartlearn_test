import type { UIMessage as AIUIMessage } from 'ai';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  parts: AIUIMessage['parts'];
  agentId?: string;
  agentName?: string;
  timestamp?: number;
  metadata?: ChatMessageMetadata;
}

export interface DirectorState {
  currentAgentId: string | null;
  phase: 'idle' | 'thinking' | 'speaking' | 'acting' | 'done';
  turnCount?: number;
  agentResponses?: import('@/lib/orchestration/director-prompt').AgentTurnSummary[] | Record<string, string>;
  whiteboardLedger?: WhiteboardActionRecord[];
}

export interface WhiteboardActionRecord {
  actionType: string;
  actionName?: string;
  elementId?: string;
  description: string;
  agentId: string;
  agentName?: string;
  params?: Record<string, unknown>;
  timestamp: number;
}

export type SessionType = 'chat' | 'pbl' | 'roundtable' | 'tutor' | 'profile' | 'path' | 'lecture' | 'qa' | 'discussion';

export type SessionStatus = 'active' | 'archived' | 'deleted' | 'completed';

export interface ChatMessageMetadata {
  agentId?: string;
  agentName?: string;
  senderName?: string;
  senderAvatar?: string;
  agentAvatar?: string;
  agentColor?: string;
  originalRole?: 'user' | 'agent' | 'system' | 'teacher';
  thinkingContent?: string;
  actions?: unknown[];
  createdAt?: number;
  interrupted?: boolean;
  [key: string]: unknown;
}

export interface ChatSession {
  id: string;
  title: string;
  type: SessionType;
  status: SessionStatus;
  messages: ChatMessage[];
  config?: {
    agentIds: string[];
    maxTurns: number;
    currentTurn: number;
    defaultAgentId?: string;
    triggerAgentId?: string;
    agentConfigs?: Array<{ id: string; name: string; description: string; systemPrompt: string }>;
    discussionTopic?: string;
    discussionPrompt?: string;
    [key: string]: unknown;
  };
  toolCalls?: unknown[];
  pendingToolCalls?: unknown[];
  sceneId?: string;
  lastActionIndex?: number;
  createdAt: string | number;
  updatedAt: string | number;
  metadata?: Record<string, unknown>;
}

export interface StatelessChatRequest {
  messages: AIUIMessage[];
  storeState: Record<string, unknown>;
  config: {
    agentIds: string[];
    sessionType?: string;
    agentConfigs?: Array<{ id: string; name: string; description: string; systemPrompt: string }>;
    discussionTopic?: string;
    discussionPrompt?: string;
    triggerAgentId?: string;
  };
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  providerType?: 'openai' | 'anthropic' | 'google';
  requiresApiKey?: boolean;
  directorState?: DirectorState;
  userProfile?: string;
}

export interface StatelessEvent {
  type:
    | 'text-delta'
    | 'text_delta'
    | 'tool-call'
    | 'tool-result'
    | 'agent-switch'
    | 'agent_start'
    | 'agent_end'
    | 'action'
    | 'thinking'
    | 'cue_user'
    | 'error'
    | 'done';
  data: unknown;
  actionName?: string;
  agentId?: string;
  content?: string;
  actionId?: string;
  params?: Record<string, unknown>;
}
