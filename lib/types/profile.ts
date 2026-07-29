export interface KnowledgeBase {
  level: 'beginner' | 'intermediate' | 'advanced';
  subjects: { name: string; mastery: number }[];
}

export interface CognitiveStyle {
  type: 'visual' | 'auditory' | 'reading' | 'kinesthetic';
  preference: string;
}

export interface LearningGoals {
  shortTerm: string[];
  longTerm: string;
  targetExam?: string;
}

export interface WeakPoints {
  topics: string[];
  errorPatterns: string[];
}

export interface TimePreference {
  preferredDuration: number;
  preferredTimeSlot: string;
  frequency: 'daily' | 'weekly' | 'irregular';
}

export interface Interests {
  domains: string[];
  preferredFormats: ('document' | 'video' | 'code' | 'quiz' | 'mindmap')[];
}

export interface LearningPace {
  speed: 'slow' | 'moderate' | 'fast';
  depthPreference: string;
}

export interface ErrorPatterns {
  commonMistakes: string[];
  difficultAreas: string[];
}

export interface ProfileDimensions {
  knowledgeBase: KnowledgeBase;
  cognitiveStyle: CognitiveStyle;
  learningGoals: LearningGoals;
  weakPoints: WeakPoints;
  timePreference: TimePreference;
  interests: Interests;
  learningPace: LearningPace;
  errorPatterns: ErrorPatterns;
}

export interface LearningProfile {
  id: string;
  userId: string;
  version: number;
  dimensions: ProfileDimensions;
  updatedAt: string;
  conversationHistory: ConversationMessage[];
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const DEFAULT_DIMENSIONS: ProfileDimensions = {
  knowledgeBase: {
    level: 'beginner',
    subjects: [],
  },
  cognitiveStyle: {
    type: 'reading',
    preference: '',
  },
  learningGoals: {
    shortTerm: [],
    longTerm: '',
  },
  weakPoints: {
    topics: [],
    errorPatterns: [],
  },
  timePreference: {
    preferredDuration: 0,
    preferredTimeSlot: '',
    frequency: 'daily',
  },
  interests: {
    domains: [],
    preferredFormats: [],
  },
  learningPace: {
    speed: 'moderate',
    depthPreference: '',
  },
  errorPatterns: {
    commonMistakes: [],
    difficultAreas: [],
  },
};

export const PROFILE_DIMENSION_LABELS: Record<keyof ProfileDimensions, string> = {
  knowledgeBase: '知识基础',
  cognitiveStyle: '认知风格',
  learningGoals: '学习目标',
  weakPoints: '薄弱知识点',
  timePreference: '时间偏好',
  interests: '兴趣方向',
  learningPace: '学习节奏',
  errorPatterns: '易错点',
};
