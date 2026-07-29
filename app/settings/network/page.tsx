'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/hooks/use-i18n'

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

export default function NetworkPage() {
  const [proxy, setProxy] = useState(false)
  const [retry, setRetry] = useState(true)
  const { t } = useI18n()

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">{t('settingsNav.networkTitle')}</h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          {t('settingsNav.networkDesc')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">API 请求超时（秒）</label>
          <input
            type="text"
            defaultValue="30"
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">代理地址</label>
          <input
            type="text"
            placeholder="http://127.0.0.1:7890"
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">最大并发请求数</label>
          <input
            type="text"
            defaultValue="5"
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div className="space-y-3 pt-2">
          <ToggleField
            checked={proxy}
            onChange={setProxy}
            label="启用 HTTP 代理"
            description="通过代理服务器发送所有 API 请求"
          />
          <ToggleField
            checked={retry}
            onChange={setRetry}
            label="自动重试失败请求"
            description="请求失败时自动重试（最多 3 次，指数退避）"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          {t('settingsNav.applyChanges')}
        </button>
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors">
          {t('settingsNav.testConnection')}
        </button>
      </div>
    </div>
  )
}
