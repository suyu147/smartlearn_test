'use client';

import { Badge } from '@/components/ui/badge';
import { AGENTS } from '@/lib/types/agent';
import { useResourcesStore } from '@/lib/store/resources';
import { RESOURCE_TYPE_LABELS, type ResourceType } from '@/lib/types/resource';
import { Loader2 } from 'lucide-react';

const agentForResource: Record<ResourceType, string> = {
  document: 'document',
  mindmap: 'multimodal',
  quiz: 'quiz',
  video: 'multimodal',
  code: 'code',
  reading: 'document',
  ppt: 'multimodal',
};

export function AgentStatusPanel() {
  const { generatingTypes } = useResourcesStore();

  if (generatingTypes.length === 0) return null;

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-medium">Agent 协作状态</h3>
      <div className="space-y-2">
        {generatingTypes.map((type) => {
          const agentId = agentForResource[type];
          const agent = AGENTS[agentId];
          return (
            <div key={type} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: agent?.color }} />
              <div className="flex-1">
                <span className="text-sm font-medium">{agent?.name || agentId}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  正在生成{RESOURCE_TYPE_LABELS[type]}...
                </span>
              </div>
              <Badge variant="outline" className="text-xs">
                {RESOURCE_TYPE_LABELS[type]}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
