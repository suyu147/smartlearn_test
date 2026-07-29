export interface DiscussionRequest {
  topic: string;
  prompt?: string;
  agentId?: string;
  participants: Array<{
    id: string;
    name: string;
    role: string;
  }>;
  rounds?: number;
}
