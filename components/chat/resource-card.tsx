'use client';

import { cn } from '@/lib/utils';
import { BookOpen, Code, FileText, Headphones, Lightbulb, Video, ExternalLink } from 'lucide-react';

export type ResourceType = 'document' | 'code' | 'video' | 'exercise' | 'article' | 'audio';

interface ResourceCardProps {
  title: string;
  type: ResourceType;
  description?: string;
  url?: string;
  duration?: string;
  className?: string;
}

const TYPE_CONFIG: Record<ResourceType, { icon: React.ReactNode; label: string; color: string }> = {
  document: {
    icon: <FileText className="h-4 w-4" />,
    label: '文档',
    color: 'text-blue-500',
  },
  code: {
    icon: <Code className="h-4 w-4" />,
    label: '代码',
    color: 'text-emerald-500',
  },
  video: {
    icon: <Video className="h-4 w-4" />,
    label: '视频',
    color: 'text-red-500',
  },
  exercise: {
    icon: <Lightbulb className="h-4 w-4" />,
    label: '练习',
    color: 'text-amber-500',
  },
  article: {
    icon: <BookOpen className="h-4 w-4" />,
    label: '文章',
    color: 'text-violet-500',
  },
  audio: {
    icon: <Headphones className="h-4 w-4" />,
    label: '音频',
    color: 'text-pink-500',
  },
};

export function ResourceCard({ title, type, description, url, duration, className }: ResourceCardProps) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.document;

  return (
    <div className={cn(
      'my-2 rounded-lg border bg-card transition-colors hover:bg-accent/50',
      className,
    )}>
      <div className="flex items-start gap-3 p-3">
        <div className={cn('mt-0.5 shrink-0', config.color)}>
          {config.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{title}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('font-medium', config.color)}>{config.label}</span>
            {duration && (
              <>
                <span>·</span>
                <span>{duration}</span>
              </>
            )}
          </div>
          {description && (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
