'use client';

import {
  User,
  FileText,
  CheckSquare,
  Code,
  MessageCircle,
  BarChart3,
  GitBranch,
  Play,
  Presentation,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { useAgentRegistry, type AgentConfig } from '@/lib/orchestration/registry/store';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';

const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  profile: User,
  document: FileText,
  quiz: CheckSquare,
  code: Code,
  tutor: MessageCircle,
  evaluation: BarChart3,
  mindmap: GitBranch,
  video: Play,
  ppt: Presentation,
  reading: BookOpen,
};

function truncatePrompt(prompt: string, maxLen = 200): string {
  if (prompt.length <= maxLen) return prompt;
  return prompt.slice(0, maxLen).trimEnd() + '...';
}

interface AgentRolesCardProps {
  className?: string;
}

export function AgentRolesCard({ className }: AgentRolesCardProps) {
  const agents = useAgentRegistry((s) => s.agents);

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5', className)}>
      {agents.map((agent: AgentConfig) => {
        const Icon = AGENT_ICON_MAP[agent.id] ?? FileText;
        return (
          <HoverCard key={agent.id} openDelay={200}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium leading-tight">{agent.name}</span>
                <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                  {agent.description}
                </span>
              </button>
            </HoverCardTrigger>
            <HoverCardContent side="top" className="w-72">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">{agent.name}</h4>
                </div>
                <p className="text-xs text-muted-foreground">{agent.description}</p>
                {agent.systemPrompt && (
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="mb-1 text-[10px] font-medium text-muted-foreground">系统提示词摘要</p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground/90">
                      {truncatePrompt(agent.systemPrompt)}
                    </p>
                  </div>
                )}
                {agent.taskTypes && agent.taskTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.taskTypes.map((task) => (
                      <span
                        key={task}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                      >
                        {task}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}
