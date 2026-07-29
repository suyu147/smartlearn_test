export interface UserRequirements {
  requirement: string;
  language: string;
  userNickname?: string;
  userBio?: string;
}

export interface SceneOutline {
  id: string;
  title: string;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  order: number;
  language?: string;
  description?: string;
  duration?: number;
  keyPoints?: string[];
  quizConfig?: QuizConfig;
  interactiveConfig?: InteractiveConfig;
  pblConfig?: PBLConfig;
  mediaGenerations?: MediaGeneration[];
  [key: string]: unknown;
}

export interface QuizConfig {
  questionCount: number;
  difficulty: string;
  questionTypes: string[];
}

export interface InteractiveConfig {
  template: string;
  props?: Record<string, unknown>;
  subject?: string;
  conceptName?: string;
  conceptOverview?: string;
  designIdea?: string;
  [key: string]: unknown;
}

export interface PBLConfig {
  projectTitle: string;
  projectDescription: string;
  projectTopic?: string;
  targetSkills?: string[];
  issueCount?: number;
  language?: string;
  [key: string]: unknown;
}

export interface MediaGeneration {
  elementId: string;
  type: 'image' | 'video';
  prompt: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
}

export interface PdfImage {
  id: string;
  page: number;
  width: number;
  height: number;
  src?: string;
}

export interface ImageMapping {
  [imageId: string]: string;
}

export interface GenerationProgress {
  currentStage: number;
  overallProgress: number;
  stageProgress: number;
  statusMessage: string;
  scenesGenerated: number;
  totalScenes: number;
}

export interface GeneratedSlideContent {
  elements: Array<{
    type: string;
    left: number;
    top: number;
    width: number;
    height: number;
    id: string;
    rotate?: number;
    lock?: boolean;
    [key: string]: unknown;
  }>;
  background?: import('./slides').SlideBackground;
  remark?: string;
}

export interface GeneratedQuizContent {
  questions: import('./stage').QuizQuestion[];
}

export interface GeneratedInteractiveContent {
  html: string;
  scientificModel?: ScientificModel;
}

export interface GeneratedPBLContent {
  projectConfig: import('./stage').PBLProjectConfig;
  agents: unknown[];
  issueboard: { issues: unknown[] };
}

export interface ScientificModel {
  id: string;
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
  core_formulas?: string[];
  constraints?: string[];
  mechanism?: string[];
  forbidden_errors?: string[];
}
