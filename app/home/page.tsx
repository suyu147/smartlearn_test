'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  MessagesSquare,
  Trophy,
  CalendarDays,
  ClipboardCheck,
  Library,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Zap,
  TrendingUp,
  GraduationCap,
  PenLine,
  Flame,
  CheckCircle2,
  Circle,
  Lightbulb,
  Clock,
  Network,
  Bot,
  NotebookPen,
} from 'lucide-react';
import { useSessionStore } from '@/lib/store/session-store';
import { useKnowledgeStore } from '@/lib/store/knowledge-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiGet } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Data shape for the 4 quick-action cards
// ---------------------------------------------------------------------------

interface QuickCard {
  key: string;
  title: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}

const quickCards: QuickCard[] = [
  {
    key: 'smartlearn',
    title: '智能学习',
    desc: '构建学习画像，生成个性化路径和推荐课程',
    href: '/smartlearn',
    icon: GraduationCap,
    iconClass: 'bg-pastel-blue',
  },
  {
    key: 'chat',
    title: 'AI问答',
    desc: '随时向 AI 提问，拆解概念和解决问题',
    href: '/chat',
    icon: MessagesSquare,
    iconClass: 'bg-pastel-green',
  },
  {
    key: 'cowriter',
    title: '协作写作',
    desc: '与 AI 协同完成笔记、写作和知识总结',
    href: '/co-writer',
    icon: PenLine,
    iconClass: 'bg-pastel-amber',
  },
  {
    key: 'resource',
    title: '学习资源',
    desc: '讲义、试题、知识图谱、视频、扩展阅读和代码示例一站管理',
    href: '/book',
    icon: Library,
    iconClass: 'bg-pastel-rose',
  },
];

// ---------------------------------------------------------------------------
// More features — 更多功能
// ---------------------------------------------------------------------------

interface MoreFeature {
  key: string;
  title: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}

const moreFeatures: MoreFeature[] = [
  {
    key: 'knowledge-graph',
    title: '知识图谱',
    desc: '可视化知识体系全景图',
    href: '/knowledge-graph',
    icon: Network,
    iconClass: 'bg-pastel-violet',
  },
  {
    key: 'knowledge',
    title: '知识库',
    desc: '管理文档和知识来源',
    href: '/knowledge',
    icon: Brain,
    iconClass: 'bg-pastel-blue',
  },
  {
    key: 'co-writer',
    title: '协作写作',
    desc: '与 AI 协同完成笔记',
    href: '/co-writer',
    icon: PenLine,
    iconClass: 'bg-pastel-amber',
  },
  {
    key: 'agents',
    title: '智能体',
    desc: '自定义 AI 助手',
    href: '/agents',
    icon: Bot,
    iconClass: 'bg-pastel-cyan',
  },
  {
    key: 'notebook',
    title: '笔记本',
    desc: '记录学习笔记',
    href: '/notebook',
    icon: NotebookPen,
    iconClass: 'bg-pastel-rose',
  },
];

// ---------------------------------------------------------------------------
// Learning stats type (mirrors backend LearningStatsResponse)
// ---------------------------------------------------------------------------

interface LearningStats {
  minutes: number;
  answered: number;
  accuracy: number;
  days: number;
  sessions: number;
  activeSessions: number;
  knowledgeBases: number;
  totalDocs: number;
  memoryEntries: number;
  weeklyChange: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const sessions = useSessionStore((s) => s.sessions);
  const knowledgeBases = useKnowledgeStore((s) => s.knowledgeBases);

  // Fetch real stats from backend API
  const [apiStats, setApiStats] = useState<LearningStats | null>(null);

  useEffect(() => {
    apiGet<LearningStats>('/api/v1/stats/learning')
      .then((data) => setApiStats(data))
      .catch((err) => {
        console.warn('Failed to load learning stats, using fallback:', err);
      });
  }, []);

  // Fallback: compute from frontend stores when API is unavailable
  const fallbackStats = useMemo(() => {
    const activeSessions = sessions.filter((s) => s.status === 'active').length;
    const totalDocs = knowledgeBases.reduce(
      (acc, kb) => acc + (kb.documentCount || 0),
      0,
    );

    return {
      minutes: 0,
      answered: 0,
      accuracy: 0,
      days: 0,
      sessions: sessions.length,
      activeSessions,
      knowledgeBases: knowledgeBases.length,
      totalDocs,
      memoryEntries: 0,
      weeklyChange: 0,
    };
  }, [sessions, knowledgeBases]);

  const stats = apiStats ?? fallbackStats;

  return (
    <div className="app-page-bg min-h-full pb-16">
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
        {/* =================================================================
            HERO + PROGRESS CARD
           ================================================================= */}
        <section className="relative grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Hero greeting */}
          <div className="surface-soft relative overflow-hidden p-7 lg:col-span-2 lg:p-10">
            {/* ambient orbs */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-cyan-200/30 blur-3xl" />

            <div className="relative">
              <p className="text-[13px] font-medium text-[var(--muted-foreground)]">
                晚上好，{user?.username ?? '同学'}
              </p>
              <h1 className="mt-3 text-[32px] font-bold leading-[1.15] tracking-tight text-[var(--foreground)] sm:text-[40px] lg:text-[44px]">
                欢迎回来，同学
                <br />
                继续{' '}
                <span className="text-gradient-brand">开始学习</span>
              </h1>
              <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-[var(--muted-foreground)]">
                夜深了，注意休息。用多维度个人画像生成符合用户真实学习情况的完整课程，通过答题情况反馈调整学习资源。
              </p>

              {/* CTA row */}
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/smartlearn"
                  className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-md shadow-blue-500/30 transition-all hover:shadow-lg hover:shadow-blue-500/40"
                >
                  开始学习
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-[13.5px] font-medium text-[var(--foreground)] transition-all hover:border-blue-300 hover:bg-blue-50/60"
                >
                  <MessagesSquare className="h-3.5 w-3.5 text-blue-500" />
                  问 AI 助教
                </Link>
              </div>

              {/* quick stats strip — same data as the right card, lighter */}
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[var(--muted-foreground)]">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-blue-500" />
                  今日活跃会话 <strong className="font-semibold text-[var(--foreground)]">{stats.activeSessions}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-violet-500" />
                  知识库 <strong className="font-semibold text-[var(--foreground)]">{stats.knowledgeBases}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  累计记忆 <strong className="font-semibold text-[var(--foreground)]">{stats.memoryEntries}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Progress card */}
          <div className="surface-soft relative overflow-hidden p-6">
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-cyan-200/40 blur-3xl" />

            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <p className="chip-primary">LEARNING PROGRESS</p>
                  <h3 className="mt-3 text-[15px] font-semibold text-[var(--foreground)]">
                    本周学习进度
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-[40px] font-bold leading-none text-gradient-brand">
                    {stats.accuracy.toFixed(1)}<span className="text-[20px]">%</span>
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <StatTile
                  icon={<Brain className="h-3.5 w-3.5" />}
                  iconClass="bg-pastel-blue"
                  value={stats.minutes}
                  unit="学习时长(分钟)"
                />
                <StatTile
                  icon={<ClipboardCheck className="h-3.5 w-3.5" />}
                  iconClass="bg-pastel-green"
                  value={stats.answered}
                  unit="答题数量"
                />
                <StatTile
                  icon={<Trophy className="h-3.5 w-3.5" />}
                  iconClass="bg-pastel-amber"
                  value={`${stats.accuracy.toFixed(1)}%`}
                  unit="正确率"
                />
                <StatTile
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  iconClass="bg-pastel-rose"
                  value={stats.days}
                  unit="学习天数"
                />
              </div>

              <div className={`mt-5 flex items-center gap-2 rounded-xl p-3 text-[12px] ${
                stats.weeklyChange >= 0
                  ? 'bg-blue-50/70 text-blue-700'
                  : 'bg-amber-50/70 text-amber-700'
              }`}>
                <TrendingUp className="h-3.5 w-3.5" />
                {stats.weeklyChange === 0
                  ? '本周暂无对比数据，继续加油！'
                  : stats.weeklyChange > 0
                    ? `较上周提升 ${stats.weeklyChange.toFixed(1)}%，继续加油！`
                    : `较上周下降 ${Math.abs(stats.weeklyChange).toFixed(1)}%，继续努力！`
                }
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            QUICK-ACTION CARDS (4 features)
           ================================================================= */}
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.key}
                  href={card.href}
                  className="group surface-soft relative flex flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/10"
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconClass}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[15px] font-semibold text-[var(--foreground)]">
                      {card.title}
                    </h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
                      {card.desc}
                    </p>
                  </div>
                  <div className="flex items-center justify-end text-[var(--muted-foreground)] transition-all group-hover:text-blue-600">
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* =================================================================
            MORE FEATURES — 更多功能
           ================================================================= */}
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">更多功能</h2>
            <span className="chip">MORE</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {moreFeatures.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className="group surface-soft flex items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/10"
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.iconClass}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">
                      {item.desc}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* =================================================================
            BOTTOM ROW — 左列(学习活跃度+待办清单) / 右列(最近动态)
           ================================================================= */}
        <section className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
          {/* 左列 */}
          <div className="flex flex-col gap-5 lg:col-span-2">
            {/* 学习活跃度 — GitHub 贡献热力图 */}
            <div className="surface-soft p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold text-[var(--foreground)]">
                  学习活跃度
                </h3>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600">
                    2026年累计 23 天
                  </span>
                  <span className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
                    近24周
                  </span>
                </div>
              </div>

              {/* 热力图 */}
              <div className="mt-4 overflow-x-auto">
                {/* 月份标签 */}
                <div className="mb-1 flex pl-7">
                  {['2月', '3月', '4月', '5月', '6月', '7月'].map((m, i) => (
                    <span key={m} className="text-[10px] text-[var(--muted-foreground)]" style={{ width: `${(i === 0 ? 2 : 4) * 13}px` }}>
                      {m}
                    </span>
                  ))}
                </div>
                <div className="flex gap-0">
                  {/* 星期标签 */}
                  <div className="mr-1.5 flex flex-col gap-[3px]">
                    {['一', '', '三', '', '五', '', '日'].map((d, i) => (
                      <span key={i} className="flex h-[10px] w-5 items-center text-[9px] leading-none text-[var(--muted-foreground)]">
                        {d}
                      </span>
                    ))}
                  </div>
                  {/* 格子区域: 24周 × 7天 */}
                  <div className="flex gap-[3px]">
                    {Array.from({ length: 24 }, (_, week) => (
                      <div key={week} className="flex flex-col gap-[3px]">
                        {Array.from({ length: 7 }, (_, day) => {
                          // 假数据: 4月前无活动，之后稀疏出现
                          const seed = (week * 7 + day) * 2654435761;
                          const hash = ((seed >>> 16) ^ seed) & 0xff;
                          let level = 0;
                          if (week >= 9) {
                            // 4月起才有活动，且频率较低
                            if (hash % 10 < 3) {
                              level = (hash % 3) + 1; // 1-3，不会出现4
                            }
                          }
                          const colors = [
                            'bg-gray-100',
                            'bg-teal-100',
                            'bg-teal-300',
                            'bg-teal-500',
                            'bg-teal-700',
                          ];
                          return (
                            <div
                              key={day}
                              className={`h-[10px] w-[10px] rounded-[2px] ${colors[level]}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                {/* 图例 */}
                <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-[var(--muted-foreground)]">
                  <span>少</span>
                  <div className="h-[10px] w-[10px] rounded-[2px] bg-gray-100" />
                  <div className="h-[10px] w-[10px] rounded-[2px] bg-teal-100" />
                  <div className="h-[10px] w-[10px] rounded-[2px] bg-teal-300" />
                  <div className="h-[10px] w-[10px] rounded-[2px] bg-teal-500" />
                  <div className="h-[10px] w-[10px] rounded-[2px] bg-teal-700" />
                  <span>多</span>
                </div>
              </div>

              {/* 连续学习 */}
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-orange-50 px-3.5 py-2.5">
                <Flame className="h-4 w-4 text-orange-500" />
                <span className="text-[12.5px] font-medium text-orange-700">
                  连续学习 <strong>7</strong> 天
                </span>
              </div>
            </div>

            {/* 待办清单 */}
            <div className="surface-soft flex-1 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold text-[var(--foreground)]">
                  待办清单
                </h3>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[12px] font-semibold text-blue-600">
                  2/4
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                {[
                  { text: '完成数据清洗专题练习（第4章）', done: true },
                  { text: '完成数据清洗章节的ppt学习', done: true },
                  { text: '完成 CNN 章节测试题', done: false },
                  { text: '阅读 Transformer 扩展材料', done: false },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 transition-colors hover:bg-blue-50/30"
                  >
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                    )}
                    <span
                      className={`text-[13px] leading-snug ${
                        item.done
                          ? 'text-[var(--muted-foreground)] line-through'
                          : 'text-[var(--foreground)]'
                      }`}
                    >
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 右列 — 最近动态 */}
          <div className="surface-soft p-6 lg:col-span-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[var(--foreground)]">
                最近动态
              </h3>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-medium text-emerald-600">
                共 5 条
              </span>
            </div>

            <div className="relative mt-5 space-y-0 pl-6">
              {/* 时间线竖线 */}
              <div className="absolute bottom-3 left-[8px] top-3 w-px bg-blue-100" />

              {[
                { text: '完成了「神经网络入门」章节学习', date: '2026-07-29' },
                { text: '完成了「神经网络入门」章节测试，正确率 85%', date: '2026-07-27' },
                { text: '学习了「反向传播」视频课程', date: '2026-07-26' },
                { text: '生成了「神经网络入门」扩展阅读', date: '2026-07-25' },
                { text: '创建了「机器学习」知识库', date: '2026-07-24' },
              ].map((item, idx) => (
                <div key={idx} className="relative flex items-start gap-3 pb-5 last:pb-0">
                  {/* 时间线圆点 */}
                  <div className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center">
                    <div className={`h-2.5 w-2.5 rounded-full ${idx === 0 ? 'bg-blue-500 ring-2 ring-blue-100' : 'bg-blue-200'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <p className="text-[13px] leading-snug text-[var(--foreground)]">
                        {item.text}
                      </p>
                    </div>
                    <p className="mt-1 flex items-center gap-1 pl-5.5 text-[11px] text-[var(--muted-foreground)]">
                      <Clock className="h-3 w-3" />
                      {item.date}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable bits
// ---------------------------------------------------------------------------

function StatTile({
  icon,
  iconClass,
  value,
  unit,
}: {
  icon: React.ReactNode;
  iconClass: string;
  value: number | string;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-3.5">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconClass}`}
        >
          {icon}
        </div>
        <span className="text-[18px] font-semibold text-[var(--foreground)]">
          {value}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] text-[var(--muted-foreground)]">
        {unit}
      </p>
    </div>
  );
}


