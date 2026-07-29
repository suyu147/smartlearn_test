'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';

interface ToolCallCardProps {
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
  className?: string;
}

export function ToolCallCard({ toolName, args, result, className }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      'my-2 overflow-hidden rounded-lg border bg-muted/30',
      className,
    )}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs font-medium text-foreground">{toolName}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t">
          {args && (
            <div className="px-3 py-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">输入</p>
              <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                <code>{JSON.stringify(args, null, 2)}</code>
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div className="border-t px-3 py-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">输出</p>
              <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                <code>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
