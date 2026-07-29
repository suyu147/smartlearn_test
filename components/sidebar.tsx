'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  GraduationCap,
  BookOpen,
  PenLine,
  Database,
  Brain,
  Settings,
  ChevronLeft,
  ChevronRight,
  Library,
  User,
  LayoutDashboard,
  NotebookPen,
  Bot,
  Zap,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/store/ui-store';
import { useAuthStore } from '@/lib/store/auth-store';
const navGroups = [
  {
    label: '工作台',
    items: [
      { href: '/space', label: '总览', icon: LayoutDashboard },
      { href: '/chat', label: '对话', icon: MessageSquare },
      { href: '/smartlearn', label: '智能学习', icon: GraduationCap },
      { href: '/book', label: '书籍', icon: Library },
      { href: '/co-writer', label: '协作写作', icon: PenLine },
      { href: '/agents', label: '智能体', icon: Bot },
      { href: '/playground', label: '测试场', icon: Zap },
    ],
  },
  {
    label: '数据',
    items: [
      { href: '/knowledge', label: '知识库', icon: Database },
      { href: '/memory', label: '记忆', icon: Brain },
      { href: '/notebook', label: '笔记本', icon: NotebookPen },
    ],
  },
];

const bottomItems = [
  { href: '/profile', label: '个人资料', icon: User },
  { href: '/settings', label: '设置', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const mode = useAuthStore((s) => s.mode);
  return (
    <aside
      className={cn(
        'relative flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-fg transition-[width] duration-200',
        collapsed ? 'w-[60px] min-w-[60px]' : 'w-[220px] min-w-[220px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 h-[57px] border-b border-sidebar-border">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
          <BookOpen className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="text-[15px] font-semibold tracking-tight text-white truncate">
            SmartLearn
          </span>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={toggle}
        className="absolute -right-3 top-4 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:bg-accent transition-colors"
        aria-label="Toggle sidebar"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-foreground" />
        ) : (
          <ChevronLeft className="h-3 w-3 text-foreground" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1">
            {!collapsed && (
              <div className="px-2.5 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">
                {group.label}
              </div>
            )}
            {collapsed && <div className="h-3" />}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-sidebar-accent text-white'
                        : 'text-white/80 hover:bg-sidebar-accent/50 hover:text-white'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                    )}
                    <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {collapsed && (
                      <span className="pointer-events-none absolute left-[52px] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-sidebar px-2.5 py-1 text-xs text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-40">
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-3 py-3">
        {bottomItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-sidebar-accent text-white'
                  : 'text-white/80 hover:bg-sidebar-accent/50 hover:text-white'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
        {!collapsed && (
          <div className="mt-2 flex items-center gap-2.5 px-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary-foreground">
              {(user?.username ?? 'G').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-white/90 truncate">
                {user?.username ?? '访客'}
              </div>
              <div className="text-[11px] text-white/60">
                {user?.role === 'admin' ? '管理员' : '用户'}
              </div>
            </div>
            {mode === 'multi' && (
              <button
                onClick={logout}
                className="shrink-0 rounded-md p-1 text-white/40 hover:text-white/80 hover:bg-sidebar-accent/50 transition-colors"
                title="退出登录"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
