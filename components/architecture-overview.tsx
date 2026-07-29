'use client';

import { cn } from '@/lib/utils';

const layers = [
  { id: 'user', label: '用户层', sub: '浏览器 / 移动端', color: '#6366f1' },
  { id: 'ui', label: '前端 UI', sub: 'Next.js 15 + React 19 + shadcn/ui', color: '#8b5cf6' },
  { id: 'api', label: 'API 路由', sub: '/api/learn  /api/chat  /api/profile', color: '#a855f7' },
  { id: 'graph', label: 'LangGraph 编排层', sub: 'learning-graph (学习流) · director-graph (PPT)', color: '#d946ef' },
  { id: 'sdk', label: '模型接入层', sub: 'Vercel AI SDK + 统一 LLM 封装', color: '#ec4899' },
  { id: 'llm', label: '大模型', sub: '讯飞星火 · OpenAI · Anthropic · Google', color: '#f43f5e' },
];

interface ArchitectureOverviewProps {
  className?: string;
}

export function ArchitectureOverview({ className }: ArchitectureOverviewProps) {
  const svgWidth = 720;
  const boxHeight = 52;
  const gap = 28;
  const padding = 16;
  const totalHeight = layers.length * boxHeight + (layers.length - 1) * gap + padding * 2;
  const boxWidth = svgWidth - padding * 2;

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <svg
        viewBox={`0 0 ${svgWidth} ${totalHeight}`}
        width="100%"
        height={totalHeight}
        xmlns="http://www.w3.org/2000/svg"
        className="mx-auto block"
      >
        <defs>
          <marker
            id="arch-arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {layers.map((layer, i) => {
          const y = padding + i * (boxHeight + gap);
          return (
            <g key={layer.id}>
              {/* 圆角矩形 */}
              <rect
                x={padding}
                y={y}
                width={boxWidth}
                height={boxHeight}
                rx={12}
                ry={12}
                fill={layer.color}
                fillOpacity={0.08}
                stroke={layer.color}
                strokeWidth={1.5}
              />
              {/* 主标题 */}
              <text
                x={svgWidth / 2}
                y={y + 21}
                textAnchor="middle"
                fontSize={15}
                fontWeight={600}
                fill={layer.color}
              >
                {layer.label}
              </text>
              {/* 副标题 */}
              <text
                x={svgWidth / 2}
                y={y + 40}
                textAnchor="middle"
                fontSize={11}
                fill="#94a3b8"
              >
                {layer.sub}
              </text>

              {/* 层间箭头 */}
              {i < layers.length - 1 && (
                <line
                  x1={svgWidth / 2}
                  y1={y + boxHeight}
                  x2={svgWidth / 2}
                  y2={y + boxHeight + gap}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  markerEnd="url(#arch-arrow)"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
