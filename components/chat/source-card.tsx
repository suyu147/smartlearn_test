'use client';

import { cn } from '@/lib/utils';
import { ExternalLink, FileText } from 'lucide-react';

export interface SourceItem {
  index: number;
  title: string;
  url?: string;
  snippet?: string;
}

interface SourceCardProps {
  sources: SourceItem[];
  className?: string;
}

export function SourceCard({ sources, className }: SourceCardProps) {
  return (
    <div className={cn(
      'my-2 rounded-lg border bg-card',
      className,
    )}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">参考来源</span>
        <span className="ml-auto text-xs text-muted-foreground">{sources.length} 条</span>
      </div>
      <div className="divide-y">
        {sources.map((source) => (
          <div key={source.index} className="flex items-start gap-2 px-3 py-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {source.index}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium">{source.title}</p>
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {source.snippet && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{source.snippet}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
