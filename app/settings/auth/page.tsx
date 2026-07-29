'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/hooks/use-i18n'
import { Shield, Clock, Users, KeyRound, LogOut, Trash2 } from 'lucide-react'

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

interface SessionInfo {
  id: string
  userAgent: string
  lastActive: string
  current: boolean
}

const ACTIVE_SESSIONS: SessionInfo[] = [
  { id: '1', userAgent: 'Chrome 124 / Windows 11', lastActive: '刚刚', current: true },
  { id: '2', userAgent: 'Safari 17 / macOS Sonoma', lastActive: '2 小时前', current: false },
  { id: '3', userAgent: 'Firefox 125 / Ubuntu 24.04', lastActive: '1 天前', current: false },
]

export default function AuthSettingsPage() {
  const { t } = useI18n()
  const [authMode] = useState('single')
  const [jwtExpiry] = useState('24 小时')
  const [sessions, setSessions] = useState<SessionInfo[]>(ACTIVE_SESSIONS)
  const [rememberDevice, setRememberDevice] = useState(true)
  const [autoLogout, setAutoLogout] = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState('30')

  const revokeSession = (id: string) => {
    setSessions((s) => s.filter((session) => session.id !== id))
  }

  const revokeAllSessions = () => {
    setSessions((s) => s.filter((session) => session.current))
  }

  const authModeLabels: Record<string, { label: string; description: string; color: string }> = {
    disabled: {
      label: '已禁用',
      description: '无需认证，任何人均可访问。',
      color: 'text-red-500',
    },
    single: {
      label: '单用户',
      description: '通过密码保护的单用户访问。',
      color: 'text-green-500',
    },
    multi: {
      label: '多用户',
      description: '基于账户的认证，支持角色管理。',
      color: 'text-blue-500',
    },
  }

  const currentAuth = authModeLabels[authMode]

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">
          <Shield className="inline h-5 w-5 mr-2 -mt-0.5" />
          认证设置
        </h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          查看认证模式、管理会话和配置访问安全。
        </p>
      </div>

      <div className="space-y-4">
        {/* Auth Mode (Read Only) */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                认证模式
              </p>
              <p className="text-[12px] text-[var(--muted-foreground)] mt-1">{currentAuth.description}</p>
            </div>
            <div className="text-right">
              <span className={cn('text-[14px] font-semibold', currentAuth.color)}>
                {currentAuth.label}
              </span>
              <p className="text-[11px] text-[var(--muted-foreground)]">只读</p>
            </div>
          </div>
        </div>

        {/* JWT Info */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                JWT Token 过期时间
              </p>
              <p className="text-[12px] text-[var(--muted-foreground)] mt-1">
                Token 在此时间后过期，会话将自动失效。
              </p>
            </div>
            <span className="text-[14px] font-semibold text-[var(--foreground)]">{jwtExpiry}</span>
          </div>
        </div>

        {/* Session Timeout */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">
            空闲会话超时（分钟）
          </label>
          <select
            value={sessionTimeout}
            onChange={(e) => setSessionTimeout(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          >
            <option value="15">15 分钟</option>
            <option value="30">30 分钟</option>
            <option value="60">1 小时</option>
            <option value="120">2 小时</option>
            <option value="0">永不（直到 Token 过期）</option>
          </select>
        </div>

        {/* Session Toggles */}
        <div className="space-y-3 pt-2">
          <ToggleField
            checked={rememberDevice}
            onChange={setRememberDevice}
            label="记住受信任设备"
            description="在已验证的设备上跳过重新认证"
          />
          <ToggleField
            checked={autoLogout}
            onChange={setAutoLogout}
            label="空闲时自动登出"
            description="当空闲超时阈值达到时自动登出"
          />
        </div>

        {/* Active Sessions */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="p-4 border-b border-[var(--border)]">
            <h3 className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              活跃会话（{sessions.length}）
            </h3>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-[var(--foreground)]">
                      {session.userAgent}
                    </p>
                    {session.current && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium">
                        当前
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
                    最后活跃：{session.lastActive}
                  </p>
                </div>
                {!session.current && (
                  <button
                    onClick={() => revokeSession(session.id)}
                    className="p-1.5 rounded-md hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-500 transition-colors"
                    title="撤销会话"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          {t('settingsNav.applyChanges')}
        </button>
        <button
          onClick={revokeAllSessions}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--destructive)] text-white hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          撤销所有其他会话
        </button>
      </div>

      <div className="mt-4 p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <p className="text-[12px] text-[var(--muted-foreground)]">
          认证模式在系统层面配置，无法从此面板更改。请联系系统管理员更改认证模式。会话更改立即生效。
        </p>
      </div>
    </div>
  )
}
