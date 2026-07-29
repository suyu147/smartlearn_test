'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Bot, User, CheckCircle2, Plus, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { generateId } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLearningProfileStore } from '@/lib/store/learning-profile';
import { useSettingsStore } from '@/lib/store/settings';
import { isProfileComplete, calculateProfileCompleteness } from '@/lib/utils/profile-utils';
import { PROFILE_DIMENSION_LABELS } from '@/lib/types/profile';
import { getApiToken } from '@/lib/auth-token';
import type { ConversationMessage, ProfileDimensions } from '@/lib/types/profile';

interface ProfileChatProps {
  /** 'embedded' = existing embed mode (default), 'onboarding' = fullscreen onboarding */
  mode?: 'embedded' | 'onboarding';
  /** Called when profile is complete (only used in onboarding mode) */
  onComplete?: () => void;
  /** Called when dimensions are updated */
  onDimensionsUpdate?: (dimensions: ProfileDimensions, completeness: number) => void;
}

export function ProfileChat({ mode = 'embedded', onComplete, onDimensionsUpdate }: ProfileChatProps) {
  const isOnboarding = mode === 'onboarding';
  const { providerId, modelId, apiKey, baseUrl } = useSettingsStore();
  const { profile, addConversationMessage, updateDimensions, archiveCurrentProfile, reset } =
    useLearningProfileStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [profileComplete, setProfileComplete] = useState(() => isProfileComplete(profile?.dimensions));
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [dimensionNotice, setDimensionNotice] = useState<{ labels: string[]; completeness: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteCalledRef = useRef(false);
  const createWelcomeMessage = useCallback((): ConversationMessage => ({
    id: generateId(),
    role: 'assistant',
    content:
      '你好！我是你的学习助手，想了解一下你的学习情况，这样我可以为你推荐最合适的学习资源。\n\n让我先问几个问题：\n1. 你目前学过哪些编程语言或技术？\n2. 你更喜欢通过什么方式学习（看视频、读文档、动手写代码）？\n3. 你学习的主要目标是什么？',
    timestamp: Date.now(),
  }), []);

  // 同步 store dimensions 变化到 profileComplete 状态
  useEffect(() => {
    if (isProfileComplete(profile?.dimensions)) {
      setProfileComplete(true);
    }
  }, [profile?.dimensions]);

  // 画像完成后：onboarding模式触发onComplete回调（仅一次），显示完成横幅但不锁定输入
  useEffect(() => {
    if (profileComplete && !onCompleteCalledRef.current) {
      onCompleteCalledRef.current = true;
      if (isOnboarding) {
        onComplete?.();
      }
      // 不再自动跳转，用户可继续补充画像或手动点击"开始学习"
    }
  }, [profileComplete, isOnboarding, onComplete]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([createWelcomeMessage()]);
    }
  }, [messages.length, createWelcomeMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const handleNewChat = () => {
    // 归档当前画像（如果有）
    if (profile) {
      archiveCurrentProfile();
    }
    // 重置 store（清空当前画像）
    reset();
    // 重置本地状态
    setMessages([createWelcomeMessage()]);
    setProfileComplete(false);
    setNewChatOpen(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ConversationMessage = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    addConversationMessage(userMessage);
    setInput('');
    setIsLoading(true);

    try {
      const token = getApiToken();
      const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        reqHeaders['Authorization'] = `Bearer ${token}`;
      }
      // Only pass aiConfig when the user has actually configured a provider and API key.
      // Passing empty defaults (providerId='spark', apiKey='') overrides the server's
      // .env configuration and causes LLM calls to fail with "API key required".
      const effectiveAiConfig =
        providerId && apiKey
          ? { providerId, modelId, apiKey, baseUrl }
          : undefined;

      const response = await fetch('/api/profile/chat', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          message: userMessage.content,
          profile: profile,
          conversationHistory: messages,
          aiConfig: effectiveAiConfig,
        }),
      });

      if (!response.ok) throw new Error('获取回复失败');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      const assistantMessage: ConversationMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (reader) {
        // SSE buffer: events may span multiple chunks, so we must
        // accumulate text and split on double-newline boundaries.
        let sseBuffer = '';

        const processSSEEvents = (data: Record<string, unknown>) => {
          if (data.type === 'content') {
            // Accumulate all content events (including stage='tutor')
            // The tutor_response is mapped to content events with stage='tutor'
            assistantContent += (data.content as string) ?? '';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: assistantContent }
                  : m,
              ),
            );
          } else if (data.type === 'error') {
            // Handle error events from the learning graph (e.g. LLM call failures)
            const errorMsg = (data.content as string) ?? '未知错误';
            console.error('[profile-chat SSE] Error event:', errorMsg);
            assistantContent = errorMsg;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: `抱歉，请求出错：${errorMsg}` }
                  : m,
              ),
            );
          } else if (data.type === 'result') {
            // Handle profile_update events from the learning graph.
            // The event-mapper maps LearnEvent profile_update → StreamEvent
            // with type='result', stage='update_profile', and
            // metadata.learnEventType='profile_update'.
            const meta = (data.metadata ?? {}) as Record<string, unknown>;
            const isProfileUpdate =
              meta.learnEventType === 'profile_update' ||
              data.stage === 'update_profile';

            console.log('[profile-chat SSE] result event:', {
              stage: data.stage,
              learnEventType: meta.learnEventType,
              isProfileUpdate,
              hasDimensions: !!meta.dimensions,
              dimensionsKeys: meta.dimensions ? Object.keys(meta.dimensions as object) : [],
            });

            if (isProfileUpdate && meta.dimensions) {
              const dims = meta.dimensions as ProfileDimensions;
              const completeness = calculateProfileCompleteness(dims);
              console.log('[profile-chat SSE] Updating dimensions. Completeness:', completeness, '%');
              updateDimensions(dims);

              // Build notification with updated dimension labels
              const updatedKeys = Object.keys(dims).filter(
                (k) => k in PROFILE_DIMENSION_LABELS,
              ) as (keyof typeof PROFILE_DIMENSION_LABELS)[];
              const labels = updatedKeys.map((k) => PROFILE_DIMENSION_LABELS[k]);

              setDimensionNotice({ labels, completeness });
              if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
              noticeTimerRef.current = setTimeout(() => setDimensionNotice(null), 4000);

              onDimensionsUpdate?.(dims, completeness);

              // 检查画像是否完整
              if (isProfileComplete(dims)) {
                console.log('[profile-chat SSE] Profile complete! Setting profileComplete=true');
                setProfileComplete(true);
              }
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });

          // Split on double-newline (SSE event boundary).
          // Each event is: "data: {...}\n\n"
          const parts = sseBuffer.split('\n\n');
          // The last part may be incomplete; keep it in the buffer.
          sseBuffer = parts.pop() ?? '';

          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              try {
                const data = JSON.parse(line.slice(6));
                processSSEEvents(data);
              } catch {
                // skip malformed JSON
              }
            }
          }
        }

        // Process any remaining data in the buffer
        if (sseBuffer.trim()) {
          for (const line of sseBuffer.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              processSSEEvents(data);
            } catch {
              // skip malformed JSON
            }
          }
        }
      }

      addConversationMessage({
        ...assistantMessage,
        content: assistantContent,
      });
    } catch (_error) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'assistant',
          content: '抱歉，我遇到了一些问题，请稍后再试。',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col rounded-lg border ${isOnboarding ? 'min-h-0 flex-1' : 'h-[500px]'}`}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Bot className="h-5 w-5 text-violet-500" />
        <span className="font-medium">画像构建助手</span>
        <div className="ml-auto">
          {!isOnboarding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setNewChatOpen(true)}
            title="新建对话"
          >
            <Plus className="h-4 w-4" />
          </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === 'user' ? 'flex-row-reverse' : ''
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  message.role === 'assistant'
                    ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {message.role === 'assistant' ? (
                  <Bot className="h-4 w-4" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  message.role === 'assistant'
                    ? 'bg-muted'
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-lg bg-muted px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dimension update notification */}
      {dimensionNotice && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 transition-all dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
          <TrendingUp className="h-4 w-4 shrink-0" />
          <div>
            <span className="font-medium">画像已更新：</span>
            {dimensionNotice.labels.join('、')}
            <span className="ml-2 font-semibold">({dimensionNotice.completeness}%)</span>
          </div>
        </div>
      )}

      <div className="border-t p-3">
        {profileComplete && !isOnboarding && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">画像构建基本完成!</p>
              <p>你可以继续补充，或前往学习工作台开始学习。</p>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={profileComplete ? '画像已基本完成，继续补充或点击开始学习...' : '输入消息...'}
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 新建对话确认弹窗 */}
      <AlertDialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>新建对话</AlertDialogTitle>
            <AlertDialogDescription>
              {profile
                ? '这将归档当前聊天记录并重新开始构建画像。当前记录会保存到历史中，可随时查看。确定要新建吗？'
                : '这将清空当前聊天并重新开始构建画像，确定要新建吗？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleNewChat}>确认新建</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
