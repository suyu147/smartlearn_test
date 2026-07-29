'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { TopNav } from '@/components/layout/top-nav';
import '@/lib/i18n/config';

export function Providers({ children }: { children: React.ReactNode }) {
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return <I18nProvider>{children}</I18nProvider>;
}

// ---------------------------------------------------------------------------
// AppShell — TopNav + AuthGuard + loading state
// ---------------------------------------------------------------------------

/**
 * Wraps the main content area with:
 * 1. Loading spinner while auth state is being discovered (initAuth in-flight)
 * 2. Auth guard — redirects unauthenticated users to /auth/login in multi mode
 * 3. Conditional TopNav — hidden on /auth/* pages
 *
 * Must be rendered inside <Providers> (needs auth store + i18n).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const mode = useAuthStore((s) => s.mode);
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const hasProfile = useAuthStore((s) => s.hasProfile);

  const isAuthPage = pathname.startsWith('/auth/');
  const isOnboardingPage = pathname.startsWith('/onboarding');

  // --- Compute redirect target (pure, no side-effects during render) ---
  let redirectTo: string | null = null;
  if (isInitialized) {
    if (mode === 'multi' && !user && !isAuthPage) {
      redirectTo = '/auth/login';
    } else if (mode === 'multi' && user && isAuthPage) {
      redirectTo = hasProfile ? '/home' : '/onboarding';
    } else if (mode === 'multi' && user && !hasProfile && !isOnboardingPage && !isAuthPage) {
      // Authenticated but profile not complete → redirect to onboarding
      redirectTo = '/onboarding';
    } else if (user && hasProfile && isOnboardingPage) {
      // Profile complete but still on onboarding page → redirect to home
      redirectTo = '/home';
    }
  }

  // --- Perform redirect outside the render phase ---
  useEffect(() => {
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  // --- Loading state: auth not yet discovered ---
  if (!isInitialized) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  // --- Auth guard: show nothing while redirect is in-flight ---
  if (redirectTo) {
    return null;
  }

  // --- Auth pages and onboarding page: render without TopNav ---
  if (isAuthPage || isOnboardingPage) {
    return <>{children}</>;
  }

  // --- Normal pages: TopNav + main content ---
  return (
    <div className="flex h-screen flex-col bg-background">
      <TopNav />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
