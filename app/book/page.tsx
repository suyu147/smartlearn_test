'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BookOpen,
  Plus,
  Trash2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Play,
  RefreshCw,
  FileText,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  Zap,
  Eye,
  Code,
  HelpCircle,
  Lightbulb,
  Timer,
  CreditCard,
  Network,
  PenLine,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiGet, apiDelete, apiFetch } from '@/lib/api-client'
import { useBookStore } from '@/lib/store/book-store'
import { useSettingsStoreV2 } from '@/lib/store/settings-store'
import { useI18n } from '@/lib/hooks/use-i18n'
import { EnhancedMarkdownMessage } from '@/components/chat/markdown-message'
import { QuizCard, type QuizQuestion } from '@/components/chat/quiz-card'
import { CalloutBlock, type CalloutType } from '@/components/chat/callout-block'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookSummary {
  id: string
  title: string
  status: string
  chapterCount: number
  pageCount: number
  createdAt: string
  updatedAt: string
}

interface BookDetail {
  book: {
    id: string
    status: string
    proposal: { title: string; description: string; scope: string; targetLevel: string; estimatedChapters: number; rationale: string } | null
    spine: { title: string; chapters: ChapterData[]; conceptGraph: { nodes: unknown[]; edges: unknown[] }; explorationSummary: string } | null
    progress: { currentPageId: string; visitedPageIds: string[]; score: number }
    createdAt: string
    updatedAt: string
  }
  pages: PageData[]
}

interface ChapterData {
  order: number
  title: string
  learningObjectives: string[]
  contentType: string
  summary: string
  pageIds: string[]
}

interface PageData {
  id: string
  chapterOrder: number
  title: string
  status: string
  blocks: BlockData[]
}

interface BlockData {
  id: string
  type: string
  status: string
  payload: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Block type icons
// ---------------------------------------------------------------------------

const BLOCK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  text: FileText,
  section: Layers,
  callout: Lightbulb,
  quiz: HelpCircle,
  code: Code,
  concept_graph: Network,
  timeline: Timer,
  flash_cards: CreditCard,
  figure: Eye,
  interactive: Zap,
  animation: Play,
  deep_dive: BookOpen,
  user_note: PenLine,
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-[var(--muted-foreground)]',
  spine_ready: 'text-[var(--primary)]',
  compiling: 'text-[var(--warning)]',
  ready: 'text-[var(--success)]',
  error: 'text-[var(--destructive)]',
  pending: 'text-[var(--muted-foreground)]',
  generating: 'text-[var(--primary)]',
  partial: 'text-[var(--warning)]',
}

/** Map book callout types to CalloutBlock CalloutType */
function mapCalloutType(type?: string): CalloutType {
  if (!type) return 'note'
  const t = type.toLowerCase().trim()
  if (t === 'tip' || t === 'hint') return 'tip'
  if (t === 'warning' || t === 'pitfall' || t === 'caution') return 'warning'
  if (t === 'danger') return 'danger'
  if (t === 'info' || t === 'key_idea') return 'info'
  if (t === 'success' || t === 'summary' || t === 'check') return 'success'
  return 'note'
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: 'book.status.draft',
  spine_ready: 'book.status.spineReady',
  compiling: 'book.status.compiling',
  ready: 'book.status.ready',
  error: 'book.status.error',
  pending: 'book.status.pending',
  generating: 'book.status.generating',
  partial: 'book.status.partial',
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function BookPage() {
  const { t } = useI18n()
  const statusLabel = (s: string) => STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : s
  const settings = useSettingsStoreV2()
  const [books, setBooks] = useState<BookSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBook, setActiveBook] = useState<BookDetail | null>(null)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processStep, setProcessStep] = useState('')
  const [newIntent, setNewIntent] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

  // ---------------------------------------------------------------------------
  // SmartLearn-aware API helpers (inject LLM config as headers)
  // ---------------------------------------------------------------------------
  const llmHeaders: Record<string, string> = {}
  if (settings.smartlearnApiKey) llmHeaders['x-api-key'] = settings.smartlearnApiKey
  if (settings.smartlearnProviderId) llmHeaders['x-provider'] = settings.smartlearnProviderId
  if (settings.smartlearnModelId) llmHeaders['x-model'] = settings.smartlearnModelId
  if (settings.smartlearnBaseUrl) llmHeaders['x-base-url'] = settings.smartlearnBaseUrl

  const bookPost = useCallback(<T,>(path: string, body?: unknown): Promise<T> => {
    return apiFetch<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: llmHeaders,
    })
  }, [llmHeaders['x-api-key'], llmHeaders['x-provider'], llmHeaders['x-model'], llmHeaders['x-base-url']])

  // ---------------------------------------------------------------------------
  // Fetch book list
  // ---------------------------------------------------------------------------
  const fetchBooks = useCallback(async () => {
    try {
      const list = await apiGet<BookSummary[]>('/api/v1/book')
      setBooks(list)
    } catch {
      setBooks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks])

  // ---------------------------------------------------------------------------
  // Load book detail
  // ---------------------------------------------------------------------------
  const loadBook = useCallback(async (id: string) => {
    try {
      const detail = await apiGet<BookDetail>(`/api/v1/book/${id}`)
      setActiveBook(detail)
      // Select first page
      if (detail.pages.length > 0) {
        setActivePageId(detail.pages[0].id)
      }
    } catch {
      // error handled by UI state
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Create book (Stage 1)
  // ---------------------------------------------------------------------------
  const createBook = useCallback(async () => {
    if (!newIntent.trim()) return
    setCreating(true)
    try {
      const book = await bookPost<{ id: string }>('/api/v1/book', {
        userIntent: newIntent.trim(),
      })
      setNewIntent('')
      setShowCreateForm(false)
      await fetchBooks()
      await loadBook(book.id)
    } catch {
    } finally {
      setCreating(false)
    }
  }, [newIntent, fetchBooks, loadBook, bookPost])

  // ---------------------------------------------------------------------------
  // Confirm proposal (Stage 2)
  // ---------------------------------------------------------------------------
  const confirmProposal = useCallback(async () => {
    if (!activeBook) return
    setProcessing(true)
    setProcessStep(t('book.creatingSpine'))
    try {
      await bookPost('/api/v1/book/confirm-proposal', { bookId: activeBook.book.id })
      await loadBook(activeBook.book.id)
    } catch {
    } finally {
      setProcessing(false)
      setProcessStep('')
    }
  }, [activeBook, loadBook, bookPost])

  // ---------------------------------------------------------------------------
  // Confirm spine (Stage 2.5)
  // ---------------------------------------------------------------------------
  const confirmSpine = useCallback(async () => {
    if (!activeBook) return
    setProcessing(true)
    setProcessStep(t('book.creatingPageStructure'))
    try {
      await bookPost('/api/v1/book/confirm-spine', { bookId: activeBook.book.id })
      await loadBook(activeBook.book.id)
    } catch {
    } finally {
      setProcessing(false)
      setProcessStep('')
    }
  }, [activeBook, loadBook, bookPost])

  // ---------------------------------------------------------------------------
  // Compile page (Stage 3-4)
  // ---------------------------------------------------------------------------
  const compilePage = useCallback(async (pageId: string) => {
    if (!activeBook) return
    setProcessing(true)
    setProcessStep(t('book.compilingPage'))
    try {
      await bookPost('/api/v1/book/compile-page', {
        bookId: activeBook.book.id,
        pageId,
      })
      await loadBook(activeBook.book.id)
    } catch {
    } finally {
      setProcessing(false)
      setProcessStep('')
    }
  }, [activeBook, loadBook, bookPost])

  // ---------------------------------------------------------------------------
  // Compile all
  // ---------------------------------------------------------------------------
  const compileAll = useCallback(async () => {
    if (!activeBook) return
    setProcessing(true)
    setProcessStep(t('book.compilingAll'))
    try {
      await bookPost('/api/v1/book/compile-all', { bookId: activeBook.book.id })
      await loadBook(activeBook.book.id)
    } catch {
    } finally {
      setProcessing(false)
      setProcessStep('')
    }
  }, [activeBook, loadBook, bookPost])

  // ---------------------------------------------------------------------------
  // Delete book
  // ---------------------------------------------------------------------------
  const deleteBook = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!confirm(t('book.confirmDelete'))) return
      try {
        await apiDelete(`/api/v1/book/${id}`)
        if (activeBook?.book.id === id) {
          setActiveBook(null)
          setActivePageId(null)
        }
        await fetchBooks()
      } catch {
      }
    },
    [activeBook, fetchBooks],
  )

  // ---------------------------------------------------------------------------
  // Active page
  // ---------------------------------------------------------------------------
  const activePage = activeBook?.pages.find((p) => p.id === activePageId) ?? null

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-full bg-[var(--background)]">
      {/* Book list sidebar */}
      <div className="w-72 border-r border-[var(--border)] flex flex-col bg-[var(--card)]">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[var(--foreground)]">{t('book.myBooks')}</h2>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors"
            title={t('book.createNewBook')}
          >
            <Plus className="h-4 w-4 text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* Create form */}
        {showCreateForm && (
          <div className="border-b border-[var(--border)] p-3 space-y-2">
            <textarea
              value={newIntent}
              onChange={(e) => setNewIntent(e.target.value)}
              placeholder={t('book.describeTopic')}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] resize-none min-h-[60px]"
              rows={2}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={createBook}
                disabled={creating || !newIntent.trim()}
                className="flex-1 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {creating ? t('book.creating') : t('book.aiCreate')}
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewIntent('') }}
                className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : books.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="h-8 w-8 text-[var(--muted-foreground)] mx-auto mb-2 opacity-40" />
              <p className="text-[12px] text-[var(--muted-foreground)]">{t('book.noBooks')}</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="mt-2 text-[12px] text-[var(--primary)] hover:underline"
              >
                {t('book.createFirstBook')}
              </button>
            </div>
          ) : (
            books.map((book) => (
              <div
                key={book.id}
                role="button"
                tabIndex={0}
                onClick={() => loadBook(book.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadBook(book.id); } }}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg transition-colors group cursor-pointer',
                  activeBook?.book.id === book.id
                    ? 'bg-[var(--primary)]/10 border border-[var(--primary)]/20'
                    : 'hover:bg-[var(--muted)]',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <BookOpen className="h-4 w-4 text-[var(--primary)] mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[var(--foreground)] truncate">
                      {book.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn('text-[10px] font-medium', STATUS_COLORS[book.status] ?? '')}>
                        {statusLabel(book.status)}
                      </span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {t('book.chapterCount', { count: book.chapterCount })} · {t('book.pageCount', { count: book.pageCount })}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteBook(book.id, e); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--destructive)]/10 transition-all"
                  >
                    <Trash2 className="h-3 w-3 text-[var(--destructive)]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {activeBook ? (
          <>
            {/* Book header */}
            <div className="border-b border-[var(--border)] px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-[var(--foreground)]">
                    {activeBook.book.proposal?.title ?? '未命名'}
                  </h1>
                  <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
                    {activeBook.book.proposal?.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('px-2 py-0.5 text-[11px] font-medium rounded-full border',
                    STATUS_COLORS[activeBook.book.status] ?? '',
                    'border-[var(--border)]',
                  )}>
                    {statusLabel(activeBook.book.status)}
                  </span>
                </div>
              </div>

              {/* Pipeline action buttons */}
              <div className="flex items-center gap-2 mt-3">
                {activeBook.book.status === 'draft' && (
                  <button
                    onClick={confirmProposal}
                    disabled={processing}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
                  >
                    {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {t('book.generateSpine')}
                  </button>
                )}
                {activeBook.book.status === 'spine_ready' && (
                  <>
                    <button
                      onClick={confirmSpine}
                      disabled={processing}
                      className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
                    >
                      {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                      {t('book.createPageStructure')}
                    </button>
                    <button
                      onClick={compileAll}
                      disabled={processing}
                      className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {t('book.compileAll')}
                    </button>
                  </>
                )}
                {(activeBook.book.status === 'compiling' || activeBook.book.status === 'ready') && activeBook.pages.some(p => p.status === 'pending' || p.status === 'error') && (
                  <button
                    onClick={compileAll}
                    disabled={processing}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {t('book.recompileIncomplete')}
                  </button>
                )}
                {processing && processStep && (
                  <span className="text-[12px] text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {processStep}
                  </span>
                )}
              </div>
            </div>

            {/* Content area: chapter nav + page viewer */}
            <div className="flex-1 flex overflow-hidden">
              {/* Chapter nav */}
              {activeBook.book.spine && (
                <div className="w-56 border-r border-[var(--border)] overflow-y-auto p-3 space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-2 px-2">
                    {t('book.chapters')}
                  </div>
                  {activeBook.pages.map((page) => {
                    const pageStatusColor = STATUS_COLORS[page.status] ?? ''
                    return (
                      <button
                        key={page.id}
                        onClick={() => setActivePageId(page.id)}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-[13px]',
                          activePageId === page.id
                            ? 'bg-[var(--primary)]/10 text-[var(--foreground)]'
                            : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0',
                          page.status === 'ready' ? 'bg-[var(--success)]' :
                          page.status === 'partial' ? 'bg-[var(--warning)]' :
                          page.status === 'error' ? 'bg-[var(--destructive)]' :
                          page.status === 'generating' ? 'bg-[var(--primary)]' :
                          'bg-[var(--muted-foreground)]',
                        )} />
                        <span className="truncate">{page.title}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Page viewer */}
              <div className="flex-1 overflow-y-auto">
                {activePage ? (
                  <div className="p-6 max-w-3xl mx-auto space-y-4">
                    {/* Page header */}
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-[var(--foreground)]">
                        {activePage.title}
                      </h2>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[11px] font-medium', STATUS_COLORS[activePage.status] ?? '')}>
                          {statusLabel(activePage.status)}
                        </span>
                        {(activePage.status === 'pending' || activePage.status === 'error') && (
                          <button
                            onClick={() => compilePage(activePage.id)}
                            disabled={processing}
                            className="px-3 py-1 rounded-lg text-[12px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1"
                          >
                            <Play className="h-3 w-3" />
                            {t('book.compilePage')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Blocks */}
                    {activePage.blocks.length === 0 ? (
                      <div className="text-center py-12 text-[var(--muted-foreground)]">
                        <Layers className="h-8 w-8 mx-auto mb-3 opacity-30" />
                        <p className="text-[13px]">{t('book.pageNotCompiled')}</p>
                        <button
                          onClick={() => compilePage(activePage.id)}
                          disabled={processing}
                          className="mt-3 px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-1.5"
                        >
                          <Play className="h-3.5 w-3.5" />
                          {t('book.startCompile')}
                        </button>
                      </div>
                    ) : (
                      activePage.blocks.map((block, idx) => {
                        const Icon = BLOCK_ICONS[block.type] ?? FileText
                        const content = (block.payload.content as string) ?? ''
                        const calloutType = block.payload.calloutType as string | undefined

                        return (
                          <div
                            key={block.id || idx}
                            className={cn(
                              'rounded-xl border border-[var(--border)] overflow-hidden',
                              block.status === 'error' && 'border-[var(--destructive)]/30',
                            )}
                          >
                            {/* Block header */}
                            <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-2 bg-[var(--card)]">
                              <Icon className="h-3.5 w-3.5 text-[var(--primary)]" />
                              <span className="text-[11px] font-medium text-[var(--muted-foreground)] uppercase">
                                {block.type}
                                {calloutType && ` · ${calloutType}`}
                              </span>
                              {block.status === 'error' && (
                                <AlertCircle className="h-3 w-3 text-[var(--destructive)] ml-auto" />
                              )}
                              {block.status === 'ready' && (
                                <CheckCircle2 className="h-3 w-3 text-[var(--success)] ml-auto" />
                              )}
                            </div>

                            {/* Block content — rich rendering by type */}
                            <div className="p-4">
                              {block.type === 'text' || block.type === 'section' ? (
                                <EnhancedMarkdownMessage content={content} proseClass="prose prose-sm dark:prose-invert max-w-none" />
                              ) : block.type === 'callout' ? (
                                <CalloutBlock
                                  type={mapCalloutType(calloutType)}
                                  title={calloutType}
                                >
                                  <EnhancedMarkdownMessage content={content} proseClass="prose prose-sm dark:prose-invert max-w-none [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0" />
                                </CalloutBlock>
                              ) : block.type === 'code' ? (
                                <EnhancedMarkdownMessage
                                  content={`\`\`\`${(block.payload.language as string) || 'python'}\n${(block.payload.code as string) || content}\n\`\`\``}
                                  proseClass="prose prose-sm dark:prose-invert max-w-none [&_pre]:m-0"
                                />
                              ) : block.type === 'quiz' ? (
                                <QuizCard quiz={{
                                  question: (block.payload.question as string) || '',
                                  options: Array.isArray(block.payload.options) ? (block.payload.options as string[]) : [],
                                  correctIndex: block.payload.correctIndex as number | undefined,
                                  explanation: (block.payload.explanation as string) || undefined,
                                } satisfies QuizQuestion} />
                              ) : block.type === 'concept_graph' ? (
                                <div className="rounded-lg border bg-[var(--background)] p-4">
                                  <EnhancedMarkdownMessage
                                    content={`\`\`\`mermaid\n${(block.payload.mermaid as string) || 'graph TD\n  A["暂无概念"]'}\n\`\`\``}
                                    renderMode="mermaid"
                                    proseClass="[&_pre]:m-0"
                                  />
                                </div>
                              ) : block.type === 'timeline' ? (
                                <div className="space-y-3">
                                  {Array.isArray(block.payload.events) &&
                                    (block.payload.events as Array<{ date?: string; title?: string; description?: string }>).map((evt, i) => (
                                      <div key={i} className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                          <div className="h-2.5 w-2.5 rounded-full bg-[var(--primary)] shrink-0 mt-1.5" />
                                          {i < ((block.payload.events as unknown[]).length - 1) && (
                                            <div className="w-px flex-1 bg-[var(--border)] mt-1" />
                                          )}
                                        </div>
                                        <div className="pb-3 min-w-0">
                                          <div className="text-[11px] font-medium text-[var(--primary)] mb-0.5">{evt.date}</div>
                                          <div className="text-[13px] font-medium text-[var(--foreground)]">{evt.title}</div>
                                          {evt.description && (
                                            <div className="text-[12px] text-[var(--muted-foreground)] mt-0.5">{evt.description}</div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              ) : block.type === 'flash_cards' ? (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {Array.isArray(block.payload.cards) &&
                                    (block.payload.cards as Array<{ front?: string; back?: string; hint?: string }>).map((card, i) => (
                                      <details key={i} className="rounded-lg border border-[var(--border)] overflow-hidden group">
                                        <summary className="px-3 py-2.5 text-[13px] font-medium text-[var(--foreground)] cursor-pointer hover:bg-[var(--muted)]/50 transition-colors">
                                          {card.front}
                                        </summary>
                                        <div className="px-3 py-2.5 border-t border-[var(--border)] text-[12.5px] text-[var(--muted-foreground)]">
                                          {card.back}
                                          {card.hint && <p className="mt-1 text-[11px] italic opacity-70">💡 {card.hint}</p>}
                                        </div>
                                      </details>
                                    ))}
                                </div>
                              ) : block.type === 'deep_dive' ? (
                                <div className="space-y-2">
                                  {Array.isArray(block.payload.suggestions) &&
                                    (block.payload.suggestions as Array<{ topic?: string; rationale?: string }>).map((s, i) => (
                                      <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--muted)]/30">
                                        <Sparkles className="h-3.5 w-3.5 text-[var(--primary)] mt-0.5 shrink-0" />
                                        <div>
                                          <div className="text-[13px] font-medium text-[var(--foreground)]">{s.topic}</div>
                                          {s.rationale && <div className="text-[12px] text-[var(--muted-foreground)] mt-0.5">{s.rationale}</div>}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              ) : block.type === 'figure' ? (
                                <div className="rounded-lg border overflow-hidden">
                                  {(block.payload.render_type as string) === 'mermaid' ? (
                                    <EnhancedMarkdownMessage
                                      content={`\`\`\`mermaid\n${(block.payload.code as string) || ''}\n\`\`\``}
                                      renderMode="mermaid"
                                      proseClass="[&_pre]:m-0"
                                    />
                                  ) : (block.payload.render_type as string) === 'svg' ? (
                                    <EnhancedMarkdownMessage
                                      content={`\`\`\`svg\n${(block.payload.code as string) || ''}\n\`\`\``}
                                      renderMode="svg"
                                      proseClass="[&_pre]:m-0"
                                    />
                                  ) : (block.payload.render_type as string) === 'html' || (block.payload.render_type as string) === 'chartjs' ? (
                                    <EnhancedMarkdownMessage
                                      content={`\`\`\`html\n${(block.payload.code as string) || ''}\n\`\`\``}
                                      renderMode={(block.payload.render_type as string) || 'html'}
                                      proseClass="[&_pre]:m-0"
                                    />
                                  ) : (
                                    <div className="p-3 text-[12px] text-[var(--muted-foreground)]">{(block.payload.description as string) || ''}</div>
                                  )}
                                </div>
                              ) : block.type === 'interactive' || block.type === 'animation' ? (
                                <div className="rounded-lg border overflow-hidden bg-white">
                                  <iframe
                                    srcDoc={(block.payload.code as string) || ''}
                                    className="w-full min-h-[300px] border-0"
                                    sandbox="allow-scripts allow-same-origin"
                                    title={(block.payload.description as string) || block.type}
                                  />
                                </div>
                              ) : block.type === 'user_note' ? (
                                <textarea
                                  className="w-full min-h-[80px] bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] resize-y"
                                  placeholder="在此写下你的笔记..."
                                  defaultValue={content}
                                />
                              ) : (
                                <EnhancedMarkdownMessage
                                  content={content || JSON.stringify(block.payload, null, 2).slice(0, 500)}
                                  proseClass="prose prose-sm dark:prose-invert max-w-none"
                                />
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
                    <p className="text-[13px]">{t('book.selectChapter')}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <BookOpen className="h-12 w-12 text-[var(--muted-foreground)] mx-auto mb-4 opacity-30" />
              <p className="text-[15px] font-medium text-[var(--foreground)] mb-1">
                {t('book.selectBookOrCreate')}
              </p>
              <p className="text-[13px] text-[var(--muted-foreground)] mb-4">
                {t('book.bookEngineDesc')}
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {t('book.createBook')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
