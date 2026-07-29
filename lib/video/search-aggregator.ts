import type { VideoSearchResult, VideoSource } from '@/lib/types/resource';
import { defaultVideoSearchConfig, type VideoSearchConfig } from '@/lib/video/config';
import { searchBilibiliVideosSafe, type BilibiliSearchOptions } from '@/lib/video/bilibili-search';
import { searchLocalVideos } from '@/lib/video/local-search';

function deduplicateAndSort(videos: VideoSource[], maxTotalResults: number): VideoSource[] {
  const deduplicated = new Map<string, VideoSource>();

  for (const video of videos) {
    const key = video.url;
    const existing = deduplicated.get(key);
    if (!existing || (video.relevanceScore ?? 0) > (existing.relevanceScore ?? 0)) {
      deduplicated.set(key, video);
    }
  }

  return Array.from(deduplicated.values())
    .sort((left, right) => {
      const relevanceDelta = (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0);
      if (relevanceDelta !== 0) return relevanceDelta;
      return (right.viewCount ?? 0) - (left.viewCount ?? 0);
    })
    .slice(0, maxTotalResults);
}

export async function searchVideos(
  knowledgePoints: string[],
  config: Partial<VideoSearchConfig & { bilibiliOptions?: BilibiliSearchOptions }> = {},
): Promise<VideoSearchResult> {
  const mergedConfig = {
    ...defaultVideoSearchConfig,
    ...config,
    local: { ...defaultVideoSearchConfig.local, ...config.local },
    bilibili: { ...defaultVideoSearchConfig.bilibili, ...config.bilibili },
  };

  const query = knowledgePoints.join(' ');
  const searchTasks: Array<Promise<VideoSource[]>> = [];
  const searchSources: string[] = [];

  if (mergedConfig.local.enabled) {
    searchTasks.push(
      searchLocalVideos(knowledgePoints, {
        maxResults: mergedConfig.local.maxResults,
      }),
    );
    searchSources.push('local');
  }

  if (mergedConfig.bilibili.enabled) {
    searchTasks.push(
      searchBilibiliVideosSafe(query, {
        maxResults: mergedConfig.bilibili.maxResults,
        order: mergedConfig.bilibili.defaultOrder,
        ...config.bilibiliOptions,
      }),
    );
    searchSources.push('bilibili');
  }

  const settledResults = await Promise.allSettled(searchTasks);
  const allVideos = settledResults
    .filter((result): result is PromiseFulfilledResult<VideoSource[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  return {
    format: 'video_search_v1',
    query,
    knowledgePoints,
    videos: deduplicateAndSort(allVideos, mergedConfig.maxTotalResults),
    totalFound: allVideos.length,
    searchSources,
  };
}
