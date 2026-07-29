'use client'

import { FileText, BookOpen, Globe } from 'lucide-react'
import { useI18n } from '@/lib/hooks/use-i18n'

export default function ModelsPage() {
  const { t } = useI18n()

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">{t('settingsNav.modelsTitle')}</h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          {t('settingsNav.modelsDesc')}
        </p>
      </div>

      <div className="space-y-4">
        {/* Search Engine */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <Globe className="h-4 w-4 text-[var(--primary)]" />
            <h3 className="text-[14px] font-semibold text-[var(--foreground)]">搜索引擎配置</h3>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[var(--foreground)]">默认搜索引擎</label>
              <select className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]">
                <option>Tavily Search API</option>
                <option>SerpAPI (Google)</option>
                <option>Bing Web Search</option>
                <option>DuckDuckGo</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[var(--foreground)]">API Key</label>
              <input
                type="password"
                placeholder="输入搜索引擎 API Key"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[var(--foreground)]">最大结果数</label>
              <input
                type="text"
                defaultValue="5"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>
        </div>

        {/* Model Catalog */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <BookOpen className="h-4 w-4 text-[var(--primary)]" />
            <h3 className="text-[14px] font-semibold text-[var(--foreground)]">已注册模型</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-[var(--background)] rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
                <span className="text-[13px] text-[var(--foreground)]">GPT-4o</span>
              </div>
              <span className="text-[11px] text-[var(--success)] font-medium">可用</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[var(--background)] rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
                <span className="text-[13px] text-[var(--foreground)]">Claude 3.5 Sonnet</span>
              </div>
              <span className="text-[11px] text-[var(--success)] font-medium">可用</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[var(--background)] rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
                <span className="text-[13px] text-[var(--foreground)]">DeepSeek-V2</span>
              </div>
              <span className="text-[11px] text-[var(--muted-foreground)] font-medium">未配置</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
          {t('settingsNav.saveConfig')}
        </button>
        <button className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors">
          {t('settingsNav.reset')}
        </button>
      </div>
    </div>
  )
}
