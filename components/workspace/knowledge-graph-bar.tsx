'use client';

import { useMemo } from 'react';
import { CheckCircle2, Lock, CircleDot } from 'lucide-react';
import type { LearningPathNode } from '@/lib/types/learning-path';

interface Props {
  nodes: LearningPathNode[];
  activeNodeId?: string;
  onNodeClick?: (nodeId: string) => void;
}

interface KGNode {
  id: string;
  label: string;
  status: 'completed' | 'active' | 'locked';
}

interface KGEdge {
  from: string;
  to: string;
}

/**
 * 简洁知识路径条：用纯 SVG + foreignObject 渲染当前学习路径的知识点拓扑。
 * 已完成节点绿色高亮，当前节点蓝色发光，未解锁节点置灰，连线带箭头。
 */
export function KnowledgeGraphBar({ nodes, activeNodeId, onNodeClick }: Props) {
  const { kgNodes, kgEdges } = useMemo(() => {
    if (!nodes.length) return { kgNodes: [], kgEdges: [] };

    const kgNodes: KGNode[] = nodes.map((node) => {
      let status: KGNode['status'] = 'locked';
      if (node.status === 'completed') status = 'completed';
      else if (node.id === activeNodeId || node.status === 'in_progress') status = 'active';
      else if (node.status === 'available') status = 'active';
      return { id: node.id, label: node.title, status };
    });

    const kgEdges: KGEdge[] = [];
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const node of nodes) {
      for (const prereq of node.prerequisites) {
        if (nodeIds.has(prereq)) {
          kgEdges.push({ from: prereq, to: node.id });
        }
      }
    }

    // 对于没有显式 prerequisites 的节点，按顺序创建线性链
    if (kgEdges.length === 0 && nodes.length > 1) {
      for (let i = 0; i < nodes.length - 1; i++) {
        kgEdges.push({ from: nodes[i].id, to: nodes[i + 1].id });
      }
    }

    return { kgNodes, kgEdges };
  }, [nodes, activeNodeId]);

  if (kgNodes.length === 0) return null;

  // 布局参数
  const nodeWidth = 180;
  const nodeHeight = 72;
  const gapX = 56;
  const padX = 28;
  const padY = 24;
  const totalWidth = padX * 2 + kgNodes.length * nodeWidth + (kgNodes.length - 1) * gapX;
  const totalHeight = padY * 2 + nodeHeight;

  const nodePositions = new Map<string, { x: number; y: number }>();
  kgNodes.forEach((node, i) => {
    nodePositions.set(node.id, {
      x: padX + i * (nodeWidth + gapX),
      y: padY,
    });
  });

  const statusTheme: Record<
    KGNode['status'],
    { fill: string; stroke: string; text: string; icon: string; badge: string }
  > = {
    completed: {
      fill: '#f0fdf4',
      stroke: '#22c55e',
      text: '#15803d',
      icon: '#22c55e',
      badge: '已完成',
    },
    active: {
      fill: '#eff6ff',
      stroke: '#3b82f6',
      text: '#1e40af',
      icon: '#3b82f6',
      badge: '进行中',
    },
    locked: {
      fill: '#f9fafb',
      stroke: '#e5e7eb',
      text: '#6b7280',
      icon: '#9ca3af',
      badge: '未解锁',
    },
  };

  const getEdgeStyle = (toStatus: KGNode['status']) => {
    if (toStatus === 'completed') return { stroke: '#86efac', width: 2.5, dash: undefined };
    if (toStatus === 'active') return { stroke: '#60a5fa', width: 2.5, dash: undefined };
    return { stroke: '#d1d5db', width: 2, dash: '6 4' };
  };

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-sm">
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="mx-auto block"
      >
        <defs>
          <marker id="arrowhead-completed" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#86efac" />
          </marker>
          <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#60a5fa" />
          </marker>
          <marker id="arrowhead-locked" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#d1d5db" />
          </marker>
          <filter id="activeGlow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#3b82f6" floodOpacity="0.22" />
          </filter>
        </defs>

        {/* 边 */}
        {kgEdges.map((edge, i) => {
          const from = nodePositions.get(edge.from);
          const to = nodePositions.get(edge.to);
          if (!from || !to) return null;
          const toNode = kgNodes.find((n) => n.id === edge.to);
          const style = getEdgeStyle(toNode?.status ?? 'locked');
          const marker =
            toNode?.status === 'completed'
              ? 'url(#arrowhead-completed)'
              : toNode?.status === 'active'
                ? 'url(#arrowhead-active)'
                : 'url(#arrowhead-locked)';
          return (
            <line
              key={`edge-${i}`}
              x1={from.x + nodeWidth}
              y1={from.y + nodeHeight / 2}
              x2={to.x}
              y2={to.y + nodeHeight / 2}
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeDasharray={style.dash}
              markerEnd={marker}
            />
          );
        })}

        {/* 节点 */}
        {kgNodes.map((node) => {
          const pos = nodePositions.get(node.id);
          if (!pos) return null;
          const theme = statusTheme[node.status];
          const isActive = node.status === 'active';
          const isCompleted = node.status === 'completed';
          const isLocked = node.status === 'locked';

          return (
            <g
              key={node.id}
              className="cursor-pointer transition-opacity hover:opacity-90"
              onClick={() => onNodeClick?.(node.id)}
            >
              <rect
                x={pos.x}
                y={pos.y}
                width={nodeWidth}
                height={nodeHeight}
                rx={14}
                ry={14}
                fill={theme.fill}
                stroke={theme.stroke}
                strokeWidth={isActive ? 2.5 : 1.5}
                filter={isActive ? 'url(#activeGlow)' : undefined}
              />
              <foreignObject
                x={pos.x}
                y={pos.y}
                width={nodeWidth}
                height={nodeHeight}
                xmlns="http://www.w3.org/1999/xhtml"
              >
                <div
                  style={{
                    width: nodeWidth,
                    height: nodeHeight,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isCompleted && <CheckCircle2 size={14} color={theme.icon} />}
                    {isActive && <CircleDot size={14} color={theme.icon} />}
                    {isLocked && <Lock size={13} color={theme.icon} />}
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: theme.icon,
                      }}
                    >
                      {theme.badge}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      lineHeight: 1.35,
                      color: theme.text,
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    title={node.label}
                  >
                    {node.label}
                  </div>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
