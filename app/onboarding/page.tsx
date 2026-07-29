'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileChat } from '@/components/profile/profile-chat';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLearningProfileStore } from '@/lib/store/learning-profile';
import { calculateProfileCompleteness, isProfileComplete } from '@/lib/utils/profile-utils';
import { getApiToken } from '@/lib/auth-token';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { ProfileDimensions } from '@/lib/types/profile';

export default function OnboardingPage() {
  const router = useRouter();
  const setHasProfile = useAuthStore((s) => s.setHasProfile);
  const dimensions = useLearningProfileStore((s) => s.profile?.dimensions);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(() => isProfileComplete(dimensions));

  const completeness = calculateProfileCompleteness(dimensions ?? null);

  // Debug: log dimension changes
  console.log('[OnboardingPage] dimensions changed, completeness:', completeness, '%', 'isComplete:', isComplete, 'dimensionKeys:', dimensions ? Object.keys(dimensions) : 'null');

  // 同步 store dimensions 变化到 isComplete 状态
  if (isProfileComplete(dimensions) && !isComplete) {
    setIsComplete(true);
  }

  const markCompleteAndRedirect = useCallback(async () => {
    setCompleting(true);
    setError(null);
    try {
      const token = getApiToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/v1/profile/complete', {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error('标记画像完成失败');
      setHasProfile(true);
      router.push('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      setCompleting(false);
    }
  }, [router, setHasProfile]);

  // Called by ProfileChat when isProfileComplete threshold is reached
  const handleProfileComplete = useCallback(() => {
    setIsComplete(true);
  }, []);

  // Called by ProfileChat on each dimension update
  const handleDimensionsUpdate = useCallback((dims: ProfileDimensions, _completeness: number) => {
    if (isProfileComplete(dims)) {
      setIsComplete(true);
    }
  }, []);

  // Skip for now — go to main page without completing profile
  const handleSkip = useCallback(async () => {
    await markCompleteAndRedirect();
  }, [markCompleteAndRedirect]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {isComplete ? '画像构建完成！' : '欢迎！让我们设置你的学习画像'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isComplete
                ? '你的学习画像已准备就绪，开始个性化学习之旅吧。'
                : '这将帮助我们为你提供个性化的学习体验。'}
            </p>
          </div>
          {!isComplete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              disabled={completing}
            >
              {completing ? '保存中...' : '稍后完善'}
            </Button>
          )}
        </div>
      </header>

      {/* Progress bar */}
      <div className="mx-auto w-full max-w-3xl px-6 pt-4">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-primary'}`}
              style={{ width: `${completeness}%` }}
            />
          </div>
          <span className={`text-sm font-medium ${isComplete ? 'text-green-600' : 'text-muted-foreground'}`}>
            {completeness}%
          </span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-auto mt-3 max-w-3xl px-6">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        </div>
      )}

      {/* Completion banner */}
      {isComplete && (
        <div className="mx-auto mt-4 w-full max-w-3xl px-6">
          <div className="flex items-center justify-between rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4 dark:border-green-800 dark:from-green-950 dark:to-emerald-950">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-green-800 dark:text-green-200">画像构建完成！</p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  已为你收集 {completeness}% 的学习画像信息
                </p>
              </div>
            </div>
            <Button
              onClick={markCompleteAndRedirect}
              disabled={completing}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {completing ? '保存中...' : (
                <>
                  开始学习
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Profile chat */}
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col px-6 py-4">
        <ProfileChat
          mode="onboarding"
          onComplete={handleProfileComplete}
          onDimensionsUpdate={handleDimensionsUpdate}
        />
      </div>
    </div>
  );
}
