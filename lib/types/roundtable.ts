export const USER_AVATAR = '/avatars/user.png';

export interface RoundtableParticipant {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  color?: string;
  systemPrompt?: string;
}

export interface RoundtableConfig {
  topic: string;
  participants: RoundtableParticipant[];
  rounds: number;
  moderatorId?: string;
}
