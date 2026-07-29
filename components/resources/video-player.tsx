'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Clock, ExternalLink, Eye, Play, Search, User } from 'lucide-react';
import type { VideoSearchResult, VideoSource } from '@/lib/types/resource';

function parseVideoData(content: string, videoData?: VideoSearchResult): VideoSearchResult {
  if (videoData) {
    return videoData;
  }

  try {
    const parsed = JSON.parse(content) as VideoSearchResult;
    if (parsed?.format === 'video_search_v1' && Array.isArray(parsed.videos)) {
      return parsed;
    }
  } catch {
  }

  return {
    format: 'video_search_v1',
    query: '',
    knowledgePoints: [],
    videos: [],
    totalFound: 0,
    searchSources: [],
  };
}

function platformLabel(platform: VideoSource['platform']): string {
  switch (platform) {
    case 'bilibili':
      return 'B站';
    case 'youtube':
      return 'YouTube';
    case 'local':
      return '本地知识库';
    default:
      return '其他';
  }
}

function formatSearchSource(source: string): string {
  switch (source) {
    case 'bilibili':
      return 'B站';
    case 'local':
      return '本地知识库';
    default:
      return source;
  }
}

function formatRelevance(score?: number): string | null {
  if (typeof score !== 'number') return null;
  return `${Math.round(score * 100)}% 匹配`;
}

export function VideoPlayer({
  content,
  title,
  videoData,
}: {
  content: string;
  title: string;
  videoData?: VideoSearchResult;
}) {
  const [selectedVideo, setSelectedVideo] = useState<VideoSource | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);

  const parsed = useMemo(() => parseVideoData(content, videoData), [content, videoData]);

  const handlePlay = (video: VideoSource) => {
    setSelectedVideo(video);
    setPlayerOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Play className="h-4 w-4" />
          {title}
          <Badge variant="secondary">{parsed.videos.length} 个视频</Badge>
          {parsed.query && <Badge variant="outline">{parsed.query}</Badge>}
        </CardTitle>
        {parsed.searchSources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {parsed.searchSources.map((source) => (
              <Badge key={source} variant="outline" className="gap-1 text-xs">
                <Search className="h-3 w-3" />
                {formatSearchSource(source)}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {parsed.videos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            暂未检索到可用视频结果
          </div>
        ) : (
          parsed.videos.map((video) => (
            <VideoCard key={video.id} video={video} onPlay={() => handlePlay(video)} />
          ))
        )}
      </CardContent>

      <Dialog open={playerOpen} onOpenChange={setPlayerOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedVideo?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="aspect-video w-full overflow-hidden rounded-lg border bg-muted">
              {selectedVideo?.embedUrl ? (
                <iframe
                  src={selectedVideo.embedUrl}
                  title={selectedVideo.title}
                  className="h-full w-full"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-muted-foreground">该视频暂不支持内嵌播放</p>
                  {selectedVideo?.url && (
                    <Button asChild variant="outline">
                      <a href={selectedVideo.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1 h-4 w-4" />
                        在网站中打开
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
            {selectedVideo?.description && (
              <p className="text-sm text-muted-foreground">{selectedVideo.description}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function VideoCard({ video, onPlay }: { video: VideoSource; onPlay: () => void }) {
  const relevance = formatRelevance(video.relevanceScore);

  return (
    <button
      type="button"
      className="flex w-full gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
      onClick={onPlay}
    >
      <div className="relative h-24 w-40 flex-shrink-0 overflow-hidden rounded bg-muted">
        {video.coverImageUrl ? (
          <img src={video.coverImageUrl} alt={video.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Play className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}
        {video.duration && (
          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-xs text-white">
            {video.duration}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <h4 className="line-clamp-2 flex-1 text-sm font-medium">{video.title}</h4>
          <Badge variant="outline" className="text-xs">
            {platformLabel(video.platform)}
          </Badge>
          {relevance && <Badge variant="secondary" className="text-xs">{relevance}</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {video.author && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {video.author}
            </span>
          )}
          {video.viewCount !== undefined && (
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {video.viewCount.toLocaleString()}
            </span>
          )}
          {video.duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {video.duration}
            </span>
          )}
        </div>

        {video.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{video.description}</p>
        )}

        {video.matchedKeywords && video.matchedKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {video.matchedKeywords.map((keyword) => (
              <Badge key={keyword} variant="secondary" className="text-xs">
                {keyword}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
