'use client';

import { X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ConceptHotspot } from '@/lib/types/slides';

interface Props {
  hotspot: ConceptHotspot | null;
  onClose: () => void;
  onViewRelatedResource?: (resourceId: string) => void;
}

export function ConceptPanel({ hotspot, onClose, onViewRelatedResource }: Props) {
  if (!hotspot) return null;

  return (
    <div className="flex h-full flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold truncate">{hotspot.keyword}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {hotspot.snippet}
        </p>
      </div>
      {hotspot.relatedResourceId && onViewRelatedResource && (
        <div className="border-t p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => onViewRelatedResource(hotspot.relatedResourceId!)}
          >
            <FileText className="h-4 w-4" />
            查看完整文档
          </Button>
        </div>
      )}
    </div>
  );
}
