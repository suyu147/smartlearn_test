'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/hooks/use-i18n'
import { BookMarked, FileDown, Save, Layout } from 'lucide-react'

interface ToggleFieldProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleField({ label, description, checked, onChange }: ToggleFieldProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4 bg-[var(--card)]">
      <div className="space-y-0.5">
        <p className="text-[13px] font-medium text-[var(--foreground)]">{label}</p>
        <p className="text-[12px] text-[var(--muted-foreground)]">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </button>
    </div>
  )
}

export default function NotebookSettingsPage() {
  const { t } = useI18n()
  const [defaultFormat, setDefaultFormat] = useState('markdown')
  const [autoSave, setAutoSave] = useState(true)
  const [autoSaveInterval, setAutoSaveInterval] = useState('30')
  const [maxNotesPerNotebook, setMaxNotesPerNotebook] = useState(100)
  const [exportFormat, setExportFormat] = useState('pdf')
  const [includeTimestamps, setIncludeTimestamps] = useState(true)
  const [includeSources, setIncludeSources] = useState(true)
  const [smartOrganize, setSmartOrganize] = useState(false)
  const [defaultTemplate, setDefaultTemplate] = useState('blank')

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">
          <BookMarked className="inline h-5 w-5 mr-2 -mt-0.5" />
          笔记本设置
        </h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          配置默认笔记本行为、自动保存和导出偏好。
        </p>
      </div>

      <div className="space-y-4">
        {/* Format Settings */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
            <Layout className="h-3.5 w-3.5" />
            默认笔记本格式
          </label>
          <select
            value={defaultFormat}
            onChange={(e) => setDefaultFormat(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          >
            <option value="markdown">Markdown</option>
            <option value="richtext">富文本（所见即所得）</option>
            <option value="plaintext">纯文本</option>
            <option value="ipynb">Jupyter 笔记本（.ipynb）</option>
          </select>
        </div>

        {/* Default Template */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">默认模板</label>
          <select
            value={defaultTemplate}
            onChange={(e) => setDefaultTemplate(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          >
            <option value="blank">空白笔记本</option>
            <option value="study_notes">学习笔记模板</option>
            <option value="research_log">研究日志模板</option>
            <option value="meeting_notes">会议记录模板</option>
            <option value="project_plan">项目计划模板</option>
          </select>
        </div>

        {/* Auto-save Settings */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            自动保存配置
          </h3>

          <ToggleField
            checked={autoSave}
            onChange={setAutoSave}
            label="启用自动保存"
            description="按固定间隔自动保存笔记本更改"
          />

          {autoSave && (
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[var(--foreground)]">
                自动保存间隔
              </label>
              <select
                value={autoSaveInterval}
                onChange={(e) => setAutoSaveInterval(e.target.value)}
                className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              >
                <option value="10">每 10 秒</option>
                <option value="30">每 30 秒</option>
                <option value="60">每 1 分钟</option>
                <option value="300">每 5 分钟</option>
              </select>
            </div>
          )}
        </div>

        {/* Max Notes */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">
            每个笔记本最大笔记数
          </label>
          <input
            type="number"
            value={maxNotesPerNotebook}
            onChange={(e) => setMaxNotesPerNotebook(Number(e.target.value))}
            min={10}
            max={1000}
            step={10}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          />
          <p className="text-[11px] text-[var(--muted-foreground)]">
            单个笔记本中允许的最大笔记数量。
          </p>
        </div>

        {/* Export Format */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <FileDown className="h-3.5 w-3.5" />
            导出偏好
          </h3>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[var(--foreground)]">默认导出格式</label>
            <div className="grid grid-cols-4 gap-2">
              {['pdf', 'markdown', 'docx', 'html'].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setExportFormat(fmt)}
                  className={cn(
                    'rounded-lg border p-2.5 text-center transition-colors',
                    exportFormat === fmt
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                      : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                  )}
                >
                  <p className="text-[12px] font-medium text-[var(--foreground)] uppercase">{fmt}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <ToggleField
              checked={includeTimestamps}
              onChange={setIncludeTimestamps}
              label="包含时间戳"
            description="在导出的笔记中添加创建和修改日期"
          />
          <ToggleField
            checked={includeSources}
            onChange={setIncludeSources}
            label="包含来源引用"
            description="在导出末尾附加引用的来源和参考文献"
            />
          </div>
        </div>

        {/* Smart Organize */}
        <ToggleField
          checked={smartOrganize}
          onChange={setSmartOrganize}
          label="智能整理"
          description="根据内容自动建议笔记本整理方式和标签"
        />
      </div>

      <div className="flex gap-3 mt-6">
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          {t('settingsNav.applyChanges')}
        </button>
        <button
          onClick={() => {
            setDefaultFormat('markdown')
            setAutoSave(true)
            setAutoSaveInterval('30')
            setMaxNotesPerNotebook(100)
            setExportFormat('pdf')
            setIncludeTimestamps(true)
            setIncludeSources(true)
            setSmartOrganize(false)
            setDefaultTemplate('blank')
          }}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
        >
          恢复默认
        </button>
      </div>
    </div>
  )
}
