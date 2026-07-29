'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/hooks/use-i18n'
import { Settings2, SlidersHorizontal, FileText, Download, Upload, AlertTriangle } from 'lucide-react'

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

export default function AdvancedSettingsPage() {
  const { t } = useI18n()
  const [contextThreshold, setContextThreshold] = useState(0.8)
  const [logLevel, setLogLevel] = useState('info')
  const [chatImportFormat, setChatImportFormat] = useState('json')
  const [autoTrimHistory, setAutoTrimHistory] = useState(true)
  const [debugMode, setDebugMode] = useState(false)
  const [telemetry, setTelemetry] = useState(false)
  const [experimentalFeatures, setExperimentalFeatures] = useState(false)
  const [streamingEnabled, setStreamingEnabled] = useState(true)
  const [maxRetries, setMaxRetries] = useState(3)

  const handleExportData = () => {
    // Placeholder for data export
  }

  const handleImportData = () => {
    // Placeholder for data import
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">
          <Settings2 className="inline h-5 w-5 mr-2 -mt-0.5" />
          高级设置
        </h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          微调系统行为、日志、数据管理和实验性功能。
        </p>
      </div>

      <div className="space-y-4">
        {/* Context Window Protection */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            上下文窗口保护
          </h3>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[var(--foreground)]">
              保护阈值：{contextThreshold.toFixed(1)}
            </label>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.1}
              value={contextThreshold}
              onChange={(e) => setContextThreshold(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
            <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
              <span>0.1（激进压缩）</span>
              <span>0.5</span>
              <span>1.0（完整上下文）</span>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              控制系统何时开始压缩对话历史以保持在模型的上下文窗口内。较低的值会触发更早的压缩。
            </p>
          </div>

          <ToggleField
            checked={autoTrimHistory}
            onChange={setAutoTrimHistory}
            label="自动裁剪对话历史"
            description="接近上下文限制时自动摘要旧消息"
          />
        </div>

        {/* Logging */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            日志级别
          </label>
          <select
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          >
            <option value="debug">调试 - 详细的开发输出</option>
            <option value="info">信息 - 一般操作消息</option>
            <option value="warn">警告 - 潜在问题和弃用</option>
            <option value="error">错误 - 仅严重故障</option>
          </select>
        </div>

        {/* API Retry */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">
            最大 API 重试次数：{maxRetries}
          </label>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
            <span>0（不重试）</span>
            <span>3</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>

        {/* Chat Import */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            聊天导入设置
          </h3>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[var(--foreground)]">导入格式</label>
            <select
              value={chatImportFormat}
              onChange={(e) => setChatImportFormat(e.target.value)}
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
            >
              <option value="json">JSON（SmartLearn 格式）</option>
              <option value="openai">OpenAI 聊天导出</option>
              <option value="chatgpt">ChatGPT 共享链接</option>
              <option value="markdown">Markdown 转录</option>
            </select>
          </div>

          <p className="text-[11px] text-[var(--muted-foreground)]">
            选择从其他平台导入聊天历史的来源格式。
          </p>
        </div>

        {/* Data Management */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" />
            数据管理
          </h3>

          <div className="flex gap-3">
            <button
              onClick={handleExportData}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              <Download className="h-4 w-4" />
              导出所有数据
            </button>
            <button
              onClick={handleImportData}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              <Upload className="h-4 w-4" />
              导入数据
            </button>
          </div>

          <p className="text-[11px] text-[var(--muted-foreground)]">
            导出包括所有对话、笔记本、知识库和设置。导入将与现有数据合并。
          </p>
        </div>

        {/* Toggle Options */}
        <div className="space-y-3 pt-2">
          <ToggleField
            checked={streamingEnabled}
            onChange={setStreamingEnabled}
            label="流式响应"
            description="逐 Token 流式传输 LLM 响应以获得更快的感知延迟"
          />
          <ToggleField
            checked={debugMode}
            onChange={setDebugMode}
            label="调试模式"
            description="在界面中显示原始 API 请求、Token 计数和模型元数据"
          />
          <ToggleField
            checked={telemetry}
            onChange={setTelemetry}
            label="匿名使用遥测"
            description="发送匿名使用统计数据以帮助改进平台"
          />
          <ToggleField
            checked={experimentalFeatures}
            onChange={setExperimentalFeatures}
            label="实验性功能"
            description="启用开发中的不稳定功能，可能导致意外行为。"
          />
        </div>
      </div>

      {experimentalFeatures && (
        <div className="mt-4 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-medium text-yellow-600">实验性功能已启用</p>
              <p className="text-[12px] text-[var(--muted-foreground)] mt-1">
                您已启用实验性功能。这些功能可能不稳定，并可能在更新之间未经通知即发生变更。
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          {t('settingsNav.applyChanges')}
        </button>
        <button
          onClick={() => {
            setContextThreshold(0.8)
            setLogLevel('info')
            setChatImportFormat('json')
            setAutoTrimHistory(true)
            setDebugMode(false)
            setTelemetry(false)
            setExperimentalFeatures(false)
            setStreamingEnabled(true)
            setMaxRetries(3)
          }}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
        >
          恢复默认
        </button>
      </div>
    </div>
  )
}
