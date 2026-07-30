'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Brain,
  Target,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Flame,
  Calendar,
  Clock,
  Award,
  BookOpen,
  Lightbulb,
  Zap,
  Eye,
  Code,
  FileText,
  Video,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLearningProfileStore } from '@/lib/store/learning-profile'
import { useAuthStore } from '@/lib/store/auth-store'
import { apiFetch } from '@/lib/api-client'

// ─── API Response Types ───

interface SkillMapEntry {
  topic: string
  mastery: number
  lastReviewed?: string
  lastPracticed?: string
  reviewCount?: number
  attempts?: number
}

interface QuizStats {
  totalAttempts: number
  correctCount: number
  errorCount: number
  accuracy: number | null
}

interface RecentQuizAttempt {
  topic: string
  question: string
  correct: boolean
  difficulty: number
  userAnswer: string
  correctAnswer: string
  createdAt: string
}

interface ProfileSnapshot {
  profile: {
    dimensions: {
      knowledgeBase?: { subjects?: Array<{ name: string; mastery: number }> }
    }
  }
  analytics: {
    skillMap: { entries: SkillMapEntry[] }
    weakTopics: string[]
    strongTopics: string[]
    schedule: Array<{ topic: string; dueDate: string; priority: number }>
  }
  weakPoints: Array<{ topic: string; mastery: number; priority: number; attempts: number; errors: number }>
  errors: Array<{ topic: string; count: number; latestAt: string }>
  recentSessions: Array<{
    quizResults: Array<{
      topic: string
      question: string
      correct: boolean
      difficulty: number
      userAnswer: string
      correctAnswer: string
    }>
  }>
  quizStats: QuizStats
  recentQuizAttempts: RecentQuizAttempt[]
}

interface ErrorRecord {
  question: string
  topic: string
  correct: boolean
  userAnswer: string
  correctAnswer: string
  difficulty: number
  timestamp: string
}

interface ErrorsApiData {
  recent: ErrorRecord[]
  total: number
  correctCount: number
  errorCount: number
  accuracy: number | null
}

interface WeakPointEntry {
  topic: string
  mastery: number
  errorRate: number
  attempts: number
  errors: number
  severity: 'high' | 'medium' | 'low'
}

// ─── Helpers ───

const SUBJECT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '线性代数': BookOpen,
  '概率统计': Target,
  '数据结构': Code,
  '机器学习': Brain,
  '离散数学': FileText,
  '计算机视觉': Eye,
  'default': BookOpen,
}

const FORMAT_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  document: { label: '文档学习', icon: FileText },
  video: { label: '视频学习', icon: Video },
  code: { label: '动手实践', icon: Code },
  quiz: { label: '测验练习', icon: Target },
  mindmap: { label: '思维导图', icon: Brain },
}

const TIME_SLOT_LABELS: Record<string, string> = {
  morning: '晨间高效',
  afternoon: '午后专注',
  evening: '晚间学习',
  night: '夜间学习',
}

function getSubjectIcon(name: string) {
  const Icon = SUBJECT_ICONS[name] ?? SUBJECT_ICONS['default']!
  return Icon
}

function getMasteryColor(v: number): string {
  if (v >= 75) return 'bg-[var(--success)]'
  if (v >= 60) return 'bg-[var(--info)]'
  if (v >= 45) return 'bg-[var(--warning)]'
  return 'bg-[var(--destructive)]'
}

function getSeverityStyle(s: 'high' | 'medium' | 'low') {
  return s === 'high'
    ? 'bg-[var(--destructive)]/10 text-[var(--destructive)] border-[var(--destructive)]/20'
    : s === 'medium'
      ? 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20'
      : 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/20'
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

// ─── Radar Chart (SVG) ───

interface RadarDimension {
  label: string
  value: number
  desc?: string
}

function RadarChart({ data, size = 220 }: { data: RadarDimension[]; size?: number }) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 30
  const levels = 4
  const angleStep = (2 * Math.PI) / data.length

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2
    const dist = (value / 100) * r
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) }
  }

  const polygonPoints = data
    .map((d, i) => {
      const p = getPoint(i, d.value)
      return `${p.x},${p.y}`
    })
    .join(' ')

  return (
    <svg width={size} height={size} className="mx-auto">
      {Array.from({ length: levels }).map((_, li) => {
        const lvl = ((li + 1) / levels) * r
        const pts = data
          .map((_, i) => {
            const angle = angleStep * i - Math.PI / 2
            return `${cx + lvl * Math.cos(angle)},${cy + lvl * Math.sin(angle)}`
          })
          .join(' ')
        return (
          <polygon
            key={li}
            points={pts}
            fill="none"
            stroke="var(--border)"
            strokeWidth={0.8}
            opacity={0.6}
          />
        )
      })}

      {data.map((_, i) => {
        const p = getPoint(i, 100)
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="var(--border)"
            strokeWidth={0.5}
            opacity={0.5}
          />
        )
      })}

      <polygon
        points={polygonPoints}
        fill="var(--primary)"
        fillOpacity={0.15}
        stroke="var(--primary)"
        strokeWidth={1.5}
      />

      {data.map((d, i) => {
        const p = getPoint(i, d.value)
        const labelP = getPoint(i, 115)
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill="var(--primary)" />
            <text
              x={labelP.x}
              y={labelP.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-[10px]"
              fill="var(--muted-foreground)"
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Mastery Bar ───

function MasteryBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 w-full bg-[var(--muted)] rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

// ─── Main Page ───

export default function ProfilePage() {
  const profile = useLearningProfileStore((s) => s.profile)
  const syncFromServer = useLearningProfileStore((s) => s.syncFromServer)
  const user = useAuthStore((s) => s.user)

  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const userId = user?.id ?? 'anonymous'
  const errorsData: ErrorsApiData = useMemo(() => {
    const stats = snapshot?.quizStats
    // Use recentQuizAttempts with real timestamps (all attempts, not just errors)
    const recent = (snapshot?.recentQuizAttempts ?? []).map((a) => ({
      question: a.question,
      topic: a.topic,
      correct: a.correct,
      userAnswer: a.userAnswer,
      correctAnswer: a.correctAnswer,
      difficulty: a.difficulty,
      timestamp: a.createdAt,
    }))

    return {
      recent,
      total: stats?.totalAttempts ?? 0,
      correctCount: stats?.correctCount ?? 0,
      errorCount: stats?.errorCount ?? 0,
      accuracy: stats?.accuracy ?? null,
    }
  }, [snapshot])
  const weakPointsData = useMemo<WeakPointEntry[]>(() => {
    return (snapshot?.weakPoints ?? []).map((point) => ({
      topic: point.topic,
      mastery: Math.round(point.mastery * 100),
      errorRate: point.attempts > 0 ? Math.round((point.errors / point.attempts) * 100) : Math.round((1 - point.mastery) * 100),
      attempts: point.attempts,
      errors: point.errors,
      severity: point.mastery < 0.35 ? 'high' : point.mastery < 0.5 ? 'medium' : 'low',
    }))
  }, [snapshot])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiFetch<ProfileSnapshot>('/api/v1/smartlearn/profile', {
        headers: { 'x-user-id': userId },
      })
      setSnapshot(response)
      await syncFromServer(userId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [userId, syncFromServer])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Derive dimensions for radar chart from profile + skillMap
  const dimensions: RadarDimension[] = (() => {
    const subjects = profile?.dimensions?.knowledgeBase?.subjects ?? []
    if (subjects.length === 0 && !snapshot?.analytics.skillMap.entries?.length) {
      return [
        { label: '知识掌握', value: 0 },
        { label: '解题能力', value: 0 },
        { label: '应用理解', value: 0 },
        { label: '分析能力', value: 0 },
        { label: '编程实现', value: 0 },
        { label: '知识迁移', value: 0 },
      ]
    }

    const avgMastery = subjects.length > 0
      ? Math.round(subjects.reduce((a, s) => a + s.mastery, 0) / subjects.length)
      : snapshot?.analytics.skillMap.entries?.length
        ? Math.round(snapshot.analytics.skillMap.entries.reduce((a, e) => a + e.mastery * 100, 0) / snapshot.analytics.skillMap.entries.length)
        : 0

    const accuracy = errorsData?.accuracy ?? 0
    const weakCount = weakPointsData.length

    return [
      { label: '知识掌握', value: avgMastery },
      { label: '解题能力', value: accuracy },
      { label: '应用理解', value: Math.max(0, avgMastery - weakCount * 3) },
      { label: '分析能力', value: Math.min(100, Math.round((avgMastery + accuracy) / 2)) },
      { label: '编程实现', value: (() => {
        const codeSubject = subjects.find(s => s.name.includes('编程') || s.name.includes('数据'))
        if (codeSubject) return codeSubject.mastery
        const codeEntry = snapshot?.analytics.skillMap.entries?.find(e => e.topic.includes('编程') || e.topic.includes('数据结构'))
        return codeEntry ? Math.round(codeEntry.mastery * 100) : Math.round(avgMastery * 0.8)
      })() },
      { label: '知识迁移', value: Math.max(0, avgMastery - 15) },
    ]
  })()

  // Derive subject mastery list
  const subjectMastery = (() => {
    const subjects = profile?.dimensions?.knowledgeBase?.subjects ?? []
    const skillEntries = snapshot?.analytics.skillMap.entries ?? []

    if (subjects.length > 0) {
      return subjects.map((s) => ({
        name: s.name,
        mastery: Math.round(s.mastery),
        icon: getSubjectIcon(s.name),
      }))
    }

    // Fallback: group skill map entries
    if (skillEntries.length > 0) {
      return skillEntries.slice(0, 8).map((e) => ({
        name: e.topic,
        mastery: Math.round(e.mastery * 100),
        icon: getSubjectIcon(e.topic),
      }))
    }

    return []
  })()

  // Learning style tags from profile dimensions
  const learningStyleTags = (() => {
    const dims = profile?.dimensions
    if (!dims) return []

    const tags: { label: string; icon: React.ComponentType<{ className?: string }>; active: boolean }[] = []

    // Cognitive style
    const cognitiveMap: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
      visual: { label: '视觉学习', icon: Eye },
      auditory: { label: '听觉学习', icon: Brain },
      reading: { label: '阅读学习', icon: FileText },
      kinesthetic: { label: '动手实践', icon: Code },
    }
    const cog = cognitiveMap[dims.cognitiveStyle.type]
    if (cog) tags.push({ ...cog, active: true })

    // Preferred formats
    for (const fmt of dims.interests.preferredFormats) {
      const info = FORMAT_LABELS[fmt]
      if (info && !tags.find(t => t.label === info.label)) {
        tags.push({ ...info, active: true })
      }
    }

    // Time preference
    const timeLabel = TIME_SLOT_LABELS[dims.timePreference.preferredTimeSlot]
    if (timeLabel) tags.push({ label: timeLabel, icon: Clock, active: true })

    // Pace
    if (dims.learningPace.speed === 'fast') tags.push({ label: '快速学习', icon: Zap, active: true })
    if (dims.timePreference.preferredDuration <= 30) tags.push({ label: '短时专注', icon: Flame, active: true })

    return tags
  })()

  // Error type distribution from backend errors (grouped by topic)
  const errorTypes = (() => {
    const errorsList = snapshot?.errors ?? []
    if (errorsList.length === 0) return []

    return errorsList.map((e) => ({
      type: e.topic,
      count: e.count,
      desc: '',
      icon: AlertTriangle,
    }))
  })()

  const hasData = subjectMastery.length > 0 || weakPointsData.length > 0 || (errorsData?.total ?? 0) > 0

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-[var(--primary)] animate-spin" />
          <p className="text-[13px] text-[var(--muted-foreground)]">加载学习画像...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-[var(--destructive)]" />
          <p className="text-[14px] font-medium text-[var(--foreground)]">加载失败</p>
          <p className="text-[13px] text-[var(--muted-foreground)]">{error}</p>
          <button
            onClick={fetchAll}
            className="mt-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-[13px] font-medium hover:opacity-90"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--background)]">
      {/* ── Header ── */}
      <div className="border-b border-[var(--border)] px-8 py-6">
        <div className="flex items-start gap-5">
          <div className="h-16 w-16 rounded-2xl bg-[var(--primary)] flex items-center justify-center text-white font-bold text-2xl shrink-0">
            {(user?.username ?? 'G').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-[var(--foreground)]">
              {user?.username ?? '学习者'}
            </h1>
            <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
              {profile?.dimensions?.knowledgeBase?.level === 'advanced' ? '进阶学习者' :
               profile?.dimensions?.knowledgeBase?.level === 'intermediate' ? '中级学习者' : '初学探索者'}
              {profile?.dimensions?.learningGoals?.targetExam ? ` · 目标: ${profile.dimensions.learningGoals.targetExam}` : ''}
            </p>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <StatBadge icon={Target} label="正确率" value={errorsData?.accuracy != null ? `${errorsData.accuracy}%` : '暂无'} color="var(--success)" />
              <StatBadge icon={BookOpen} label="学科数" value={`${subjectMastery.length}`} color="var(--info)" />
              <StatBadge icon={AlertTriangle} label="薄弱点" value={`${weakPointsData.length}`} color="var(--warning)" />
              {errorsData?.total != null && errorsData.total > 0 && (
                <StatBadge icon={CheckCircle2} label="答题数" value={`${errorsData.total}`} color="var(--primary)" />
              )}
            </div>
          </div>
          <button
            onClick={fetchAll}
            className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
            title="刷新数据"
          >
            <RefreshCw className="h-4 w-4 text-[var(--muted-foreground)]" />
          </button>
        </div>
      </div>

      {/* ── Grid Content ── */}
      <div className="px-8 py-6 space-y-6">

        {!hasData && (
          <div className="text-center py-12">
            <Brain className="h-12 w-12 text-[var(--muted-foreground)] mx-auto mb-4 opacity-40" />
            <h2 className="text-[16px] font-medium text-[var(--foreground)] mb-2">暂无学习数据</h2>
            <p className="text-[13px] text-[var(--muted-foreground)] max-w-md mx-auto">
              开始学习和完成测验后，这里将展示你的学习画像、知识掌握度和薄弱点分析。
            </p>
          </div>
        )}

        {hasData && (
          <>
            {/* Row 1: Radar + Learning Style + Error Stats */}
            <div className="grid grid-cols-3 gap-4">

              {/* Radar Chart */}
              <Card title="学习能力画像" icon={Brain}>
                {dimensions.some(d => d.value > 0) ? (
                  <>
                    <RadarChart data={dimensions} size={220} />
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {dimensions.map((d) => (
                        <div key={d.label} className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--muted-foreground)]">{d.label}</span>
                          <span className="font-medium text-[var(--foreground)]">{d.value}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState text="完成更多学习后生成画像" />
                )}
              </Card>

              {/* Learning Style */}
              <Card title="学习风格" icon={Lightbulb}>
                {learningStyleTags.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2.5 mb-5">
                    {learningStyleTags.map((s) => {
                      const Icon = s.icon
                      return (
                        <div
                          key={s.label}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg px-3 py-2.5 border text-[12.5px] font-medium transition-colors',
                            s.active
                              ? 'bg-[var(--primary)]/8 border-[var(--primary)]/20 text-[var(--foreground)]'
                              : 'bg-[var(--muted)]/50 border-[var(--border)] text-[var(--muted-foreground)]'
                          )}
                        >
                          <Icon className={cn('h-4 w-4 shrink-0', s.active ? 'text-[var(--primary)]' : '')} />
                          {s.label}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState text="学习风格将在使用中自动识别" />
                )}

                {/* Learning preferences from profile */}
                {profile?.dimensions && (
                  <div className="space-y-2.5">
                    <h4 className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">学习偏好</h4>
                    <div className="text-[12.5px] text-[var(--foreground)] leading-relaxed space-y-1.5">
                      {profile.dimensions.timePreference.preferredDuration > 0 && (
                        <p>• 推荐学习时长 <strong>{profile.dimensions.timePreference.preferredDuration} 分钟</strong>，{profile.dimensions.timePreference.frequency === 'daily' ? '每日学习' : '灵活安排'}</p>
                      )}
                      {profile.dimensions.learningPace.speed && (
                        <p>• 学习节奏：<strong>{profile.dimensions.learningPace.speed === 'fast' ? '快速' : profile.dimensions.learningPace.speed === 'moderate' ? '适中' : '稳健'}</strong>{profile.dimensions.learningPace.depthPreference ? `，偏好${profile.dimensions.learningPace.depthPreference === 'deep' ? '深度' : '广度'}学习` : ''}</p>
                      )}
                      {profile.dimensions.interests.domains.length > 0 && (
                        <p>• 兴趣领域：{profile.dimensions.interests.domains.slice(0, 3).join('、')}</p>
                      )}
                      {profile.dimensions.learningGoals.shortTerm.length > 0 && (
                        <p>• 近期目标：{profile.dimensions.learningGoals.shortTerm[0]}</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>

              {/* Error Stats Summary */}
              <Card title="答题统计" icon={Target}>
                {errorsData && errorsData.total > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center">
                      <div className="relative h-32 w-32">
                        <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--muted)" strokeWidth="10" />
                          <circle
                            cx="60" cy="60" r="50" fill="none"
                            stroke="var(--success)" strokeWidth="10"
                            strokeDasharray={`${(errorsData.accuracy ?? 0) * 3.14} 314`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-[var(--foreground)]">{errorsData.accuracy ?? 0}%</span>
                          <span className="text-[10px] text-[var(--muted-foreground)]">正确率</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[var(--background)] rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-[var(--success)]">{errorsData.correctCount}</div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">正确</div>
                      </div>
                      <div className="bg-[var(--background)] rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-[var(--destructive)]">{errorsData.errorCount}</div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">错误</div>
                      </div>
                      <div className="col-span-2 bg-[var(--background)] rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-[var(--foreground)]">{errorsData.total}</div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">总答题数</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState text="完成测验后查看答题统计" />
                )}
              </Card>
            </div>

            {/* Row 2: Subject Mastery + Error Types */}
            <div className="grid grid-cols-5 gap-4">

              {/* Subject Mastery — 3 cols */}
              <div className="col-span-3">
                <Card title="学科掌握度" icon={BookOpen}>
                  {subjectMastery.length > 0 ? (
                    <div className="space-y-3.5">
                      {subjectMastery
                        .sort((a, b) => a.mastery - b.mastery)
                        .map((s) => {
                          const Icon = s.icon
                          const color = getMasteryColor(s.mastery)
                          return (
                            <div key={s.name} className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-[var(--muted)] flex items-center justify-center shrink-0">
                                <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[13px] font-medium text-[var(--foreground)]">{s.name}</span>
                                  <div className="flex items-center gap-2">
                                    {s.mastery >= 60 ? (
                                      <TrendingUp className="h-3.5 w-3.5 text-[var(--success)]" />
                                    ) : (
                                      <TrendingDown className="h-3.5 w-3.5 text-[var(--destructive)]" />
                                    )}
                                    <span className={cn(
                                      'text-[13px] font-bold',
                                      s.mastery >= 70 ? 'text-[var(--success)]' :
                                      s.mastery >= 50 ? 'text-[var(--warning)]' :
                                      'text-[var(--destructive)]'
                                    )}>
                                      {s.mastery}%
                                    </span>
                                  </div>
                                </div>
                                <MasteryBar value={s.mastery} color={color} />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  ) : (
                    <EmptyState text="学习学科后将显示掌握度" />
                  )}
                </Card>
              </div>

              {/* Error Type Distribution — 2 cols */}
              <div className="col-span-2">
                <Card title="错误类型分布" icon={AlertTriangle}>
                  {errorTypes.length > 0 ? (
                    <div className="space-y-3">
                      {errorTypes.map((m) => {
                        const Icon = m.icon
                        const total = errorTypes.reduce((a, b) => a + b.count, 0)
                        const pct = Math.round((m.count / total) * 100)
                        return (
                          <div key={m.type} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Icon className="h-3.5 w-3.5 text-[var(--warning)]" />
                                <span className="text-[12.5px] font-medium text-[var(--foreground)]">{m.type}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-bold text-[var(--foreground)]">{m.count}</span>
                                <span className="text-[10px] text-[var(--muted-foreground)] w-8 text-right">{pct}%</span>
                              </div>
                            </div>
                            <div className="h-1.5 w-full bg-[var(--muted)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[var(--warning)] rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyState text="答题后分析错误类型" />
                  )}

                  {/* Weak topics from profile */}
                  {profile?.dimensions?.weakPoints?.topics && profile.dimensions.weakPoints.topics.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[var(--border)]">
                      <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
                        <Lightbulb className="h-3.5 w-3.5 text-[var(--warning)]" />
                        <span>薄弱点: {profile.dimensions.weakPoints.topics.slice(0, 3).join('、')}</span>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {/* Row 3: Weak Points + Recent Errors */}
            <div className="grid grid-cols-5 gap-4">

              {/* Weak Points — 3 cols */}
              <div className="col-span-3">
                <Card title="薄弱知识点" icon={Target}>
                  {weakPointsData.length > 0 ? (
                    <div className="space-y-3">
                      {weakPointsData.map((w) => (
                        <div
                          key={w.topic}
                          className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-[13.5px] font-semibold text-[var(--foreground)]">{w.topic}</h4>
                                <span className={cn(
                                  'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                                  getSeverityStyle(w.severity)
                                )}>
                                  {w.severity === 'high' ? '重点关注' : w.severity === 'medium' ? '需要加强' : '轻微'}
                                </span>
                              </div>
                              <span className="text-[11px] text-[var(--muted-foreground)]">
                                掌握度 {w.mastery}%
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              {w.attempts > 0 && (
                                <>
                                  <div className="text-[18px] font-bold text-[var(--destructive)]">{w.errorRate}%</div>
                                  <div className="text-[10px] text-[var(--muted-foreground)]">错误率 ({w.attempts} 题)</div>
                                </>
                              )}
                            </div>
                          </div>
                          {w.errors > 0 && (
                            <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed bg-[var(--muted)]/50 rounded-lg px-3 py-2">
                              共 {w.errors} 次答错，建议回顾相关基础概念后进行针对性练习
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="暂无薄弱知识点数据" />
                  )}
                </Card>
              </div>

              {/* Recent Errors — 2 cols */}
              <div className="col-span-2">
                <Card title="最近答题记录" icon={XCircle}>
                  {errorsData && errorsData.recent.length > 0 ? (
                    <div className="space-y-2.5">
                      {errorsData.recent.slice(0, 8).map((e, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 rounded-lg bg-[var(--background)] border border-[var(--border)] p-3"
                        >
                          <div className="shrink-0 mt-0.5">
                            {e.correct ? (
                              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                            ) : (
                              <XCircle className="h-4 w-4 text-[var(--destructive)]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-[var(--foreground)] leading-relaxed line-clamp-2">{e.question}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)] px-1.5 py-0.5 rounded">
                                {e.topic}
                              </span>
                              <span className="text-[10px] text-[var(--muted-foreground)]">{timeAgo(e.timestamp)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="暂无答题记录" />
                  )}

                  {errorsData && errorsData.total > 0 && (
                    <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                      <div className="flex items-center gap-4 text-[12px]">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                          <span className="text-[var(--muted-foreground)]">正确 {errorsData.correctCount}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <XCircle className="h-3.5 w-3.5 text-[var(--destructive)]" />
                          <span className="text-[var(--muted-foreground)]">错误 {errorsData.errorCount}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {/* Row 4: Recommendations based on weak points */}
            {weakPointsData.length > 0 && (
              <Card title="AI 学习建议" icon={Lightbulb}>
                <div className="grid grid-cols-3 gap-4">
                  {weakPointsData.slice(0, 3).map((wp) => (
                    <RecommendCard
                      key={wp.topic}
                      title={`强化 ${wp.topic}`}
                      desc={wp.errors >= 3
                        ? `该知识点错误率 ${wp.errorRate}%，建议回顾基础概念后进行 3-5 道针对性练习题。`
                        : `掌握度 ${wp.mastery}%，建议通过文档和视频加深理解，配合小测验检验学习效果。`
                      }
                      tag={wp.topic}
                      priority={wp.severity}
                    />
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="h-10 w-10 rounded-full bg-[var(--muted)] flex items-center justify-center mb-3">
        <BookOpen className="h-5 w-5 text-[var(--muted-foreground)]" />
      </div>
      <p className="text-[12.5px] text-[var(--muted-foreground)]">{text}</p>
    </div>
  )
}

function StatBadge({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1">
      <Icon className="h-3.5 w-3.5" style={{ color: `var(${color})` }} />
      <span className="text-[11px] text-[var(--muted-foreground)]">{label}</span>
      <span className="text-[12px] font-semibold text-[var(--foreground)]">{value}</span>
    </div>
  )
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-[var(--primary)]" />
        <h3 className="text-[14px] font-semibold text-[var(--foreground)]">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function RecommendCard({
  title,
  desc,
  tag,
  priority,
}: {
  title: string
  desc: string
  tag: string
  priority: 'high' | 'medium' | 'low'
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 hover:border-[var(--primary)]/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          'h-2 w-2 rounded-full',
          priority === 'high' ? 'bg-[var(--destructive)]' : priority === 'medium' ? 'bg-[var(--warning)]' : 'bg-[var(--info)]'
        )} />
        <h4 className="text-[13px] font-semibold text-[var(--foreground)]">{title}</h4>
      </div>
      <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed mb-3">{desc}</p>
      <span className="text-[10px] font-medium text-[var(--primary)] bg-[var(--primary)]/8 px-2 py-0.5 rounded-full">
        {tag}
      </span>
    </div>
  )
}
