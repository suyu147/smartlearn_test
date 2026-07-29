'use client';

import { Sun, Moon, Monitor, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStoreV2 } from '@/lib/store/settings-store';

// ---------------------------------------------------------------------------
// Appearance Page
// ---------------------------------------------------------------------------

export default function AppearancePage() {
  const theme = useSettingsStoreV2((s) => s.theme);
  const language = useSettingsStoreV2((s) => s.language);
  const setTheme = useSettingsStoreV2((s) => s.setTheme);
  const setLanguage = useSettingsStoreV2((s) => s.setLanguage);

  const themes: {
    id: typeof theme;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    desc: string;
  }[] = [
    { id: 'light', label: '浅色', icon: Sun, desc: '始终使用浅色主题' },
    { id: 'dark', label: '深色', icon: Moon, desc: '始终使用深色主题' },
    { id: 'system', label: '跟随系统', icon: Monitor, desc: '跟随系统主题设置' },
    { id: 'glass', label: '毛玻璃', icon: Palette, desc: '毛玻璃拟态效果' },
  ];

  const languages = [
    { id: 'zh-CN', label: '简体中文' },
    { id: 'en-US', label: 'English' },
    { id: 'ja-JP', label: '日本語' },
    { id: 'ru-RU', label: 'Русский' },
  ];

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-1">
          外观设置
        </h1>
        <p className="text-[13px] text-[var(--muted-foreground)]">
          自定义视觉外观、主题和语言
        </p>
      </div>

      <div className="space-y-6">
        {/* Theme Picker */}
        <div className="space-y-3">
          <label className="text-[13px] font-medium text-[var(--foreground)]">
            主题
          </label>
          <div className="grid grid-cols-2 gap-3">
            {themes.map((t) => {
              const Icon = t.icon;
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all',
                    isActive
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                      : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/50',
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        isActive
                          ? 'text-[var(--primary)]'
                          : 'text-[var(--muted-foreground)]',
                      )}
                    />
                    <span
                      className={cn(
                        'text-[13px] font-medium',
                        isActive
                          ? 'text-[var(--primary)]'
                          : 'text-[var(--foreground)]',
                      )}
                    >
                      {t.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {t.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">
            界面语言
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          >
            {languages.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Density */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-[var(--foreground)]">
            显示密度
          </label>
          <select className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]">
            <option>紧凑</option>
            <option>默认</option>
            <option>舒适</option>
          </select>
        </div>
      </div>

      {/* Status */}
      <div className="mt-6 p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <p className="text-[12px] text-[var(--muted-foreground)]">
          设置自动保存。主题更改立即生效。
        </p>
      </div>
    </div>
  );
}
