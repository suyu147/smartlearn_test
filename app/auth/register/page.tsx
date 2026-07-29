/**
 * Register Page — New user registration form.
 */

'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLearningProfileStore } from '@/lib/store/learning-profile';
import { useChatStore } from '@/lib/store/chat-store';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const register = useAuthStore((s) => s.register);
  const setHasProfile = useAuthStore((s) => s.setHasProfile);
  const resetLearningProfile = useLearningProfileStore((s) => s.resetForNewUser);
  const resetChat = useChatStore((s) => s.resetForNewUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username.length < 3) {
      setError(t('auth.usernameTooShort'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);

    try {
      await register(username, password);
      // Reset all user-specific stores for the new user
      resetLearningProfile();
      resetChat();
      // New users always need onboarding
      setHasProfile(false);
      router.push('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 rounded-2xl border border-border/50 bg-card p-8 shadow-xl">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('auth.registerTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('auth.registerSubtitle')}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="reg-username" className="text-sm font-medium leading-none">{t('auth.username')}</label>
          <input
            id="reg-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('auth.usernamePlaceholder')}
            required
            autoFocus
            minLength={3}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="reg-password" className="text-sm font-medium leading-none">{t('auth.password')}</label>
          <input
            id="reg-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.passwordPlaceholder')}
            required
            minLength={6}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="reg-confirm" className="text-sm font-medium leading-none">{t('auth.confirmPassword')}</label>
          <input
            id="reg-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('auth.confirmPasswordPlaceholder')}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? t('auth.registering') : t('auth.registerButton')}
        </button>
      </form>

      <div className="text-center text-sm">
        <span className="text-muted-foreground">{t('auth.hasAccount')} </span>
        <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('auth.loginLink')}
        </Link>
      </div>
    </div>
  );
}
