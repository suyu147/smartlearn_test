'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tool Toggle Component
// ---------------------------------------------------------------------------

interface ToolToggleProps {
  name: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

function ToolToggle({ name, description, enabled, onToggle }: ToolToggleProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4 bg-[var(--card)]">
      <div className="space-y-0.5">
        <p className="text-[13px] font-medium text-[var(--foreground)]">{name}</p>
        <p className="text-[12px] text-[var(--muted-foreground)]">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          enabled ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            enabled && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools Settings Page
// ---------------------------------------------------------------------------

const DEFAULT_TOOLS = [
  {
    id: 'web_search',
    name: '网络搜索',
    description: '允许代理搜索互联网获取最新信息',
    enabled: true,
  },
  {
    id: 'code_execution',
    name: '代码执行',
    description: '允许代理运行 Python 代码进行计算和验证',
    enabled: true,
  },
  {
    id: 'reason',
    name: '推理链',
    description: '启用带完整思考过程的逐步推理',
    enabled: true,
  },
  {
    id: 'rag',
    name: '知识检索',
    description: '从索引的知识库中检索相关文档片段',
    enabled: true,
  },
  {
    id: 'brainstorm',
    name: '头脑风暴',
    description: '生成多个创意想法和方向',
    enabled: true,
  },
  {
    id: 'paper_search',
    name: '论文搜索',
    description: '搜索学术论文和研究成果',
    enabled: false,
  },
];

export default function ToolsPage() {
  const [tools, setTools] = useState(DEFAULT_TOOLS);

  const toggleTool = (id: string) => {
    setTools(tools.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  const enabledCount = tools.filter((t) => t.enabled).length;

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">
          工具
        </h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          管理代理可用的外部工具（已启用 {enabledCount}/{tools.length} 项）
        </p>
      </div>

      <div className="space-y-3">
        {tools.map((tool) => (
          <ToolToggle
            key={tool.id}
            name={tool.name}
            description={tool.description}
            enabled={tool.enabled}
            onToggle={() => toggleTool(tool.id)}
          />
        ))}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => setTools(tools.map((t) => ({ ...t, enabled: true })))}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
        >
          全部启用
        </button>
        <button
          onClick={() => setTools(tools.map((t) => ({ ...t, enabled: false })))}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
        >
          全部禁用
        </button>
      </div>

      <div className="mt-6 p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <p className="text-[12px] text-[var(--muted-foreground)]">
          工具设置适用于新对话。启用的工具集会随每次请求一起发送。
        </p>
      </div>
    </div>
  );
}
