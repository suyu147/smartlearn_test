'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/hooks/use-i18n'
import { Puzzle, Wrench, Code, BookOpen, Calculator, Globe, Image, FileText } from 'lucide-react'

interface SkillPack {
  id: string
  name: string
  description: string
  icon: React.ElementType
  tools: string[]
  enabled: boolean
  category: string
}

const DEFAULT_SKILL_PACKS: SkillPack[] = [
  {
    id: 'code_interpreter',
    name: '代码解释器',
    description: '在沙盒环境中执行 Python、JavaScript 和 TypeScript 代码',
    icon: Code,
    tools: ['python_exec', 'js_exec', 'ts_exec', 'shell_exec'],
    enabled: true,
    category: 'Development',
  },
  {
    id: 'web_scraper',
    name: '网页抓取',
    description: '从网页中提取内容、解析 HTML 和跟踪链接',
    icon: Globe,
    tools: ['fetch_url', 'parse_html', 'extract_tables', 'follow_links'],
    enabled: true,
    category: 'Data',
  },
  {
    id: 'math_solver',
    name: '数学求解',
    description: '高级数学计算、符号代数和方程求解',
    icon: Calculator,
    tools: ['symbolic_math', 'numeric_solve', 'plot_graph', 'matrix_ops'],
    enabled: true,
    category: 'Analysis',
  },
  {
    id: 'document_reader',
    name: '文档阅读器',
    description: '解析和提取 PDF、DOCX、PPTX 等文档格式的文本',
    icon: FileText,
    tools: ['parse_pdf', 'parse_docx', 'parse_pptx', 'parse_csv'],
    enabled: true,
    category: 'Data',
  },
  {
    id: 'image_analyzer',
    name: '图像分析',
    description: '通过 OCR、目标检测和视觉描述分析图像',
    icon: Image,
    tools: ['ocr_extract', 'describe_image', 'detect_objects', 'compare_images'],
    enabled: false,
    category: 'Media',
  },
  {
    id: 'knowledge_builder',
    name: '知识构建器',
    description: '从对话中构建和维护个人知识图谱',
    icon: BookOpen,
    tools: ['extract_entities', 'build_graph', 'query_graph', 'merge_knowledge'],
    enabled: false,
    category: 'Knowledge',
  },
  {
    id: 'api_connector',
    name: 'API 连接器',
    description: '发起带认证支持的 HTTP 请求到外部 API',
    icon: Wrench,
    tools: ['http_get', 'http_post', 'auth_header', 'parse_json'],
    enabled: false,
    category: 'Development',
  },
]

export default function SkillsSettingsPage() {
  const { t } = useI18n()
  const [skillPacks, setSkillPacks] = useState<SkillPack[]>(DEFAULT_SKILL_PACKS)
  const [filterCategory, setFilterCategory] = useState('all')

  const toggleSkill = (id: string) => {
    setSkillPacks((packs) =>
      packs.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    )
  }

  const categories = ['all', ...new Set(skillPacks.map((p) => p.category))]
  const filteredPacks =
    filterCategory === 'all'
      ? skillPacks
      : skillPacks.filter((p) => p.category === filterCategory)

  const enabledCount = skillPacks.filter((p) => p.enabled).length

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">
          <Puzzle className="inline h-5 w-5 mr-2 -mt-0.5" />
          技能包管理
        </h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          启用或禁用技能包以自定义代理的能力。({enabledCount}/{skillPacks.length} 已激活)
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
              filterCategory === cat
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]'
            )}
          >
            {cat === 'all' ? '全部' : cat}
          </button>
        ))}
      </div>

      {/* Skill Pack List */}
      <div className="space-y-3">
        {filteredPacks.map((pack) => {
          const Icon = pack.icon
          return (
            <div
              key={pack.id}
              className={cn(
                'rounded-lg border p-4 transition-colors',
                pack.enabled
                  ? 'border-[var(--primary)]/30 bg-[var(--card)]'
                  : 'border-[var(--border)] bg-[var(--card)]'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div
                    className={cn(
                      'mt-0.5 p-2 rounded-lg',
                      pack.enabled ? 'bg-[var(--primary)]/10' : 'bg-[var(--muted)]'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        pack.enabled ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-[var(--foreground)]">{pack.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
                        {pack.category}
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">{pack.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {pack.tools.map((tool) => (
                        <span
                          key={tool}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--muted)] text-[var(--muted-foreground)] font-mono"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleSkill(pack.id)}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors ml-3 flex-shrink-0',
                    pack.enabled ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      pack.enabled && 'translate-x-5'
                    )}
                  />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => setSkillPacks((packs) => packs.map((p) => ({ ...p, enabled: true })))}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
        >
          全部启用
        </button>
        <button
          onClick={() => setSkillPacks((packs) => packs.map((p) => ({ ...p, enabled: false })))}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
        >
          全部禁用
        </button>
      </div>

      <div className="flex gap-3 mt-3">
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          {t('settingsNav.applyChanges')}
        </button>
      </div>

      <div className="mt-4 p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <p className="text-[12px] text-[var(--muted-foreground)]">
          技能包将相关工具组合成可复用的能力模块。禁用的技能包在对话中不可用。更改将在下次新建对话时生效。
        </p>
      </div>
    </div>
  )
}
