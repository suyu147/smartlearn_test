'use client';

import { useState, useEffect } from 'react';
import { Download, RefreshCw, Clock, Tag, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemoryStore, type MemoryEntry } from '@/lib/store/memory-store';
import { apiPost } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemoryLayer = 'L1' | 'L2' | 'L3';

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  size: 'primary' | 'secondary';
}

// ---------------------------------------------------------------------------
// Memory Page
// ---------------------------------------------------------------------------

export default function MemoryPage() {
  const entries = useMemoryStore((s) => s.entries);
  const activeLayer = useMemoryStore((s) => s.activeLayer);
  const setActiveLayer = useMemoryStore((s) => s.setActiveLayer);
  const removeEntry = useMemoryStore((s) => s.removeEntry);
  const consolidate = useMemoryStore((s) => s.consolidate);

  const [consolidating, setConsolidating] = useState(false);
  const [loading, setLoading] = useState(false);

  const layers: { id: MemoryLayer; label: string; description: string }[] = [
    {
      id: 'L1',
      label: 'L1 · 短期记忆',
      description:
        '当前会话的临时记忆——对话上下文、用户偏好和即时反馈。会话结束时自动整合到 L2。',
    },
    {
      id: 'L2',
      label: 'L2 · 中期记忆',
      description:
        '跨会话整合记忆——关键知识点和学习模式。定期压缩和更新。',
    },
    {
      id: 'L3',
      label: 'L3 · 长期记忆',
      description:
        '核心知识图谱和长期学习偏好。持久化存储，仅在重大知识更新时调整。',
    },
  ];

  // Fetch memories on mount
  useEffect(() => {
    // Using Zustand store as primary source until API is implemented.
    // When the API is ready, replace with:
    // const data = await apiGet<{ entries: MemoryEntry[] }>('/api/v1/memory');
    setLoading(false);
  }, []);

  // Filter entries by active layer
  const filteredEntries = entries.filter((e) => e.layer === activeLayer);

  // Handle consolidation
  const handleConsolidate = async () => {
    setConsolidating(true);
    try {
      await apiPost('/api/v1/memory/consolidate');
      consolidate();
    } catch {
      // API may not be implemented yet — fall back to local consolidation
      consolidate();
    } finally {
      setConsolidating(false);
    }
  };

  // Build graph nodes from tags
  const allTags = Array.from(new Set(entries.flatMap((e) => e.tags)));
  const graphNodes: GraphNode[] = [
    { id: 'center', label: '记忆', x: 50, y: 50, size: 'primary' },
    ...allTags.slice(0, 8).map((tag, i) => {
      const angle = (2 * Math.PI * i) / Math.min(allTags.length, 8);
      const radius = 30;
      return {
        id: tag,
        label: tag,
        x: 50 + radius * Math.cos(angle),
        y: 50 + radius * Math.sin(angle),
        size: 'secondary' as const,
      };
    }),
  ];

  const graphEdges = allTags.slice(0, 8).map((tag) => ({
    from: 'center',
    to: tag,
  }));

  // Export snapshot
  const handleExport = () => {
    const snapshot = JSON.stringify(entries, null, 2);
    const blob = new Blob([snapshot], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full bg-[var(--background)] overflow-y-auto">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--foreground)]">
            记忆工作台
          </h1>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              导出快照
            </button>
            <button
              onClick={handleConsolidate}
              disabled={consolidating}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50"
            >
              {consolidating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              整合
            </button>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-[var(--border)] px-6">
        <div className="flex gap-1">
          {layers.map((layer) => (
            <button
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              className={cn(
                'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors',
                activeLayer === layer.id
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
              )}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      {/* Layer Description */}
      <div className="px-6 py-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-[13px] text-[var(--foreground)] leading-relaxed">
            {layers.find((l) => l.id === activeLayer)?.description}
          </p>
        </div>
      </div>

      {/* Memory Timeline */}
      <div className="px-6 pb-6">
        <h2 className="text-[14px] font-semibold text-[var(--foreground)] mb-3">
          记忆时间线 ({filteredEntries.length})
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 text-[var(--primary)] animate-spin" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-10 w-10 text-[var(--muted-foreground)] mx-auto mb-4 opacity-40" />
            <p className="text-[14px] text-[var(--muted-foreground)]">
              暂无 {activeLayer} 记忆。记忆会在对话过程中自动创建。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <Clock className="h-4 w-4 text-[var(--muted-foreground)]" />
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {entry.timestamp
                        ? new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] font-medium text-[var(--primary)]">
                        {entry.source ?? '对话'}
                      </span>
                      <button
                        onClick={() => removeEntry(entry.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--destructive)]/10"
                      >
                        <Trash2 className="h-3 w-3 text-[var(--muted-foreground)] hover:text-[var(--destructive)]" />
                      </button>
                    </div>
                    <p className="text-[13px] text-[var(--foreground)] leading-relaxed mb-2">
                      {entry.content}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-[var(--muted)] rounded-full text-[10px] text-[var(--muted-foreground)] flex items-center gap-1"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Memory Graph */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
            记忆图谱
          </h2>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            · {graphNodes.length} 实体 · {graphEdges.length} 关系
          </span>
        </div>

        <div
          className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 relative"
          style={{ height: '400px' }}
        >
          {graphNodes.length <= 1 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[13px] text-[var(--muted-foreground)]">
                暂无标签。随着对话累积，记忆图谱将自动呈现。
              </p>
            </div>
          ) : (
            <>
              {/* SVG Lines */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ zIndex: 1 }}
              >
                {graphEdges.map((edge, idx) => {
                  const from = graphNodes.find((n) => n.id === edge.from);
                  const to = graphNodes.find((n) => n.id === edge.to);
                  if (!from || !to) return null;
                  return (
                    <line
                      key={idx}
                      x1={`${from.x}%`}
                      y1={`${from.y}%`}
                      x2={`${to.x}%`}
                      y2={`${to.y}%`}
                      stroke="var(--border)"
                      strokeWidth="1.5"
                      strokeOpacity="0.6"
                    />
                  );
                })}
              </svg>

              {/* Nodes */}
              {graphNodes.map((node) => (
                <div
                  key={node.id}
                  className={cn(
                    'absolute flex items-center justify-center rounded-full border-2 transition-all hover:scale-110 cursor-pointer',
                    node.size === 'primary'
                      ? 'h-16 w-16 bg-[var(--primary)] border-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/30'
                      : 'h-12 w-12 bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] hover:border-[var(--primary)]',
                  )}
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 2,
                  }}
                >
                  <span
                    className={cn(
                      'text-[11px] font-semibold',
                      node.size === 'primary' && 'text-white',
                    )}
                  >
                    {node.label}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
