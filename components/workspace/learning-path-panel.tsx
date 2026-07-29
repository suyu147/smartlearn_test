'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { PathTimeline } from '@/components/learning-path/path-timeline';
import { PathProgress } from '@/components/learning-path/path-progress';
import { useResourcesStore } from '@/lib/store/resources';
import type { LearningPath } from '@/lib/types/learning-path';
import type { Resource, ResourceType } from '@/lib/types/resource';
import type { ResourceDecisionResultV2 } from '@/lib/generation/resource-decision';

interface Props {
  path: LearningPath | null;
  generatingNodes: Set<string>;
  decisionSuggestionsByNodeId: Record<string, ResourceDecisionResultV2>;
  onSuggestionSelection: (nodeId: string, selectedTypes: ResourceType[]) => void;
  onSelectResource: (resource: Resource) => void;
  onNodeComplete: (nodeId: string) => void;
}

export function LearningPathPanel({
  path,
  generatingNodes,
  decisionSuggestionsByNodeId,
  onSuggestionSelection,
  onSelectResource,
  onNodeComplete,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);

  const { resources } = useResourcesStore();
  function handleClickResource(resourceId: string) {
    const found = resources.find(r => r.id === resourceId);
    if (found) {
      onSelectResource(found);
    }
  }

  // 检测内容是否溢出，控制滚动条显示
  const checkOverflow = useCallback(() => {
    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;
    if (container && content) {
      setShowScrollbar(content.scrollHeight > container.clientHeight);
    }
  }, []);

  useEffect(() => {
    checkOverflow();
    // 路径变化时重新检测
    const observer = new ResizeObserver(checkOverflow);
    if (scrollContainerRef.current) {
      observer.observe(scrollContainerRef.current);
    }
    if (scrollContentRef.current) {
      observer.observe(scrollContentRef.current);
    }
    return () => observer.disconnect();
  }, [path, checkOverflow]);

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center border-r py-3">
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} title="展开学习路径">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (!path) {
    return (
      <div className="flex w-[280px] items-center justify-center border-r p-6">
        <div className="text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
          正在规划学习路径...
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-[280px] min-w-0 flex-col border-r bg-background">
      {/* 固定头部 */}
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium">{path.goal}</h3>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} title="折叠学习路径">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden ${
          showScrollbar ? 'scrollbar-visible' : 'scrollbar-hidden'
        }`}
        style={{
          scrollbarWidth: showScrollbar ? 'thin' : 'none',
          scrollbarColor: 'var(--border) transparent',
          scrollBehavior: 'smooth',
        }}
      >
        <div ref={scrollContentRef} className="space-y-3 p-3">
          <PathProgress />
          <div className="w-[117%] origin-top-left scale-[0.85]">
            <PathTimeline
              onClickResource={handleClickResource}
              generatingNodes={generatingNodes}
              decisionSuggestionsByNodeId={decisionSuggestionsByNodeId}
              onSuggestionSelection={onSuggestionSelection}
              onNodeComplete={onNodeComplete}
            />
          </div>
        </div>
      </div>
    </div>
  );
}