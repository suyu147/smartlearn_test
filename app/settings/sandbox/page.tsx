'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/hooks/use-i18n'
import { Terminal, Clock, HardDrive, Gauge, Code2 } from 'lucide-react'

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

interface LanguageSupport {
  id: string
  name: string
  version: string
  enabled: boolean
}

const DEFAULT_LANGUAGES: LanguageSupport[] = [
  { id: 'python', name: 'Python', version: '3.12', enabled: true },
  { id: 'javascript', name: 'JavaScript', version: 'Node 20', enabled: true },
  { id: 'typescript', name: 'TypeScript', version: 'TS 5.4', enabled: true },
  { id: 'rust', name: 'Rust', version: '1.77', enabled: false },
  { id: 'go', name: 'Go', version: '1.22', enabled: false },
  { id: 'java', name: 'Java', version: 'OpenJDK 21', enabled: false },
  { id: 'cpp', name: 'C++', version: 'GCC 13', enabled: false },
  { id: 'ruby', name: 'Ruby', version: '3.3', enabled: false },
  { id: 'bash', name: 'Bash', version: '5.2', enabled: true },
  { id: 'sql', name: 'SQL', version: 'SQLite 3', enabled: true },
]

export default function SandboxSettingsPage() {
  const { t } = useI18n()
  const [pistonUrl, setPistonUrl] = useState('http://localhost:2000')
  const [pistonApiKey, setPistonApiKey] = useState('')
  const [languages, setLanguages] = useState<LanguageSupport[]>(DEFAULT_LANGUAGES)
  const [executionTimeout, setExecutionTimeout] = useState(15)
  const [maxMemory, setMaxMemory] = useState(256)
  const [dailyQuota, setDailyQuota] = useState(100)
  const [networkAccess, setNetworkAccess] = useState(false)
  const [captureStderr, setCaptureStderr] = useState(true)
  const [logExecutions, setLogExecutions] = useState(true)

  const toggleLanguage = (id: string) => {
    setLanguages((langs) =>
      langs.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
    )
  }

  const enabledCount = languages.filter((l) => l.enabled).length

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">
          <Terminal className="inline h-5 w-5 mr-2 -mt-0.5" />
          沙盒 / 代码执行设置
        </h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          配置 Piston 代码执行引擎、支持的语言和资源限制。
        </p>
      </div>

      <div className="space-y-4">
        {/* Piston API Configuration */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5" />
            Piston API 配置
          </h3>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[var(--foreground)]">API 端点 URL</label>
            <input
              type="text"
              value={pistonUrl}
              onChange={(e) => setPistonUrl(e.target.value)}
              placeholder="http://localhost:2000"
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] font-mono placeholder:text-[var(--muted-foreground)]"
            />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Piston 实例的 URL。可本地部署或使用远程服务器。
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[var(--foreground)]">API 密钥（可选）</label>
            <input
              type="password"
              value={pistonApiKey}
              onChange={(e) => setPistonApiKey(e.target.value)}
              placeholder="无需认证则留空"
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] placeholder:text-[var(--muted-foreground)]"
            />
          </div>
        </div>

        {/* Language Support */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
              语言支持（{enabledCount}/{languages.length} 已启用）
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {languages.map((lang) => (
              <div
                key={lang.id}
                className={cn(
                  'flex items-center justify-between rounded-lg border p-2.5 transition-colors',
                  lang.enabled
                    ? 'border-[var(--primary)]/30 bg-[var(--primary)]/5'
                    : 'border-[var(--border)]'
                )}
              >
                <div>
                  <p className="text-[12px] font-medium text-[var(--foreground)]">{lang.name}</p>
                  <p className="text-[10px] text-[var(--muted-foreground)]">{lang.version}</p>
                </div>
                <button
                  onClick={() => toggleLanguage(lang.id)}
                  className={cn(
                    'relative h-5 w-9 rounded-full transition-colors',
                    lang.enabled ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                      lang.enabled && 'translate-x-4'
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Resource Limits */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5" />
            资源限制
          </h3>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              执行超时：{executionTimeout}秒
            </label>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={executionTimeout}
              onChange={(e) => setExecutionTimeout(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
            <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
              <span>5s</span>
              <span>15s</span>
              <span>30s</span>
              <span>60s</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              最大内存：{maxMemory} MB
            </label>
            <input
              type="range"
              min={64}
              max={1024}
              step={64}
              value={maxMemory}
              onChange={(e) => setMaxMemory(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
            <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
              <span>64 MB</span>
              <span>256 MB</span>
              <span>512 MB</span>
              <span>1 GB</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[var(--foreground)]">
              每日执行配额：{dailyQuota} 次
            </label>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={dailyQuota}
              onChange={(e) => setDailyQuota(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
            <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
              <span>10</span>
              <span>100</span>
              <span>250</span>
              <span>500</span>
            </div>
          </div>
        </div>

        {/* Additional Toggles */}
        <div className="space-y-3 pt-2">
          <ToggleField
            checked={networkAccess}
            onChange={setNetworkAccess}
            label="允许网络访问"
            description="允许代码执行发起出站 HTTP 请求（安全风险）"
          />
          <ToggleField
            checked={captureStderr}
            onChange={setCaptureStderr}
            label="捕获标准错误"
            description="在执行结果中同时包含标准错误输出"
          />
          <ToggleField
            checked={logExecutions}
            onChange={setLogExecutions}
            label="记录所有执行"
            description="记录每次代码执行事件，用于调试和审计"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          {t('settingsNav.applyChanges')}
        </button>
        <button
          onClick={() => {
            setPistonUrl('http://localhost:2000')
            setPistonApiKey('')
            setLanguages(DEFAULT_LANGUAGES)
            setExecutionTimeout(15)
            setMaxMemory(256)
            setDailyQuota(100)
            setNetworkAccess(false)
            setCaptureStderr(true)
            setLogExecutions(true)
          }}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
        >
          恢复默认
        </button>
      </div>
    </div>
  )
}
