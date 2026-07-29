export type ResourceType = 'document' | 'mindmap' | 'quiz' | 'video' | 'code' | 'reading' | 'ppt';

export const ALL_RESOURCE_TYPES: ResourceType[] = ['document', 'mindmap', 'quiz', 'video', 'code', 'reading', 'ppt'];

export type ResourceStatus = 'generating' | 'ready' | 'failed';

export interface VideoSource {
  id: string;
  title: string;
  description: string;
  url: string;
  embedUrl?: string;
  coverImageUrl: string;
  duration?: string;
  author?: string;
  authorAvatar?: string;
  viewCount?: number;
  platform: 'bilibili' | 'youtube' | 'local' | 'other';
  publishedAt?: string;
  relevanceScore?: number;
  matchedKeywords?: string[];
  tags?: string[];
}

export interface VideoSearchResult {
  format: 'video_search_v1';
  query: string;
  knowledgePoints: string[];
  videos: VideoSource[];
  totalFound: number;
  searchSources: string[];
}

export interface DocumentSectionOutline {
  id: string;
  title: string;
  estimatedLength: 'short' | 'medium' | 'long';
  elements: Array<'text' | 'code' | 'callout' | 'table'>;
  summary: string;
}

export interface DocumentSectionBlock {
  type: 'text' | 'code' | 'callout' | 'table';
  title?: string;
  content?: string;
  language?: string;
  headers?: string[];
  rows?: string[][];
  tone?: 'info' | 'warning' | 'success';
}

export interface StructuredDocumentSection {
  id: string;
  title: string;
  blocks: DocumentSectionBlock[];
}

export interface StructuredDocument {
  format: 'structured_document_v1';
  introduction?: string;
  outline: DocumentSectionOutline[];
  sections: StructuredDocumentSection[];
  summary?: string;
}

export interface ReadingCard {
  id: string;
  title: string;
  description: string;
  reason: string;
  coverPlaceholder: string;
  suggestedUse?: string;
}

export interface ReadingLink {
  title: string;
  url: string;
  note?: string;
}

export interface StructuredReading {
  format: 'structured_reading_v1';
  intro?: string;
  cards: ReadingCard[];
  externalLinks: ReadingLink[];
}

export interface Resource {
  id: string;
  userId: string;
  type: ResourceType;
  title: string;
  content: string;
  metadata?: {
    difficulty?: number;
    knowledgePoints?: string[];
    duration?: number;
    language?: string;
    profileUsed?: boolean;
    error?: boolean;
    videoData?: VideoSearchResult;
    pptData?: import('@/lib/types/stage').Scene[];
    structuredDocument?: StructuredDocument;
    structuredReading?: StructuredReading;
  };
  sourceAgent: string;
  status: ResourceStatus;
  createdAt: string;
}

export interface Quiz {
  id: string;
  type: 'choice' | 'fill' | 'short_answer' | 'coding' | 'case_analysis';
  difficulty: 1 | 2 | 3 | 4 | 5;
  knowledgePoints: string[];
  question: string;
  options?: string[];
  answer: string | string[];
  explanation: string;
  hints: string[];
  autoGradable: boolean;
}

export interface ResourceReference {
  resourceId: string;
  type: ResourceType;
  title: string;
}

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  document: '讲解文档',
  mindmap: '思维导图',
  quiz: '练习题目',
  video: '教学视频',
  code: '代码案例',
  reading: '拓展阅读',
  ppt: '动态课件',
};

export const RESOURCE_TYPE_ICONS: Record<ResourceType, string> = {
  document: 'FileText',
  mindmap: 'GitBranch',
  quiz: 'CheckSquare',
  video: 'Play',
  code: 'Code',
  reading: 'BookOpen',
  ppt: 'Presentation',
};
