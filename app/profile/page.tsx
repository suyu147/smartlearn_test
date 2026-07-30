'use client'

import { useMemo } from 'react'
import {
  Clock,
  CheckCircle2,
  Target,
  Award,
  Flame,
  TrendingUp,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
} from 'recharts'

// ─── 机器学习主题假数据 ───

const METRICS = [
  { icon: Clock, label: '学习时长', value: '23.5h', color: '#6366f1' },
  { icon: CheckCircle2, label: '完成题目', value: '186题', color: '#10b981' },
  { icon: Target, label: '正确率', value: '72%', color: '#f59e0b' },
  { icon: Award, label: '获得成就', value: '12个', color: '#ef4444' },
]

// 能力维度掌握程度 - 柱状图数据
const DIMENSION_DATA = [
  { subject: '线性代数', 理论知识: 78, 编程实践: 65, 问题解决: 60, 创新能力: 55, 自主学习: 80, 投入时长: 18 },
  { subject: '概率统计', 理论知识: 82, 编程实践: 58, 问题解决: 63, 创新能力: 50, 自主学习: 75, 投入时长: 15 },
  { subject: '机器学习', 理论知识: 71, 编程实践: 76, 问题解决: 68, 创新能力: 62, 自主学习: 85, 投入时长: 22 },
  { subject: '深度学习', 理论知识: 65, 编程实践: 72, 问题解决: 70, 创新能力: 68, 自主学习: 78, 投入时长: 20 },
  { subject: '数据结构', 理论知识: 80, 编程实践: 82, 问题解决: 75, 创新能力: 58, 自主学习: 72, 投入时长: 12 },
  { subject: 'Python', 理论知识: 68, 编程实践: 88, 问题解决: 72, 创新能力: 60, 自主学习: 90, 投入时长: 16 },
]

// 六维能力雷达
const RADAR_DATA = [
  { dimension: '理论知识', value: 74, fullMark: 100 },
  { dimension: '编程实践', value: 73, fullMark: 100 },
  { dimension: '问题解决', value: 68, fullMark: 100 },
  { dimension: '创新能力', value: 59, fullMark: 100 },
  { dimension: '自主学习', value: 80, fullMark: 100 },
  { dimension: '持续坚持', value: 76, fullMark: 100 },
]

// 学习投入分布 - 饼图
const PIE_DATA = [
  { name: '理论学习', value: 30, color: '#6366f1' },
  { name: '编程实践', value: 28, color: '#10b981' },
  { name: '项目实战', value: 18, color: '#f59e0b' },
  { name: '论文阅读', value: 12, color: '#ef4444' },
  { name: '讨论交流', value: 7, color: '#8b5cf6' },
  { name: '复习总结', value: 5, color: '#06b6d4' },
]

// 各科目掌握进度
const PROGRESS_DATA = [
  { name: '线性代数', progress: 78 },
  { name: '概率统计', progress: 72 },
  { name: '机器学习', progress: 68 },
  { name: '深度学习', progress: 62 },
  { name: '数据结构', progress: 82 },
  { name: 'Python', progress: 88 },
]

// 学习投入趋势（最近7天）
const TREND_DATA = [
  { day: '周一', hours: 3.2 },
  { day: '周二', hours: 4.1 },
  { day: '周三', hours: 2.8 },
  { day: '周四', hours: 5.0 },
  { day: '周五', hours: 3.6 },
  { day: '周六', hours: 6.2 },
  { day: '周日', hours: 4.5 },
]

// 学习时段分布
const TIME_SLOT_DATA = [
  { slot: '6-8', hours: 0.5 },
  { slot: '8-10', hours: 2.8 },
  { slot: '10-12', hours: 3.5 },
  { slot: '12-14', hours: 1.0 },
  { slot: '14-16', hours: 2.2 },
  { slot: '16-18', hours: 1.8 },
  { slot: '18-20', hours: 2.5 },
  { slot: '20-22', hours: 4.2 },
  { slot: '22-24', hours: 2.0 },
]

// 学习打卡日历（当月）
const CHECKIN_DAYS = [1, 2, 3, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29]

// ─── 子组件 ───

function MetricCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-4">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div>
        <div className="text-xl font-bold text-[var(--foreground)]">{value}</div>
        <div className="text-[12px] text-[var(--muted-foreground)]">{label}</div>
      </div>
    </div>
  )
}

function SectionCard({ title, children, className = '' }: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 ${className}`}>
      <h3 className="mb-4 text-[14px] font-semibold text-[var(--foreground)]">{title}</h3>
      {children}
    </div>
  )
}

function CheckinCalendar() {
  const today = 29
  const daysInMonth = 31
  const firstDayOfWeek = 2 // 本月1号是周三（0=周日）

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--muted-foreground)]">2026年7月</span>
        <div className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          <span>连续 <strong className="text-[var(--foreground)]">7</strong> 天</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
          <div key={d} className="py-1 text-[10px] text-[var(--muted-foreground)]">{d}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className="flex items-center justify-center">
            {day ? (
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${
                  CHECKIN_DAYS.includes(day)
                    ? 'bg-[var(--primary)] text-white'
                    : day === today
                      ? 'border border-[var(--primary)] text-[var(--primary)]'
                      : 'text-[var(--muted-foreground)]'
                }`}
              >
                {day}
              </div>
            ) : (
              <div className="h-6 w-6" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
        <span>本月打卡 <strong className="text-[var(--foreground)]">{CHECKIN_DAYS.length}</strong> 天</span>
        <span>累计 <strong className="text-[var(--foreground)]">89</strong> 天</span>
      </div>
    </div>
  )
}

function ProgressBar({ name, progress }: { name: string; progress: number }) {
  const color = progress >= 80 ? '#10b981' : progress >= 65 ? '#6366f1' : '#f59e0b'
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[12px] text-[var(--muted-foreground)]">{name}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[12px] font-semibold text-[var(--foreground)]">
        {progress}%
      </span>
    </div>
  )
}

// ─── 主页面 ───

export default function ProfilePage() {
  const chartColors = useMemo(() => ({
    理论知识: '#6366f1',
    编程实践: '#10b981',
    问题解决: '#ef4444',
    创新能力: '#f59e0b',
    自主学习: '#3b82f6',
    投入时长: '#8b5cf6',
  }), [])

  return (
    <div className="h-full overflow-y-auto bg-[var(--background)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-8 py-6">
        <h1 className="text-xl font-bold text-[var(--foreground)]">学习画像</h1>
        <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
          全面展示学生的学习状况 · 机器学习方向
        </p>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* 顶部指标卡片 */}
        <div className="grid grid-cols-4 gap-4">
          {METRICS.map((m) => (
            <MetricCard key={m.label} {...m} />
          ))}
        </div>

        {/* 主体区域：左侧图表 + 右侧面板 */}
        <div className="grid grid-cols-4 gap-4">
          {/* 左侧 3/4 */}
          <div className="col-span-3 space-y-4">
            {/* 能力维度掌握程度 - 组合图 */}
            <SectionCard title="能力维度掌握程度">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={DIMENSION_DATA} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} domain={[0, 100]} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} domain={[0, 30]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar yAxisId="left" dataKey="理论知识" fill={chartColors.理论知识} radius={[2, 2, 0, 0]} barSize={10} />
                    <Bar yAxisId="left" dataKey="编程实践" fill={chartColors.编程实践} radius={[2, 2, 0, 0]} barSize={10} />
                    <Bar yAxisId="left" dataKey="问题解决" fill={chartColors.问题解决} radius={[2, 2, 0, 0]} barSize={10} />
                    <Bar yAxisId="left" dataKey="创新能力" fill={chartColors.创新能力} radius={[2, 2, 0, 0]} barSize={10} />
                    <Bar yAxisId="left" dataKey="自主学习" fill={chartColors.自主学习} radius={[2, 2, 0, 0]} barSize={10} />
                    <Line yAxisId="right" type="monotone" dataKey="投入时长" stroke={chartColors.投入时长} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            {/* 下方三图 */}
            <div className="grid grid-cols-3 gap-4">
              {/* 六维能力雷达 */}
              <SectionCard title="六维能力雷达">
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={RADAR_DATA} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Radar
                        name="能力值"
                        dataKey="value"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              {/* 学习投入分布 */}
              <SectionCard title="学习投入分布">
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={PIE_DATA}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {PIE_DATA.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number, name: string) => [`${value}%`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {PIE_DATA.map((item) => (
                    <div key={item.name} className="flex items-center gap-1.5 text-[10px]">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[var(--muted-foreground)]">{item.name}</span>
                      <span className="ml-auto font-medium text-[var(--foreground)]">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* 各科目掌握进度 */}
              <SectionCard title="各科目掌握进度">
                <div className="space-y-3.5 pt-1">
                  {PROGRESS_DATA.map((item) => (
                    <ProgressBar key={item.name} {...item} />
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>

          {/* 右侧 1/4 面板 */}
          <div className="col-span-1 space-y-4">
            {/* 学习打卡 */}
            <SectionCard title="学习打卡">
              <CheckinCalendar />
            </SectionCard>

            {/* 学习投入趋势 */}
            <SectionCard title="学习投入趋势">
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={TREND_DATA} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} domain={[0, 8]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number) => [`${value}h`, '学习时长']}
                    />
                    <Line type="monotone" dataKey="hours" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            {/* 学习时段分布 */}
            <SectionCard title="学习时段分布">
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={TIME_SLOT_DATA} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis dataKey="slot" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number) => [`${value}h`, '时长']}
                    />
                    <Bar dataKey="hours" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            {/* AI 学习建议 */}
            <SectionCard title="AI 学习建议">
              <div className="space-y-3">
                <div className="rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/15 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-[var(--primary)]" />
                    <span className="text-[12px] font-semibold text-[var(--foreground)]">深度学习需加强</span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                    建议重点复习 CNN、Transformer 架构，配合 PyTorch 实践项目巩固。
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--success)]/5 border border-[var(--success)]/15 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                    <span className="text-[12px] font-semibold text-[var(--foreground)]">Python 掌握优秀</span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                    编程基础扎实，可尝试阅读 scikit-learn 源码提升工程能力。
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--warning)]/5 border border-[var(--warning)]/15 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Target className="h-3.5 w-3.5 text-[var(--warning)]" />
                    <span className="text-[12px] font-semibold text-[var(--foreground)]">创新能力待提升</span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                    多阅读顶会论文（NeurIPS/ICML），尝试复现并改进方法。
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  )
}
