'use client';

import { useState, useMemo } from 'react';
import { useLearningPathStore } from '@/lib/store/learning-path';
import { useAgentActivityStore } from '@/lib/store/agent-activity';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CheckCircle2,
  Circle,
  Lock,
  PlayCircle,
  ChevronRight,
  ChevronDown,
  FileText,
  HelpCircle,
  Sparkles,
  Clock,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import type { PathNodeStatus } from '@/lib/types/learning-path';
import { RESOURCE_TYPE_LABELS, type ResourceType } from '@/lib/types/resource';
import type { ResourceDecisionResultV2 } from '@/lib/generation/resource-decision';
import { useResourceDecisionsStore } from '@/lib/store/resource-decisions';
import { useSessionsStore } from '@/lib/store/sessions';

const DECISION_TYPES: ResourceType[] = ['document', 'mindmap', 'quiz', 'video', 'code', 'reading', 'ppt'];

const statusConfig: Record<PathNodeStatus, { icon: React.ElementType; color: string; label: string }> = {
  locked: { icon: Lock, color: 'text-muted-foreground', label: '未解锁' },
  available: { icon: Circle, color: 'text-blue-500', label: '可学习' },
  in_progress: { icon: PlayCircle, color: 'text-amber-500', label: '学习中' },
  completed: { icon: CheckCircle2, color: 'text-green-500', label: '已完成' },
};

interface PathTimelineProps {
  onClickResource?: (resourceId: string) => void;
  generatingNodes?: Set<string>;
  decisionSuggestionsByNodeId?: Record<string, ResourceDecisionResultV2>;
  onSuggestionSelection?: (nodeId: string, selectedTypes: ResourceType[]) => void;
  onNodeComplete?: (nodeId: string) => void;
}

export function PathTimeline({
  onClickResource,
  generatingNodes,
  decisionSuggestionsByNodeId,
  onSuggestionSelection,
  onNodeComplete,
}: PathTimelineProps) {
  const { path, updateNodeStatus } = useLearningPathStore();
  const activityLog = useAgentActivityStore((s) => s.activityLog);
  const sessionId = useSessionsStore((s) => s.currentSessionId);
  const decisionLogs = useResourceDecisionsStore((s) => s.getDecisionLogsForSession(sessionId ?? ''));
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // 按 nodeId 建立决策日志索引（取最后一条）
  const decisionByNodeId = useMemo(() => {
    const map = new Map<string, ResourceDecisionResultV2>();
    for (const log of decisionLogs) {
      map.set(log.nodeId, log.result);
    }
    return map;
  }, [decisionLogs]);

  // 为每个节点预计算相关的 activity 日志（按资源类型匹配）
  const nodeActivityMap = useMemo(() => {
    const map = new Map<string, typeof activityLog>();
    if (!path) return map;
    for (const node of path.nodes) {
      const nodeTypes = new Set(node.resources.map((r) => r.type));
      const matched = activityLog.filter((entry) => nodeTypes.has(entry.resourceType));
      map.set(node.id, matched);
    }
    return map;
  }, [path, activityLog]);

  if (!path) return null;

  // 切换生成日志展开/折叠
  function toggleLog(nodeId: string) {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  const statusIconMap = {
    running: Loader2,
    completed: CheckCircle2,
    failed: AlertCircle,
  } as const;

  const statusColorMap = {
    running: 'text-yellow-500',
    completed: 'text-green-500',
    failed: 'text-red-500',
  } as const;

  // 通过resourceId查找Resource引用
  function handleResourceClick(e: React.MouseEvent, resourceId: string) {
    e.preventDefault();
    e.stopPropagation();
    onClickResource?.(resourceId);
  }

  return (
    <div className="space-y-1">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">学习路径：{path.goal}</h2>
        <Badge variant="secondary">预计 {path.estimatedDays} 天</Badge>
      </div>

      <div className="relative space-y-3">
        {path.nodes.map((node, index) => {
          const config = statusConfig[node.status];
          const Icon = config.icon;
          const suggestion = decisionSuggestionsByNodeId?.[node.id];
          const suggestedTypes = suggestion?.items.filter((item) => item.action === 'generate').map((item) => item.type) ?? [];
          const skippedItems = suggestion?.items.filter((item) => item.action !== 'generate') ?? [];
          const selectedSuggestionTypes = new Set(suggestedTypes);
          const isGenerating = generatingNodes?.has(node.id);

          return (
            <div key={node.id} className="relative">
              {index < path.nodes.length - 1 && (
                <div className="absolute left-[19px] top-10 h-[calc(100%-8px)] w-0.5 bg-border" />
              )}

              <Card
                className={`transition-all ${
                  node.status === 'available' || node.status === 'in_progress'
                    ? 'hover:shadow-md cursor-pointer'
                    : node.status === 'locked'
                      ? 'opacity-60'
                      : ''
                }`}
                onClick={() => {
                  if (node.status === 'available') {
                    updateNodeStatus(node.id, 'in_progress');
                  }
                }}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <div className={`mt-0.5 ${config.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{node.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:text-primary"
                            onClick={(event) => event.stopPropagation()}
                            title="查看决策推理"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72" align="start">
                          {(() => {
                            const decision = decisionByNodeId.get(node.id);
                            if (!decision) {
                              return (
                                <p className="text-sm text-muted-foreground">暂无决策记录</p>
                              );
                            }
                            return (
                              <div className="space-y-3 text-sm">
                                <div>
                                  <p className="mb-1 font-medium">推理过程</p>
                                  {decision.summary.reasoning.length > 0 ? (
                                    <ul className="space-y-1 text-muted-foreground">
                                      {decision.summary.reasoning.map((line, i) => (
                                        <li key={i} className="flex gap-1.5 text-xs leading-relaxed">
                                          <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                                          {line}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">无推理信息</p>
                                  )}
                                </div>
                                <div>
                                  <p className="mb-1 font-medium">应用规则</p>
                                  {decision.trace.rulesApplied.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {decision.trace.rulesApplied.map((rule, i) => (
                                        <span
                                          key={i}
                                          className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground"
                                        >
                                          {rule}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">默认规则</p>
                                  )}
                                </div>
                                {decision.trace.feedbackSignals.length > 0 && (
                                  <div>
                                    <p className="mb-1 font-medium">反馈信号</p>
                                    <div className="flex flex-wrap gap-1">
                                      {decision.trace.feedbackSignals.map((signal, i) => (
                                        <span
                                          key={i}
                                          className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                                        >
                                          {signal}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </PopoverContent>
                      </Popover>
                      {suggestion && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary transition-colors hover:bg-primary/10"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Sparkles className="h-3 w-3" />
                              Agent 建议
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80" align="start">
                            <div className="space-y-3 text-sm">
                              <div>
                                <p className="font-medium">建议生成</p>
                                <p className="mt-1 text-muted-foreground">
                                  {suggestedTypes.length > 0
                                    ? suggestedTypes.map((type) => RESOURCE_TYPE_LABELS[type]).join('、')
                                    : '本节点当前没有推荐生成的普通资源'}
                                </p>
                              </div>
                              {onSuggestionSelection && (
                                <div>
                                  <p className="font-medium">手动调整</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {DECISION_TYPES.map((type) => {
                                      const selected = selectedSuggestionTypes.has(type);
                                      return (
                                        <button
                                          key={`${node.id}-toggle-${type}`}
                                          type="button"
                                          className={`rounded-full border px-2 py-1 text-xs transition-colors ${
                                            selected
                                              ? 'border-primary bg-primary/10 text-primary'
                                              : 'border-border text-muted-foreground hover:bg-accent'
                                          }`}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            const nextTypes = selected
                                              ? suggestedTypes.filter((item) => item !== type)
                                              : [...suggestedTypes, type];
                                            onSuggestionSelection(node.id, nextTypes);
                                          }}
                                        >
                                          {RESOURCE_TYPE_LABELS[type]}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {skippedItems.length > 0 && (
                                <div>
                                  <p className="font-medium">跳过项</p>
                                  <div className="mt-1 space-y-1 text-muted-foreground">
                                    {skippedItems.map((item) => (
                                      <p key={`${node.id}-${item.type}`}>{RESOURCE_TYPE_LABELS[item.type]}：{item.reason}</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <p className="font-medium">决策轨迹</p>
                                <p className="mt-1 text-muted-foreground">
                                  {suggestion.trace.rulesApplied.join('、') || '默认规则'}
                                </p>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {node.knowledgePoints.map((kp, i) => (
                        <Badge key={kp || `kp-${i}`} variant="secondary" className="text-xs">
                          {kp}
                        </Badge>
                      ))}
                    </div>
                    {suggestedTypes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {suggestedTypes.map((type) => (
                          <Badge key={`${node.id}-suggestion-${type}`} variant="outline" className="text-[11px]">
                            建议：{RESOURCE_TYPE_LABELS[type]}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {node.resources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {node.resources.map((res, i) => (
                          <button
                            key={res.resourceId || `res-${i}`}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                'application/x-smartlearn-resource',
                                JSON.stringify({ resourceId: res.resourceId }),
                              );
                              event.dataTransfer.effectAllowed = 'copy';
                            }}
                            onClick={(e) => handleResourceClick(e, res.resourceId)}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          >
                            <FileText className="h-3 w-3" />
                            {RESOURCE_TYPE_LABELS[res.type as ResourceType] || res.type}
                            <span className="max-w-[120px] truncate">{res.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {node.quizId && (
                      <div className="mt-1">
                        <button
                          onClick={(e) => handleResourceClick(e, node.quizId!)}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 transition-colors hover:bg-amber-100 cursor-pointer"
                        >
                          <HelpCircle className="h-3 w-3" />
                          练习测验
                        </button>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>预计 {node.estimatedMinutes} 分钟</span>
                      <span>{node.resources.length} 个资源</span>
                      {isGenerating && <span className="text-primary">Agent 生成中</span>}
                      {node.status === 'in_progress' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNodeComplete?.(node.id);
                            if (!onNodeComplete) {
                              updateNodeStatus(node.id, 'completed');
                            }
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          标记完成
                        </Button>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>

              {/* 生成日志（可折叠） */}
              {(() => {
                const nodeLogs = nodeActivityMap.get(node.id) ?? [];
                const isLogExpanded = expandedLogs.has(node.id);
                return (
                  <div className="ml-8 mt-0.5">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
                      onClick={() => toggleLog(node.id)}
                    >
                      {isLogExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      生成日志{nodeLogs.length > 0 && ` (${nodeLogs.length})`}
                    </button>
                    {isLogExpanded && (
                      <div className="mt-1 space-y-0.5 border-l border-border/50 pl-2">
                        {nodeLogs.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground/60">暂无记录</p>
                        ) : (
                          nodeLogs.map((entry, logIdx) => {
                            const StatusIcon = statusIconMap[entry.status];
                            const iconColor = statusColorMap[entry.status];
                            return (
                              <div
                                key={`${entry.agentId}-${entry.timestamp}-${logIdx}`}
                                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                              >
                                <StatusIcon className={`h-3 w-3 shrink-0 ${iconColor} ${entry.status === 'running' ? 'animate-spin' : ''}`} />
                                <span className="font-medium">{entry.agentName}</span>
                                <span className="text-muted-foreground/60">
                                  {RESOURCE_TYPE_LABELS[entry.resourceType]}
                                </span>
                                <span className="ml-auto text-muted-foreground/50">
                                  <Clock className="mr-0.5 inline h-2.5 w-2.5" />
                                  {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
