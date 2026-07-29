'use client';

import {
  MessageSquare,
  GraduationCap,
  BookOpen,
  Database,
  Brain,
  TrendingUp,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useSessionStore } from '@/lib/store/session-store';
import { useKnowledgeStore } from '@/lib/store/knowledge-store';
import { useMemoryStore } from '@/lib/store/memory-store';
import { useChatStore } from '@/lib/store/chat-store';

// ---------------------------------------------------------------------------
// Space (Dashboard) Page
// ---------------------------------------------------------------------------

export default function SpacePage() {
  const sessions = useSessionStore((s) => s.sessions);
  const knowledgeBases = useKnowledgeStore((s) => s.knowledgeBases);
  const memoryEntries = useMemoryStore((s) => s.entries);
  const chatMessages = useChatStore((s) => s.messages);

  // Compute stats
  const totalSessions = sessions.length;
  const activeSessions = sessions.filter((s) => s.status === 'active').length;
  const totalKBs = knowledgeBases.length;
  const totalDocs = knowledgeBases.reduce((acc, kb) => acc + kb.documentCount, 0);
  const totalMemories = memoryEntries.length;
  const totalMessages = chatMessages.length;

  // Quick actions
  const quickActions = [
    {
      label: '新对话',
      description: '与 AI 开始对话',
      href: '/chat',
      icon: MessageSquare,
      color: 'bg-pastel-blue',
    },
    {
      label: '智慧学习',
      description: '构建学习画像和学习路径',
      href: '/smartlearn',
      icon: GraduationCap,
      color: 'bg-pastel-green',
    },
    {
      label: '知识库',
      description: '管理你的知识库',
      href: '/knowledge',
      icon: Database,
      color: 'bg-pastel-amber',
    },
    {
      label: 'AI 课本',
      description: '创建 AI 生成的课本',
      href: '/book',
      icon: BookOpen,
      color: 'bg-pastel-rose',
    },
  ];

  return (
    <div className="app-page-bg min-h-full pb-16">
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <p className="chip-primary">WORKSPACE</p>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-[var(--foreground)] sm:text-[32px]">
            工作台
          </h1>
          <p className="mt-1.5 text-[13.5px] text-[var(--muted-foreground)]">
            你的学习工作台和近期活动概览
          </p>
        </div>

        <div className="space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="会话"
              value={totalSessions}
              subtitle={`${activeSessions} 活跃`}
              icon={MessageSquare}
              tone="blue"
            />
            <StatCard
              label="知识库"
              value={totalKBs}
              subtitle={`${totalDocs} 文档`}
              icon={Database}
              tone="amber"
            />
            <StatCard
              label="记忆"
              value={totalMemories}
              subtitle="跨 L1/L2/L3"
              icon={Brain}
              tone="violet"
            />
            <StatCard
              label="消息"
              value={totalMessages}
              subtitle="累计交互"
              icon={Zap}
              tone="rose"
            />
          </div>

          {/* Quick Actions */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
                快捷操作
              </h2>
              <span className="text-[12px] text-[var(--muted-foreground)]">
                常用入口
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="surface-soft group flex flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/10"
                  >
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', action.color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
                        {action.label}
                      </h3>
                      <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                        {action.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-end text-[var(--muted-foreground)] transition-all group-hover:text-blue-600">
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Knowledge Base Summary */}
          {knowledgeBases.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
                  知识库
                </h2>
                <Link
                  href="/knowledge"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  管理
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {knowledgeBases.slice(0, 4).map((kb) => (
                  <div
                    key={kb.id}
                    className="surface-soft p-5"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
                        {kb.name}
                      </h3>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                          kb.indexStatus === 'ready'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700',
                        )}
                      >
                        {kb.indexStatus === 'ready' ? '就绪' : kb.indexStatus}
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--muted-foreground)]">
                      {kb.documentCount} 文档 · {kb.blockCount} 块
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card Component
// ---------------------------------------------------------------------------

type Tone = 'blue' | 'green' | 'amber' | 'violet' | 'rose';

const toneToPastel: Record<Tone, string> = {
  blue: 'bg-pastel-blue',
  green: 'bg-pastel-green',
  amber: 'bg-pastel-amber',
  violet: 'bg-pastel-violet',
  rose: 'bg-pastel-rose',
};

interface StatCardProps {
  label: string;
  value: number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
}

function StatCard({ label, value, subtitle, icon: Icon, tone = 'blue' }: StatCardProps) {
  return (
    <div className="surface-soft p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneToPastel[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <TrendingUp className="h-3.5 w-3.5 text-[var(--muted-foreground)] opacity-50" />
      </div>
      <p className="text-[26px] font-bold tracking-tight text-[var(--foreground)]">{value}</p>
      <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">{subtitle}</p>
      <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)] opacity-70">{label}</p>
    </div>
  );
}
