import type { VideoSource } from '@/lib/types/resource';

export interface LocalVideoRecord {
  id: string;
  title: string;
  description: string;
  filePath: string;
  coverImagePath?: string;
  duration?: number;
  tags: string[];
  knowledgePoints: string[];
  embedding?: number[];
}

export async function searchLocalVideos(
  _knowledgePoints: string[],
  _options?: { maxResults?: number; minRelevance?: number },
): Promise<VideoSource[]> {
  return [];
}
