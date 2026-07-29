'use client';

import { useState, useCallback } from 'react';
import {
  FileText,
  Video,
  HelpCircle,
  Network,
  BookOpen,
  Code2,
  X,
  Loader2,
  Sparkles,
  ArrowRight,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-client';
import { useSettingsStoreV2 } from '@/lib/store/settings-store';
import { ResourceViewer } from '@/components/workspace/resource-viewer';
import type { Resource, ResourceType } from '@/lib/types/resource';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Resource type catalog
// ---------------------------------------------------------------------------

interface ResourceCardConfig {
  type: ResourceType;
  title: string;
  desc: string;
  placeholder: string;
  icon: typeof FileText;
  iconClass: string;
  accent: string;
}

const RESOURCE_CARDS: ResourceCardConfig[] = [
  {
    type: 'document',
    title: '文档',
    desc: '生成结构化讲解文档，含章节、代码示例和要点提示',
    placeholder: '例如：二叉搜索树的插入与删除',
    icon: FileText,
    iconClass: 'bg-pastel-blue text-blue-600',
    accent: 'from-blue-500/10 to-blue-500/0',
  },
  {
    type: 'video',
    title: '视频',
    desc: '搜索并推荐与主题相关的教学视频资源',
    placeholder: '例如：快速排序算法讲解',
    icon: Video,
    iconClass: 'bg-pastel-rose text-rose-600',
    accent: 'from-rose-500/10 to-rose-500/0',
  },
  {
    type: 'quiz',
    title: '习题',
    desc: '生成包含选择、填空、编程题的练习题集',
    placeholder: '例如：链表反转相关练习',
    icon: HelpCircle,
    iconClass: 'bg-pastel-green text-green-600',
    accent: 'from-green-500/10 to-green-500/0',
  },
  {
    type: 'mindmap',
    title: '思维导图',
    desc: '生成主题知识结构的思维导图',
    placeholder: '例如：数据结构知识体系总览',
    icon: Network,
    iconClass: 'bg-pastel-violet text-violet-600',
    accent: 'from-violet-500/10 to-violet-500/0',
  },
  {
    type: 'reading',
    title: '扩展阅读',
    desc: '生成主题相关的拓展阅读卡片与链接',
    placeholder: '例如：图论进阶推荐资料',
    icon: BookOpen,
    iconClass: 'bg-pastel-amber text-amber-600',
    accent: 'from-amber-500/10 to-amber-500/0',
  },
  {
    type: 'code',
    title: '代码',
    desc: '生成主题相关的可运行代码案例',
    placeholder: '例如：红黑树的 Python 实现',
    icon: Code2,
    iconClass: 'bg-pastel-cyan text-cyan-600',
    accent: 'from-cyan-500/10 to-cyan-500/0',
  },
];

// ---------------------------------------------------------------------------
// Generated resource entry shape
// ---------------------------------------------------------------------------

interface GeneratedEntry {
  resource: Resource;
  isLoading?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResourcesPage() {
  const [activeType, setActiveType] = useState<ResourceCardConfig | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [generating, setGenerating] = useState(false);
  const [entries, setEntries] = useState<GeneratedEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const settings = useSettingsStoreV2();

  /** Build aiConfig from the smartlearn settings store. */
  const buildAiConfig = useCallback(() => {
    const config: {
      providerId?: string;
      modelId?: string;
      apiKey?: string;
      baseUrl?: string;
    } = {};
    if (settings.smartlearnProviderId) config.providerId = settings.smartlearnProviderId;
    if (settings.smartlearnModelId) config.modelId = settings.smartlearnModelId;
    if (settings.smartlearnApiKey) config.apiKey = settings.smartlearnApiKey;
    if (settings.smartlearnBaseUrl) config.baseUrl = settings.smartlearnBaseUrl;
    return config;
  }, [settings]);

  /** Open the input modal for a given resource card. */
  const handleCardClick = useCallback((card: ResourceCardConfig) => {
    setActiveType(card);
    setInputValue('');
  }, []);

  /** Close the modal. */
  const handleCloseModal = useCallback(() => {
    setActiveType(null);
    setInputValue('');
  }, []);

  /** Submit the resource name and trigger generation. */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeType || !inputValue.trim() || generating) return;

      const name = inputValue.trim();
      const type = activeType.type;

      // Optimistically add a loading entry and select it.
      const placeholderId = `gen_${Date.now()}`;
      const loadingEntry: GeneratedEntry = {
        resource: {
          id: placeholderId,
          userId: '',
          type,
          title: name,
          content: '',
          metadata: { knowledgePoints: [name] },
          sourceAgent: type,
          status: 'generating',
          createdAt: new Date().toISOString(),
        },
        isLoading: true,
      };

      const newIndex = entries.length;
      setEntries((prev) => [...prev, loadingEntry]);
      setActiveIndex(newIndex);
      setGenerating(true);
      handleCloseModal();

      try {
        // apiFetch auto-unwraps the { success, data } envelope, so the
        // resolved value is the `data` payload directly.
        const res = await apiFetch<{
          type: ResourceType;
          title: string;
          content: string;
          metadata?: Record<string, unknown>;
        }>('/api/v1/resources/generate', {
          method: 'POST',
          body: JSON.stringify({ type, name, aiConfig: buildAiConfig() }),
        });

        const finished: Resource = {
          id: placeholderId,
          userId: '',
          type: res.type,
          title: res.title,
          content: res.content,
          metadata: res.metadata as Resource['metadata'],
          sourceAgent: type,
          status: 'ready',
          createdAt: new Date().toISOString(),
        };

        setEntries((prev) =>
          prev.map((entry, idx) =>
            idx === newIndex ? { resource: finished } : entry,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setEntries((prev) =>
          prev.map((entry, idx) =>
            idx === newIndex
              ? {
                  resource: { ...entry.resource, status: 'failed' },
                  error: message,
                }
              : entry,
          ),
        );
      } finally {
        setGenerating(false);
      }
    },
    [activeType, inputValue, generating, entries.length, handleCloseModal, buildAiConfig],
  );

  /** Remove an entry. */
  const handleRemove = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, idx) => idx !== index));
    setActiveIndex((cur) => {
      if (cur === null) return null;
      if (index < cur) return cur - 1;
      if (index === cur) return null;
      return cur;
    });
  }, []);

  /** Regenerate an entry using its original name. */
  const handleRegenerate = useCallback(
    async (index: number) => {
      const entry = entries[index];
      if (!entry) return;
      const name = entry.resource.metadata?.knowledgePoints?.[0] ?? entry.resource.title;
      const type = entry.resource.type;

      setEntries((prev) =>
        prev.map((e, idx) =>
          idx === index
            ? {
                resource: { ...e.resource, status: 'generating', content: '' },
                isLoading: true,
                error: undefined,
              }
            : e,
        ),
      );
      setActiveIndex(index);

      try {
        // apiFetch auto-unwraps the { success, data } envelope.
        const res = await apiFetch<{
          type: ResourceType;
          title: string;
          content: string;
          metadata?: Record<string, unknown>;
        }>('/api/v1/resources/generate', {
          method: 'POST',
          body: JSON.stringify({ type, name, aiConfig: buildAiConfig() }),
        });

        const finished: Resource = {
          id: entry.resource.id,
          userId: '',
          type: res.type,
          title: res.title,
          content: res.content,
          metadata: res.metadata as Resource['metadata'],
          sourceAgent: type,
          status: 'ready',
          createdAt: new Date().toISOString(),
        };
        setEntries((prev) =>
          prev.map((e, idx) => (idx === index ? { resource: finished } : e)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setEntries((prev) =>
          prev.map((e, idx) =>
            idx === index
              ? { resource: { ...e.resource, status: 'failed' }, error: message }
              : e,
          ),
        );
      }
    },
    [entries, buildAiConfig],
  );

  const activeEntry = activeIndex !== null ? entries[activeIndex] : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="app-page-bg min-h-full pb-20">
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <p className="chip-primary">RESOURCES</p>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-[var(--foreground)] sm:text-[32px]">
            学习资源
          </h1>
          <p className="mt-1.5 text-[13.5px] text-[var(--muted-foreground)]">
            选择资源类型，输入主题，一键生成文档、视频、习题、思维导图、扩展阅读和代码
          </p>
        </div>

        {/* Resource cards grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.type}
                onClick={() => handleCardClick(card)}
                disabled={generating}
                className={cn(
                  'group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition-all hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {/* gradient wash */}
                <div
                  className={cn(
                    'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity group-hover:opacity-100',
                    card.accent,
                  )}
                />
                <div className="relative flex items-start gap-4">
                  <div
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                      card.iconClass,
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-semibold text-[var(--foreground)]">
                      {card.title}
                    </h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
                      {card.desc}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Generated resources section */}
        {entries.length > 0 && (
          <div className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="chip-primary">HISTORY</p>
                <h2 className="mt-2 text-[20px] font-bold tracking-tight text-[var(--foreground)]">
                  已生成资源
                </h2>
              </div>
              <button
                onClick={() => {
                  setEntries([]);
                  setActiveIndex(null);
                }}
                className="text-[12.5px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--destructive)]"
              >
                清空全部
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
              {/* Resource list */}
              <div className="space-y-2">
                {entries.map((entry, idx) => {
                  const card = RESOURCE_CARDS.find((c) => c.type === entry.resource.type)!;
                  const Icon = card.icon;
                  const active = idx === activeIndex;
                  return (
                    <div
                      key={entry.resource.id}
                      onClick={() => setActiveIndex(idx)}
                      className={cn(
                        'group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all',
                        active
                          ? 'border-blue-400 bg-blue-50/60 shadow-sm'
                          : 'border-[var(--border)] bg-[var(--card)] hover:border-blue-200 hover:bg-blue-50/30',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          card.iconClass,
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
                          {entry.resource.metadata?.knowledgePoints?.[0] ?? entry.resource.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="text-[11px] text-[var(--muted-foreground)]">
                            {card.title}
                          </span>
                          {entry.isLoading && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-blue-600">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              生成中
                            </span>
                          )}
                          {!entry.isLoading && entry.resource.status === 'ready' && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              就绪
                            </span>
                          )}
                          {!entry.isLoading && entry.resource.status === 'failed' && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600">
                              <AlertCircle className="h-2.5 w-2.5" />
                              失败
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRegenerate(idx);
                          }}
                          disabled={entry.isLoading}
                          className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-blue-100 hover:text-blue-600 disabled:opacity-40"
                          title="重新生成"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(idx);
                          }}
                          className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-red-100 hover:text-red-600"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active resource viewer */}
              <div className="min-h-[400px] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1">
                {activeEntry ? (
                  activeEntry.isLoading ? (
                    <div className="flex h-[400px] flex-col items-center justify-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                      <p className="text-[13px] text-[var(--muted-foreground)]">
                        正在生成「{activeEntry.resource.metadata?.knowledgePoints?.[0] ?? activeEntry.resource.title}」…
                      </p>
                      <p className="text-[11px] text-[var(--muted-foreground)]/70">
                        这可能需要几十秒，请稍候
                      </p>
                    </div>
                  ) : activeEntry.error ? (
                    <div className="flex h-[400px] flex-col items-center justify-center gap-3 px-6 text-center">
                      <AlertCircle className="h-8 w-8 text-red-500" />
                      <p className="text-[14px] font-medium text-[var(--foreground)]">
                        生成失败
                      </p>
                      <p className="max-w-md text-[12px] text-[var(--muted-foreground)]">
                        {activeEntry.error}
                      </p>
                      <button
                        onClick={() => handleRegenerate(activeIndex!)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        重试
                      </button>
                    </div>
                  ) : (
                    <ResourceViewer resource={activeEntry.resource} />
                  )
                ) : (
                  <div className="flex h-[400px] flex-col items-center justify-center gap-2 text-center">
                    <Sparkles className="h-10 w-10 text-[var(--muted-foreground)]/30" />
                    <p className="text-[13px] text-[var(--muted-foreground)]">
                      选择左侧已生成的资源查看内容
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input modal */}
      <Dialog open={activeType !== null} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-3">
              {activeType && (
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    activeType.iconClass,
                  )}
                >
                  <activeType.icon className="h-5 w-5" strokeWidth={2} />
                </div>
              )}
              <div>
                <DialogTitle className="text-[17px] font-bold">
                  生成{activeType?.title}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[12.5px]">
                  输入主题或知识点名称，系统将自动生成对应资源
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="resource-name"
                className="mb-1.5 block text-[12.5px] font-medium text-[var(--foreground)]"
              >
                资源主题
              </label>
              <input
                id="resource-name"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={activeType?.placeholder}
                autoFocus
                disabled={generating}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-[13.5px] text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)]/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              />
              <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
                提示：输入越具体，生成质量越高（例如具体算法名、数据结构名称）
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={generating}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-[12.5px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!inputValue.trim() || generating}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm shadow-blue-500/30 transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    生成资源
                  </>
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
