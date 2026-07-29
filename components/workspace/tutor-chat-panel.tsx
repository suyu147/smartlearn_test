'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownMessage } from '@/components/chat/markdown-message';
import { X, Send, ChevronLeft, ChevronRight, MessageSquare, Loader2, Paperclip } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings';
import { useSessionsStore } from '@/lib/store/sessions';
import { useResourcesStore } from '@/lib/store/resources';
import { useLearningPathStore } from '@/lib/store/learning-path';
import { useLearningProfileStore } from '@/lib/store/learning-profile';
import { generateId } from '@/lib/utils';
import { RESOURCE_TYPE_LABELS, type Resource } from '@/lib/types/resource';

interface Props {
  selectedResource?: Resource | null;
}

interface AttachedResourcePayload {
  id: string;
  type: Resource['type'];
  title: string;
  content: string;
}

function buildAttachedResourceSummary(resource: Resource): AttachedResourcePayload {
  if (resource.type === 'quiz') {
    return {
      id: resource.id,
      type: resource.type,
      title: resource.title,
      content: resource.content.slice(0, 1000),
    };
  }

  if (resource.type === 'code') {
    return {
      id: resource.id,
      type: resource.type,
      title: resource.title,
      content: resource.content.slice(0, 2000),
    };
  }

  return {
    id: resource.id,
    type: resource.type,
    title: resource.title,
    content: resource.content.slice(0, 4000),
  };
}

export function TutorChatPanel({ selectedResource = null }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedResourceIds, setAttachedResourceIds] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { providerId, modelId, apiKey, baseUrl } = useSettingsStore();
  const { path } = useLearningPathStore();
  const { profile } = useLearningProfileStore();
  const { resources } = useResourcesStore();
  const {
    currentSessionId,
    tutorMessagesBySession,
    appendTutorMessage,
    updateTutorMessage,
  } = useSessionsStore();

  const resourceMap = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);

  const messages = useMemo(
    () => (currentSessionId ? (tutorMessagesBySession[currentSessionId] ?? []) : []),
    [currentSessionId, tutorMessagesBySession],
  );

  const attachedResources = useMemo(
    () => attachedResourceIds.map((id) => resourceMap.get(id)).filter((resource): resource is Resource => Boolean(resource)),
    [attachedResourceIds, resourceMap],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!selectedResource) return;
    setAttachedResourceIds((current) => (current.includes(selectedResource.id) ? current : [selectedResource.id, ...current]));
  }, [selectedResource]);

  useEffect(() => {
    setAttachedResourceIds((current) => current.filter((id) => resourceMap.has(id)));
  }, [resourceMap]);

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center border-l py-3">
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} title="展开智能辅导">
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  async function handleSend() {
    if (!currentSessionId || !input.trim() || isLoading) return;

    const trimmedInput = input.trim();
    const history = messages;
    const attachedResourcesPayload = attachedResources.map(buildAttachedResourceSummary);
    const userMsg = {
      id: generateId(),
      role: 'user' as const,
      content: trimmedInput,
      attachedResourceIds,
    };
    appendTutorMessage(currentSessionId, userMsg);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/smartlearn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tutor_chat',
          sessionId: currentSessionId,
          profile: profile?.dimensions,
          goal: path?.goal ?? '',
          completedNodes: path?.nodes.filter((node) => node.status === 'completed') ?? [],
          currentNodeId: path?.nodes.find((node) => node.status === 'in_progress')?.id ?? null,
          message: trimmedInput,
          conversationHistory: history.slice(-10).map(m => ({ role: m.role, content: m.content, attachedResourceIds: m.attachedResourceIds ?? [] })),
          attachedResources: attachedResourcesPayload,
          currentNodeTitle: path?.nodes.find((node) => node.resources.some((resource) => resource.resourceId === selectedResource?.id))?.title,
          aiConfig: { providerId, modelId, apiKey, baseUrl },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Tutor chat request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const assistantId = generateId();
      let assistantContent = '';

      appendTutorMessage(currentSessionId, {
        id: assistantId,
        role: 'assistant',
        content: '',
        attachedResourceIds,
      });

      let buffer = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'text_delta') {
                assistantContent += data.text;
                updateTutorMessage(currentSessionId, assistantId, assistantContent);
              }
            } catch {
            }
          }
        }
      }
    } catch (error) {
      appendTutorMessage(currentSessionId, {
        id: generateId(),
        role: 'assistant',
        content: '抱歉，我遇到了一些问题，请稍后再试。',
        attachedResourceIds,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex w-[410px] min-w-0 flex-col border-l">
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4" />
          智能辅导
        </h3>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} title="折叠智能辅导">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden" ref={scrollRef}>
        <ScrollArea className="h-full">
          <div className="p-3 pr-5">
            {messages.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-30" />
                学习过程中有任何疑问，随时向 AI 助教提问
              </div>
            )}
            <div className="space-y-3">
              {messages.map(msg => {
                const referenced = (msg.attachedResourceIds ?? [])
                  .map((id) => resourceMap.get(id))
                  .filter((resource): resource is Resource => Boolean(resource));

                return (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`w-full max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-7 break-words ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}>
                      {referenced.length > 0 && (
                        <div className="mb-2 space-y-1.5">
                          {referenced.map((resource) => (
                            <div
                              key={`${msg.id}-${resource.id}`}
                              className={`rounded-md border px-2 py-1 text-[10px] leading-4 break-all ${
                                msg.role === 'user'
                                  ? 'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground'
                                  : 'border-border bg-background/80 text-muted-foreground'
                              }`}
                            >
                              <span className="font-medium">{RESOURCE_TYPE_LABELS[resource.type]}</span>
                              <span> · {resource.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    {msg.role === 'assistant' ? (
                      <MarkdownMessage content={msg.content} />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </div>

      <div className="border-t p-3">
        <div
          className={`mb-3 rounded-lg border border-dashed p-3 transition-colors ${
            dragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const payload = event.dataTransfer.getData('application/x-smartlearn-resource');
            if (!payload) return;
            try {
              const parsed = JSON.parse(payload) as { resourceId?: string };
              if (!parsed.resourceId || !resourceMap.has(parsed.resourceId)) return;
              setAttachedResourceIds((current) =>
                current.includes(parsed.resourceId!) ? current : [parsed.resourceId!, ...current],
              );
            } catch {
            }
          }}
        >
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            当前已附加资源
          </div>
          {attachedResources.length === 0 ? (
            <p className="text-xs text-muted-foreground">将左侧学习路径中的资源拖到这里，或先在中栏打开资源后自动附加。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {attachedResources.map((resource) => (
                <button
                  key={`attached-${resource.id}`}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-xs"
                  onClick={() => {
                    setAttachedResourceIds((current) => current.filter((id) => id !== resource.id));
                  }}
                  title="移除附加资源"
                >
                  <span>{RESOURCE_TYPE_LABELS[resource.type]}</span>
                  <span className="max-w-[140px] truncate">@{resource.title}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="mb-2 text-[11px] text-muted-foreground/70">
          AI 辅导基于当前资源内容回答问题，可附加左侧资源进行针对性提问
        </p>
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="向AI助教提问..."
            className="min-h-[40px] resize-none text-sm"
            rows={1}
            disabled={isLoading || !currentSessionId}
          />
          <Button size="icon" onClick={handleSend} disabled={isLoading || !input.trim() || !currentSessionId}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
