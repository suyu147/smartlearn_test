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

export interface AgentTurnSummary {
  agentId: string;
  agentName: string;
  action?: string;
  content?: string;
  contentPreview?: string;
  actionCount?: number;
  whiteboardActions?: WhiteboardActionRecord[];
  timestamp?: number;
}

export interface DirectorDecision {
  nextAction: 'speak' | 'act' | 'cue_user' | 'end';
  agentId: string;
  nextAgentId?: string;
  shouldEnd?: boolean;
  reasoning?: string;
  actions?: Array<Record<string, unknown>>;
  content?: string;
}

export function buildDirectorPrompt(
  _agents?: unknown,
  _conversationSummary?: string,
  _agentResponses?: AgentTurnSummary[] | Record<string, string>,
  _turnCount?: number,
  _discussionContext?: unknown,
  _triggerAgentId?: string | null,
  _whiteboardLedger?: WhiteboardActionRecord[],
  _userProfile?: string | { nickname?: string; bio?: string } | null | undefined,
  _whiteboardOpen?: boolean | unknown,
): string {
  return '';
}

export function parseDirectorDecision(
  _response: string,
): DirectorDecision {
  return {
    nextAction: 'cue_user',
    agentId: '',
    nextAgentId: undefined,
    shouldEnd: false,
  };
}
