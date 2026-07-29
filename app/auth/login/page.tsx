/**
 * Login Page — User authentication form.
 */

'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLearningProfileStore } from '@/lib/store/learning-profile';
import { useChatStore } from '@/lib/store/chat-store';
import { getApiToken } from '@/lib/auth-token';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useAuthStore((s) => s.login);
  const setHasProfile = useAuthStore((s) => s.setHasProfile);
  const resetLearningProfile = useLearningProfileStore((s) => s.resetForNewUser);
  const resetChat = useChatStore((s) => s.resetForNewUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      // Reset all user-specific stores for the new user
      resetLearningProfile();
      resetChat();
      // Fetch hasProfile from auth status (with the new JWT token)
      let hasProfile = false;
      try {
        const token = getApiToken();
        const statusHeaders: Record<string, string> = {};
        if (token) {
          statusHeaders['Authorization'] = `Bearer ${token}`;
        }
        const statusRes = await fetch('/api/v1/auth/status', {
          headers: statusHeaders,
        });
        if (statusRes.ok) {
          const { data } = await statusRes.json();
          hasProfile = data.hasProfile ?? false;
          setHasProfile(hasProfile);
        }
      } catch {
        // If status check fails, default to onboarding (safer)
      }
      router.push(hasProfile ? '/chat' : '/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 rounded-2xl border border-border/50 bg-card p-8 shadow-xl">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('auth.loginTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('auth.loginSubtitle')}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="username" className="text-sm font-medium leading-none">{t('auth.username')}</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('auth.usernamePlaceholder')}
            required
            autoFocus
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium leading-none">{t('auth.password')}</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.passwordPlaceholder')}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? t('auth.loggingIn') : t('auth.loginButton')}
        </button>
      </form>

      <div className="text-center text-sm">
        <span className="text-muted-foreground">{t('auth.noAccount')} </span>
        <Link href="/auth/register" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('auth.registerLink')}
        </Link>
      </div>
    </div>
  );
}
