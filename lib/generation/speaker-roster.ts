/**
 * 课堂角色花名册 — 用于为 PPT 讲解台词分配不同角色
 * 灵感来自 OpenMAIC 的多角色互动课堂设计
 */

export interface ClassroomSpeaker {
  id: string;
  name: string;
  role: 'teacher' | 'assistant' | 'student';
  persona: string;
  avatar: string;
  color: string;
  /** 该角色在 voice pool 中的偏移 */
  voiceIndex: number;
}

/** 默认 4 人课堂 */
export const CLASSROOM_SPEAKERS: ClassroomSpeaker[] = [
  {
    id: 'teacher',
    name: '主讲老师',
    role: 'teacher',
    persona: '主导讲解，清晰有条理，用通俗语言解释概念',
    avatar: '👨‍🏫',
    color: '#3B82F6',
    voiceIndex: 0,
  },
  {
    id: 'assistant',
    name: 'AI助教',
    role: 'assistant',
    persona: '补充说明，举例类比，帮助理解难点',
    avatar: '🧑‍💻',
    color: '#10B981',
    voiceIndex: 1,
  },
  {
    id: 'student-curious',
    name: '好奇同学',
    role: 'student',
    persona: '积极提问，好奇心强，追问为什么和怎么做',
    avatar: '🙋',
    color: '#F59E0B',
    voiceIndex: 2,
  },
  {
    id: 'student-thinker',
    name: '思考者',
    role: 'student',
    persona: '深度思考，提出延伸问题，联系实际应用',
    avatar: '🤔',
    color: '#8B5CF6',
    voiceIndex: 3,
  },
];

/** 根据 id 查找角色 */
export function getSpeakerById(id: string): ClassroomSpeaker | undefined {
  return CLASSROOM_SPEAKERS.find((s) => s.id === id);
}
