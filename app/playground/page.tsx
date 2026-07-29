'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Play,
  Square,
  Trash2,
  MessageSquare,
  Lightbulb,
  HelpCircle,
  Search,
  BarChart3,
  GraduationCap,
  Bot,
  Wrench,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { submitTurn, type SSEEnvelope } from '@/lib/api-client'
import { useI18n } from '@/lib/hooks/use-i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlaygroundEvent {
  id: string
  type: string
  timestamp: string
  data: unknown
}

type Capability = 'chat' | 'deep_solve' | 'mastery_path' | 'deep_research' | 'visualize' | 'smartlearn'

const CAPABILITIES: { id: Capability; label: string; icon: React.ComponentType<{ className?: string }>; descKey: string }[] = [
  { id: 'chat', label: '对话', icon: MessageSquare, descKey: 'playground.capabilityDescriptions.chat' },
  { id: 'deep_solve', label: '解题', icon: Lightbulb, descKey: 'playground.capabilityDescriptions.deepSolve' },
  { id: 'mastery_path', label: '测验', icon: HelpCircle, descKey: 'playground.capabilityDescriptions.masteryPath' },
  { id: 'deep_research', label: '研究', icon: Search, descKey: 'playground.capabilityDescriptions.deepResearch' },
  { id: 'visualize', label: '可视化', icon: BarChart3, descKey: 'playground.capabilityDescriptions.visualize' },
  { id: 'smartlearn', label: '智慧学习', icon: GraduationCap, descKey: 'playground.capabilityDescriptions.smartlearn' },
]

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PlaygroundPage() {
  const { t, locale } = useI18n()
  const [capability, setCapability] = useState<Capability>('chat')
  const [message, setMessage] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [events, setEvents] = useState<PlaygroundEvent[]>([])
  const [content, setContent] = useState('')
  const [thinking, setThinking] = useState('')
  const [toolCalls, setToolCalls] = useState<string[]>([])
  const [stage, setStage] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [sessionId] = useState(() => `playground-${Date.now()}`)
  const [elapsed, setElapsed] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  // Cleanup interval timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Auto-scroll events panel
  const scrollEvents = useCallback(() => {
    setTimeout(() => {
      eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }, [])

  // ---------------------------------------------------------------------------
  // Run a turn
  // ---------------------------------------------------------------------------
  const runTurn = useCallback(async () => {
    if (!message.trim() || streaming) return

    // Reset state
    setStreaming(true)
    setEvents([])
    setContent('')
    setThinking('')
    setToolCalls([])
    setStage('')
    setElapsed(0)

    // Start timer
    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      await submitTurn(
        {
          sessionId,
          message: message.trim(),
          capability,
          language: 'zh',
        },
        {
          signal: abort.signal,
          onEvent: (event: SSEEnvelope) => {
            const evt: PlaygroundEvent = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: event.type,
              timestamp: new Date().toLocaleTimeString(locale),
              data: event.data,
            }

            setEvents((prev) => [...prev, evt])
            scrollEvents()

            // Process specific event types
            const data = event.data as unknown as Record<string, unknown>
            switch (event.type) {
              case 'content':
                setContent((prev) => prev + (data.content as string || ''))
                break
              case 'thinking':
                setThinking((prev) => prev + (data.content as string || ''))
                break
              case 'tool_call':
                setToolCalls((prev) => [...prev, data.tool as string || 'unknown'])
                break
              case 'stage_start':
                setStage(data.stage as string || '')
                break
              case 'stage_end':
                setStage('')
                break
            }
          },
          onError: (err: Error) => {
            setEvents((prev) => [
              ...prev,
              {
                id: `${Date.now()}-err`,
                type: 'error',
                timestamp: new Date().toLocaleTimeString(locale),
                data: { message: err.message },
              },
            ])
          },
        },
      )
    } catch {
    } finally {
      setStreaming(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      abortRef.current = null
    }
  }, [message, streaming, capability, sessionId, scrollEvents])

  // ---------------------------------------------------------------------------
  // Stop stream
  // ---------------------------------------------------------------------------
  const stopStream = useCallback(() => {
    abortRef.current?.abort()
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setStreaming(false)
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-full bg-[var(--background)]">
      {/* Left: Controls + Output */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-[var(--primary)]" />
              <h1 className="text-lg font-semibold text-[var(--foreground)]">演练场</h1>
              <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
                {t('playground.testTool')}
              </span>
            </div>
            {streaming && (
              <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
                <Clock className="h-3.5 w-3.5" />
                <span>{elapsed}s</span>
              </div>
            )}
          </div>
        </div>

        {/* Capability selector */}
        <div className="border-b border-[var(--border)] px-6 py-3">
          <div className="flex gap-2">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon
              return (
                <button
                  key={cap.id}
                  onClick={() => setCapability(cap.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all',
                    capability === cap.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--accent)]',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cap.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Output area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {/* Thinking */}
          {thinking && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
                <Lightbulb className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span className="text-[12px] font-medium text-[var(--foreground)]">思考</span>
              </div>
              <div className="px-4 py-3">
                <p className="text-[12.5px] text-[var(--muted-foreground)] leading-relaxed whitespace-pre-wrap">
                  {thinking}
                </p>
              </div>
            </div>
          )}

          {/* Stage indicator */}
          {stage && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
              <span>阶段: {stage}</span>
            </div>
          )}

          {/* Tool calls */}
          {toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {toolCalls.map((tool, i) => (
                <div
                  key={i}
                  className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                >
                  <Wrench className="h-3 w-3 text-[var(--primary)]" />
                  <span className="text-[12px] text-[var(--foreground)]">{tool}</span>
                  <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                </div>
              ))}
            </div>
          )}

          {/* Content output */}
          {content && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="h-4 w-4 text-[var(--primary)]" />
                <span className="text-[11px] text-[var(--muted-foreground)]">回复</span>
              </div>
              <div className="text-[13.5px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                {content}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!streaming && !content && events.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Play className="h-10 w-10 text-[var(--muted-foreground)] mx-auto mb-3 opacity-30" />
                <p className="text-[14px] font-medium text-[var(--foreground)] mb-1">
                  {t('playground.selectCapability')}
                </p>
                <p className="text-[12px] text-[var(--muted-foreground)]">
                  {t('playground.playgroundDesc')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-[var(--border)] px-6 py-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    runTurn()
                  }
                }}
                placeholder={t('playground.enterMessage')}
                className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] resize-none min-h-[44px] max-h-[120px]"
                rows={1}
              />
            </div>
            {streaming ? (
              <button
                onClick={stopStream}
                className="px-4 py-2.5 rounded-lg bg-[var(--destructive)] text-white hover:opacity-90 transition-opacity flex items-center gap-1.5"
              >
                <Square className="h-[18px] w-[18px]" />
              </button>
            ) : (
              <button
                onClick={runTurn}
                disabled={!message.trim()}
                className="px-4 py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
              >
                <Play className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-2 text-center">
            {t('playground.enterHint')}
          </p>
        </div>
      </div>

      {/* Right: Event log panel */}
      <div className="w-96 border-l border-[var(--border)] bg-[var(--card)] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)]">事件日志</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              {showRaw ? '原始' : '精简'}
            </button>
            <button
              onClick={() => {
                setEvents([])
                setContent('')
                setThinking('')
                setToolCalls([])
                setStage('')
              }}
              className="p-1.5 rounded hover:bg-[var(--muted)] transition-colors"
              title="清空"
            >
              <Trash2 className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px]">
          {events.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted-foreground)]">
              {t('playground.noEvents')}
            </div>
          ) : (
            events.map((evt) => (
              <div
                key={evt.id}
                className={cn(
                  'rounded-md px-2.5 py-1.5 border',
                  evt.type === 'error'
                    ? 'bg-[var(--destructive)]/10 border-[var(--destructive)]/20 text-[var(--destructive)]'
                    : evt.type === 'content'
                      ? 'bg-[var(--primary)]/5 border-[var(--primary)]/10'
                      : 'bg-[var(--background)] border-[var(--border)]',
                )}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-semibold text-[var(--foreground)]">{evt.type}</span>
                  <span className="text-[10px] text-[var(--muted-foreground)]">{evt.timestamp}</span>
                </div>
                {showRaw ? (
                  <pre className="text-[10px] text-[var(--muted-foreground)] whitespace-pre-wrap break-all mt-1">
                    {JSON.stringify(evt.data, null, 2)}
                  </pre>
                ) : (
                  <div className="text-[10px] text-[var(--muted-foreground)] truncate">
                    {typeof evt.data === 'object' && evt.data !== null
                      ? JSON.stringify(evt.data).slice(0, 120)
                      : String(evt.data).slice(0, 120)}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={eventsEndRef} />
        </div>

        {/* Stats footer */}
        <div className="border-t border-[var(--border)] px-4 py-2.5 flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
          <span>事件: {events.length}</span>
          <span>会话: {sessionId.slice(-8)}</span>
        </div>
      </div>
    </div>
  )
}
