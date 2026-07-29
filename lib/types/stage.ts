export type StageMode = 'edit' | 'playback' | 'present';

export interface Stage {
  id: string;
  title: string;
  description?: string;
  mode: StageMode;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  thumbnail?: string;
  whiteboard?: Array<{ elements: unknown[] }>;
}

export interface Scene {
  id: string;
  stageId: string;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  title: string;
  order: number;
  content: SceneContent;
  actions?: import('./action').Action[];
  createdAt: number;
  updatedAt: number;
}

export type SceneContent =
  | SlideSceneContent
  | QuizSceneContent
  | InteractiveSceneContent
  | PBLSceneContent;

export type { InteractiveSceneContent as InteractiveContent };
export type { PBLSceneContent as PBLContent };
export type { QuizSceneContent as QuizContent };

export interface SlideSceneContent {
  type: 'slide';
  canvas: import('./slides').Slide;
  codeButtons?: CodeButton[];
}

/** PPT slide 中嵌入的可运行代码按钮 */
export interface CodeButton {
  id: string;
  label: string;         // 如 "运行示例：快速排序"
  language: string;       // python / javascript 等
  code: string;           // 预生成的完整可运行代码
  stdin?: string;
}

export interface QuizSceneContent {
  type: 'quiz';
  questions: QuizQuestion[];
}

export interface InteractiveSceneContent {
  type: 'interactive';
  url: string;
  html?: string;
}

export interface PBLSceneContent {
  type: 'pbl';
  projectConfig: PBLProjectConfig;
}

export interface QuizQuestion {
  id: string;
  type: 'single-choice' | 'multiple-choice' | 'true-false' | 'fill-blank' | 'short-answer' | 'short_answer';
  question: string;
  options?: Array<{ value: string; label: string }>;
  answer?: string | string[];
  hasAnswer?: boolean;
  explanation?: string;
  points?: number;
}

export interface PBLProjectConfig {
  title: string;
  description: string;
  tasks: PBLTask[];
  resources?: string[];
  assessmentCriteria?: string[];
}

export interface PBLTask {
  id: string;
  title: string;
  description: string;
  type: 'research' | 'design' | 'implement' | 'present' | 'reflect';
  deliverable?: string;
}
