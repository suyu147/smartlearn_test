'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  MessagesSquare,
  Trophy,
  CalendarDays,
  BookOpen,
  ClipboardCheck,
  Library,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Zap,
  TrendingUp,
  GraduationCap,
  PenLine,
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
            BOTTOM ROW — Knowledge Graph + Overview
           ================================================================= */}
        <section className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Knowledge graph */}
          <div className="surface-soft relative overflow-hidden p-6 lg:col-span-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="chip-primary">KNOWLEDGE BASE</p>
                <h3 className="mt-2 text-[18px] font-semibold text-[var(--foreground)]">
                  知识库总览
                </h3>
                <p className="mt-1 text-[12.5px] text-[var(--muted-foreground)]">
                  已构建 {stats.knowledgeBases} 个知识库，覆盖 {stats.totalDocs} 份文档
                </p>
              </div>
              <Link
                href="/knowledge"
                className="inline-flex items-center gap-1 rounded-full bg-gradient-brand px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm shadow-blue-500/30 transition-all hover:shadow-md"
              >
                查看全部
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-5">
              <KnowledgeNameList knowledgeBases={knowledgeBases} />
            </div>
          </div>

          {/* Overview / learning status */}
          <div className="surface-soft p-6">
            <p className="chip-primary">OVERVIEW</p>
            <h3 className="mt-2 text-[18px] font-semibold text-[var(--foreground)]">
              学习状态
            </h3>

            <div className="mt-5 space-y-3">
              <OverviewRow
                icon={<Brain className="h-3.5 w-3.5" />}
                iconClass="bg-pastel-blue"
                label="学习时长(分钟)"
                value={stats.minutes}
                accent="text-blue-600"
              />
              <OverviewRow
                icon={<ClipboardCheck className="h-3.5 w-3.5" />}
                iconClass="bg-pastel-green"
                label="答题数量"
                value={stats.answered}
                accent="text-emerald-600"
              />
              <OverviewRow
                icon={<Trophy className="h-3.5 w-3.5" />}
                iconClass="bg-pastel-amber"
                label="正确率"
                value={`${stats.accuracy.toFixed(1)}%`}
                accent="text-amber-600"
              />
              <OverviewRow
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                iconClass="bg-pastel-rose"
                label="学习天数"
                value={stats.days}
                accent="text-rose-600"
              />
            </div>

            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-blue-600" />
                <p className="text-[12.5px] font-semibold text-blue-900">下一步建议</p>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-blue-800/80">
                根据你的进度，推荐先做 <strong>栈与队列</strong> 章节的 5 道小题，再完成 1 个代码挑战。
              </p>
              <Link
                href="/playground"
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
              >
                前往练习
                <ArrowRight className="h-3 w-3" />
              </Link>
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

function OverviewRow({
  icon,
  iconClass,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white p-3.5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconClass}`}
        >
          {icon}
        </div>
        <span className="text-[13px] text-[var(--muted-foreground)]">
          {label}
        </span>
      </div>
      <span className={`text-[18px] font-semibold ${accent}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Knowledge base name list
// ---------------------------------------------------------------------------

function KnowledgeNameList({
  knowledgeBases,
}: {
  knowledgeBases: { id: string; name: string }[];
}) {
  if (knowledgeBases.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-white/60">
        <p className="text-[13px] text-[var(--muted-foreground)]">
          暂未导入知识库，前往添加
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {knowledgeBases.map((kb) => (
        <div
          key={kb.id}
          className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 transition-colors hover:bg-blue-50/40"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pastel-blue">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="text-[13.5px] font-medium text-[var(--foreground)]">
            {kb.name}
          </span>
        </div>
      ))}
    </div>
  );
}
