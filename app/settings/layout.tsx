'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bot, Cpu, ToggleRight, Brain, Palette, Wifi, Activity, Zap, Server, Database, UserCircle, Puzzle, BookMarked, Terminal, Shield, Settings2, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/hooks/use-i18n'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { t } = useI18n()

  const navItems = [
    { labelKey: 'settingsNav.llmModels', href: '/settings/llm', icon: Bot },
    { labelKey: 'settingsNav.embeddingModels', href: '/settings/embedding', icon: Cpu },
    { labelKey: 'settingsNav.webSearch', href: '/settings/search', icon: Globe },
    { labelKey: 'settingsNav.capabilities', href: '/settings/capabilities', icon: Zap },
    { labelKey: 'settingsNav.toolToggles', href: '/settings/tools', icon: ToggleRight },
    { labelKey: 'settingsNav.mcpServers', href: '/settings/mcp', icon: Server },
    { labelKey: 'settingsNav.knowledgeBase', href: '/settings/knowledge', icon: Database },
    { labelKey: 'settingsNav.persona', href: '/settings/persona', icon: UserCircle },
    { labelKey: 'settingsNav.skillPacks', href: '/settings/skills', icon: Puzzle },
    { labelKey: 'settingsNav.memory', href: '/settings/memory', icon: Brain },
    { labelKey: 'settingsNav.notebook', href: '/settings/notebook', icon: BookMarked },
    { labelKey: 'settingsNav.sandbox', href: '/settings/sandbox', icon: Terminal },
    { labelKey: 'settingsNav.auth', href: '/settings/auth', icon: Shield },
    { labelKey: 'settingsNav.appearance', href: '/settings/appearance', icon: Palette },
    { labelKey: 'settingsNav.network', href: '/settings/network', icon: Wifi },
    { labelKey: 'settingsNav.advanced', href: '/settings/advanced', icon: Settings2 },
    { labelKey: 'settingsNav.status', href: '/settings/status', icon: Activity },
  ]

  return (
    <div className="flex h-full bg-[var(--background)]">
      {/* Left Navigation */}
      <div className="w-[200px] border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <h2 className="text-[14px] font-semibold text-[var(--foreground)]">{t('settingsNav.settingsCenter')}</h2>
        </div>
        <nav className="flex-1 py-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-r-2 border-[var(--primary)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
                )}
              >
                <Icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right Content */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
