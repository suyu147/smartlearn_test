export interface PBLRole {
  id: string;
  name: string;
  description: string;
  avatar?: string;
}

export interface PBLAgent {
  id: string;
  name: string;
  role: string;
  description: string;
  avatar?: string;
  systemPrompt?: string;
}

export interface PBLMessage {
  id: string;
  roleId: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system' | 'action';
}

export type PBLChatMessage = PBLMessage;

export interface PBLChat {
  messages: PBLMessage[];
  roles: PBLRole[];
  currentRoleId?: string;
}

export interface PBLIssue {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  updatedAt: number;
  comments?: PBLIssueComment[];
}

export interface PBLIssueComment {
  id: string;
  author: string;
  content: string;
  timestamp: number;
}

export interface PBLIssueboard {
  issues: PBLIssue[];
}

export interface PBLProjectInfo {
  title: string;
  description: string;
  objectives?: string[];
  duration?: string;
  teamSize?: number;
}

export interface PBLProjectConfig {
  title: string;
  description: string;
  tasks: import('@/lib/types/stage').PBLTask[];
  resources?: string[];
  assessmentCriteria?: string[];
  selectedRole?: string;
  issueboard?: PBLIssueboard;
  chat?: PBLChat;
  agents?: PBLAgent[];
  projectInfo?: PBLProjectInfo;
}
