'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Network,
  MessagesSquare,
  BookOpen,
  BookMarked,
  Sparkles,
  Settings,
  User,
  ChevronDown,
  LogOut,
  Bot,
  PenLine,
  Brain,
  NotebookPen,
  GraduationCap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/store/auth-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Top navigation for the redesigned dashboard.
 * Replaces the left Sidebar in the default layout, but the route surface is
 * the same: every link points to an existing page, just with new labels
 * borrowed from the design reference.
 */
const primaryNav = [
  { href: '/home', label: '首页', icon: Home },
  { href: '/smartlearn', label: '智能学习', icon: GraduationCap },
  { href: '/chat', label: 'AI 问答', icon: MessagesSquare },
  { href: '/book', label: '智慧书', icon: BookMarked },
  { href: '/resources', label: '学习资源', icon: BookOpen },
] as const;

const moreNav = [
  { href: '/knowledge', label: '知识库', icon: Network },
  { href: '/co-writer', label: '协作写作', icon: PenLine },
  { href: '/agents', label: '智能体', icon: Bot },
  { href: '/memory', label: '记忆', icon: Brain },
  { href: '/notebook', label: '笔记本', icon: NotebookPen },
] as const;

function isPrimaryActive(pathname: string, href: string) {
  if (href === '/home') return pathname === '/home';
  return pathname === href || pathname.startsWith(href + '/');
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const mode = useAuthStore((s) => s.mode);
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/home" className="group flex shrink-0 items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand text-white font-bold text-[13px] tracking-wide shadow-md shadow-blue-500/20 transition-transform group-hover:scale-105">
            DS
          </div>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-[14px] font-bold tracking-tight text-[var(--foreground)]">
              智学方舟
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              smartlearn 
            </span>
          </div>
        </Link>

        {/* Center menu */}
        <nav className="ml-2 flex flex-1 items-center justify-center">
          <ul className="flex items-center gap-1">
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const active = isPrimaryActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-all',
                      active
                        ? 'bg-[var(--primary)] text-white shadow-sm shadow-blue-500/30'
                        : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
                    )}
                  >
                    <Icon className="h-[15px] w-[15px]" strokeWidth={active ? 2.2 : 1.7} />
                    <span className="hidden md:inline">{item.label}</span>
                  </Link>
                </li>
              );
            })}

            {/* "More" dropdown for the rest of the legacy routes */}
            <li>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="更多"
                  >
                    <span className="hidden md:inline">更多</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {moreNav.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem
                        key={item.href}
                        onSelect={() => router.push(item.href)}
                        className="cursor-pointer"
                      >
                        <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
                        <span>{item.label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          </ul>
        </nav>

        {/* Right side actions */}
        <div className="flex shrink-0 items-center gap-2">
          {/* AI quick action */}
          <Link
            href="/chat"
            className="hidden h-9 w-9 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors hover:bg-blue-50 hover:text-blue-600 sm:inline-flex"
            aria-label="AI 问答"
            title="AI 问答"
          >
            <Sparkles className="h-4 w-4" />
          </Link>

          {/* User avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-full bg-[var(--muted)] py-1 pl-1 pr-3 text-[12.5px] font-medium text-[var(--foreground)] transition-colors hover:bg-blue-50"
                aria-label="用户菜单"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-brand text-[11px] font-bold text-white">
                  {(user?.username ?? 'G').charAt(0).toUpperCase()}
                </span>
                <span className="hidden lg:inline">
                  {user?.username ?? '学习者'}
                </span>
                <ChevronDown className="hidden h-3 w-3 text-[var(--muted-foreground)] lg:inline-block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => router.push('/profile')}>
                <User className="h-4 w-4 text-[var(--muted-foreground)]" />
                <span>个人资料</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/settings')}>
                <Settings className="h-4 w-4 text-[var(--muted-foreground)]" />
                <span>设置</span>
              </DropdownMenuItem>
              {mode === 'multi' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      logout();
                      router.push('/auth/login');
                    }}
                    className="text-[var(--destructive)] focus:text-[var(--destructive)]"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>退出登录</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
