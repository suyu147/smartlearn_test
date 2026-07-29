'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, LayoutDashboard, Users, Settings, MessageSquare, GraduationCap, BookMarked, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';

const navItems = [
  { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/chat', labelKey: 'nav.chat', icon: MessageSquare },
  { href: '/smartlearn', labelKey: 'nav.smartlearn', icon: GraduationCap },
  { href: '/knowledge', labelKey: 'nav.knowledge', icon: BookMarked },
  { href: '/memory', labelKey: 'nav.memory', icon: Brain },
  { href: '/profile', labelKey: 'nav.profile', icon: Users },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-12 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-bold">SmartLearn</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <span className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}>
                  <Icon className="h-3.5 w-3.5" />
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
