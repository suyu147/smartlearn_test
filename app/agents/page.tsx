'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  Lightbulb,
  HelpCircle,
  Search as SearchIcon,
  BarChart3,
  MessageSquare,
  GraduationCap,
  BookOpen,
  Code2,
  Loader2,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  type: 'loop' | 'agent' | 'pipeline' | 'graph';
  tools: string[];
  icon: React.ComponentType<{ className?: string }>;
}

// ---------------------------------------------------------------------------
// Built-in agents catalog (synced with bootstrap.ts capabilities)
// ---------------------------------------------------------------------------

const BUILTIN_AGENTS: AgentInfo[] = [
  {
    id: 'chat',
    name: '对话助手',
    description:
      '通用对话助手，具备网络搜索、推理和知识检索能力。',
    type: 'loop',
    tools: ['brainstorm', 'reason', 'web_search', 'web_fetch', 'ask_user', 'rag'],
    icon: MessageSquare,
  },
  {
    id: 'deep_solve',
    name: '深度解题',
    description:
      '多步骤问题求解器，制定计划、逐步执行并综合回答。',
    type: 'loop',
    tools: [
      'solve_plan',
      'solve_finish_step',
      'solve_replan',
      'brainstorm',
      'reason',
      'rag',
      'code_execution',
    ],
    icon: Lightbulb,
  },
  {
    id: 'mastery_path',
    name: '掌握路径',
    description:
      '自适应学习路径构建器，提供测验、评分和技能掌握度追踪。',
    type: 'loop',
    tools: [
      'mastery_status',
      'mastery_quiz',
      'mastery_grade',
      'mastery_assess',
      'mastery_build',
    ],
    icon: GraduationCap,
  },
  {
    id: 'explore_context',
    name: '知识探索',
    description:
      '跨文档和多来源的深度知识探索，支持多角度发现。',
    type: 'loop',
    tools: ['read_source', 'rag', 'web_search', 'web_fetch', 'brainstorm', 'reason'],
    icon: SearchIcon,
  },
  {
    id: 'deep_question',
    name: '深度出题',
    description:
      '教育题目生成器，用于测验、练习题和学习指南。',
    type: 'loop',
    tools: [
      'brainstorm',
      'reason',
      'rag',
      'web_search',
      'web_fetch',
      'code_execution',
      'paper_search',
    ],
    icon: HelpCircle,
  },
  {
    id: 'deep_research',
    name: '深度研究',
    description:
      '多阶段研究智能体，分解主题、逐一研究并综合报告。',
    type: 'loop',
    tools: [
      'rag',
      'web_search',
      'web_fetch',
      'paper_search',
      'code_execution',
      'reason',
      'brainstorm',
    ],
    icon: BookOpen,
  },
  {
    id: 'visualize',
    name: '数据可视化',
    description:
      '可视化管线，从数据生成图表、图示和交互式视觉内容。',
    type: 'pipeline',
    tools: ['code_execution'],
    icon: BarChart3,
  },
];

// ---------------------------------------------------------------------------
// Agents Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>(BUILTIN_AGENTS);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [filter, setFilter] = useState<'all' | 'loop' | 'agent' | 'pipeline' | 'graph'>('all');

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      try {
        const data = await apiGet<{ agents: AgentInfo[] }>('/api/v1/agents');
        // Merge with built-in (API may return MCP agents or custom ones)
        if (data.agents && data.agents.length > 0) {
          const merged = [...BUILTIN_AGENTS];
          for (const apiAgent of data.agents) {
            if (!merged.find((a) => a.id === apiAgent.id)) {
              merged.push({ ...apiAgent, icon: Bot });
            }
          }
          setAgents(merged);
        }
      } catch {
        // API not available — fall back to built-in catalog
      } finally {
        setLoading(false);
      }
    };

    // Try to fetch dynamic agent list from API
    fetchAgents();
  }, []);

  const filteredAgents =
    filter === 'all' ? agents : agents.filter((a) => a.type === filter);

  const typeFilters = [
    { id: 'all', label: '全部' },
    { id: 'loop', label: '循环' },
    { id: 'agent', label: '智能体' },
    { id: 'pipeline', label: '管线' },
    { id: 'graph', label: '图谱' },
  ];

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'loop':
        return 'bg-[var(--primary)]/10 text-[var(--primary)]';
      case 'agent':
        return 'bg-[var(--success)]/10 text-[var(--success)]';
      case 'pipeline':
        return 'bg-[var(--warning)]/10 text-[var(--warning)]';
      case 'graph':
        return 'bg-[var(--destructive)]/10 text-[var(--destructive)]';
      default:
        return 'bg-[var(--muted)] text-[var(--muted-foreground)]';
    }
  };

  return (
    <div className="flex h-full bg-[var(--background)]">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[var(--foreground)]">
                智能体
              </h1>
              <p className="text-[13px] text-[var(--muted-foreground)] mt-1">
                {agents.length} 个可用能力
              </p>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="border-b border-[var(--border)] px-6">
          <div className="flex gap-1">
            {typeFilters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as typeof filter)}
                className={cn(
                  'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors',
                  filter === f.id
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Agent Cards */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-[var(--primary)] animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAgents.map((agent) => {
                const Icon = agent.icon;
                const isSelected = selectedAgent?.id === agent.id;
                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className={cn(
                      'bg-[var(--card)] border rounded-xl p-5 cursor-pointer transition-all',
                      isSelected
                        ? 'border-[var(--primary)] shadow-sm shadow-[var(--primary)]/10'
                        : 'border-[var(--border)] hover:border-[var(--primary)]/50',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-[var(--muted)]">
                        <Icon className="h-5 w-5 text-[var(--primary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
                            {agent.name}
                          </h3>
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-medium capitalize',
                              getTypeColor(agent.type),
                            )}
                          >
                            {agent.type}
                          </span>
                        </div>
                        <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed line-clamp-2">
                          {agent.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel — Agent Details */}
      <div className="w-80 border-l border-[var(--border)] bg-[var(--card)] overflow-y-auto">
        <div className="p-4">
          {selectedAgent ? (
            <div className="space-y-4">
              {/* Agent Header */}
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-[var(--muted)]">
                  <selectedAgent.icon className="h-6 w-6 text-[var(--primary)]" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
                    {selectedAgent.name}
                  </h2>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-medium capitalize',
                      getTypeColor(selectedAgent.type),
                    )}
                  >
                    {selectedAgent.type} 能力
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="bg-[var(--background)] rounded-lg p-3">
                <p className="text-[12px] text-[var(--foreground)] leading-relaxed">
                  {selectedAgent.description}
                </p>
              </div>

              {/* Tools */}
              <div className="space-y-2">
                <h3 className="text-[12px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                  工具 ({selectedAgent.tools.length})
                </h3>
                <div className="space-y-1.5">
                  {selectedAgent.tools.map((tool) => (
                    <div
                      key={tool}
                      className="bg-[var(--background)] rounded-lg p-2.5 flex items-center gap-2"
                    >
                      <Code2 className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      <span className="text-[12px] text-[var(--foreground)]">
                        {tool}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3">
                <Info className="h-4 w-4 text-[var(--primary)] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[var(--foreground)] leading-relaxed">
                  在对话页面点击功能标签即可选择此智能体。
                  智能体将使用其配置的工具来处理你的消息。
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bot className="h-12 w-12 text-[var(--muted-foreground)] mx-auto mb-4 opacity-30" />
              <p className="text-[13px] text-[var(--muted-foreground)]">
                选择一个智能体查看其详情、工具和使用说明。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
