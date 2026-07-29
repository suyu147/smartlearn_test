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

export default function MemorySettingsPage() {
  const [autoIntegrate, setAutoIntegrate] = useState(true)
  const [crossSession, setCrossSession] = useState(true)
  const [forgetCurve, setForgetCurve] = useState(false)
  const { t } = useI18n()

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">{t('settingsNav.memoryTitle')}</h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          {t('settingsNav.memoryDesc')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">L1 短期记忆保留时长</label>
          <select className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]">
            <option>当前会话（会话结束自动整合）</option>
            <option>24 小时</option>
            <option>48 小时</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">L2 中期整合频率</label>
          <select className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]">
            <option>每次会话结束时</option>
            <option>每天一次</option>
            <option>每周一次</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">记忆图谱最大实体数</label>
          <input
            type="text"
            defaultValue="200"
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div className="space-y-3 pt-2">
          <ToggleField
            checked={autoIntegrate}
            onChange={setAutoIntegrate}
            label="自动整合"
            description="会话结束后自动将短期记忆整合到中期和长期记忆"
          />
          <ToggleField
            checked={crossSession}
            onChange={setCrossSession}
            label="跨会话关联"
            description="在记忆图谱中建立跨会话的知识关联"
          />
          <ToggleField
            checked={forgetCurve}
            onChange={setForgetCurve}
            label="遗忘曲线模拟"
            description="根据艾宾浩斯遗忘曲线自动降低旧记忆的权重"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          {t('settingsNav.applyChanges')}
        </button>
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--destructive)] text-white hover:opacity-90 transition-opacity">
          {t('settingsNav.clearAll')}
        </button>
      </div>
    </div>
  )
}
