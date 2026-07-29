'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Settings,
  BookOpen,
  Send,
  MessageSquare,
  Lightbulb,
  HelpCircle,
  Search as SearchIcon,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  Bot,
  StopCircle,
  X,
  Sparkles,
  RefreshCw,
  Upload,
  ImageIcon,
  Mic,
  MicOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/lib/store/chat-store';
import { useSessionStore } from '@/lib/store/session-store';
import { useSettingsStoreV2 } from '@/lib/store/settings-store';
import { useSettingsStore } from '@/lib/store/settings';
import { useKnowledgeStore } from '@/lib/store/knowledge-store';
import { useTurnStream, type ToolCallInfo } from '@/lib/hooks/use-turn-stream';
import { EnhancedMarkdownMessage } from '@/components/chat/markdown-message';
import { ToolCallCard } from '@/components/chat/tool-call-card';
import { SourceCard, type SourceItem } from '@/components/chat/source-card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Capability = 'chat' | 'solve' | 'quiz' | 'research' | 'visualize';

const capabilities: {
  id: Capability;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  capabilityName: string;
}[] = [
  { id: 'chat', label: '对话', icon: MessageSquare, capabilityName: 'chat' },
  { id: 'solve', label: '解题', icon: Lightbulb, capabilityName: 'deep_solve' },
  { id: 'quiz', label: '测验', icon: HelpCircle, capabilityName: 'mastery_path' },
  { id: 'research', label: '研究', icon: SearchIcon, capabilityName: 'deep_research' },
  { id: 'visualize', label: '可视化', icon: BarChart3, capabilityName: 'visualize' },
];

// ---------------------------------------------------------------------------
// Chat Page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  // Store selectors
  const messages = useChatStore((s) => s.messages);
  const isStreamingStore = useChatStore((s) => s.isStreaming);
  const activeCapability = useChatStore((s) => s.currentCapability);
  const setCapability = useChatStore((s) => s.setCapability);
  const clearMessages = useChatStore((s) => s.clearMessages);

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const addSession = useSessionStore((s) => s.addSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const settings = useSettingsStoreV2();
  const v1Settings = useSettingsStore();
  const knowledgeBases = useKnowledgeStore((s) => s.knowledgeBases);

  // Resolve effective provider/model/apiKey: smartlearn* fields take priority,
  // then fall back to v1 settings store values.
  // IMPORTANT: only pass non-empty values — falsy values will fall back to env vars on the server
  const effectiveProviderId = settings.smartlearnProviderId || v1Settings.providerId || undefined;
  const effectiveModelId = settings.smartlearnModelId || v1Settings.modelId || undefined;
  const effectiveApiKey = settings.smartlearnApiKey || v1Settings.apiKey || undefined;
  const effectiveBaseUrl = settings.smartlearnBaseUrl || v1Settings.baseUrl || undefined;

  // Turn stream
  const stream = useTurnStream();

  // Local UI state
  const [messageInput, setMessageInput] = useState('');
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [toolCallsExpanded, setToolCallsExpanded] = useState(true);
  const [selectedKBs, setSelectedKBs] = useState<string[]>([]);

  // 图片附件状态：每项为 { dataUrl, mimeType, filename }
  const [pendingImages, setPendingImages] = useState<
    Array<{ dataUrl: string; mimeType: string; filename: string }>
  >([]);
  // 语音输入状态
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<unknown>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, stream.getStreamingContent()]);

  // Ensure there's an active session
  useEffect(() => {
    if (!activeSessionId) {
      const newSession = {
        id: `session-${Date.now()}`,
        title: '新对话',
        mode: 'chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active' as const,
      };
      addSession(newSession);
      setActiveSession(newSession.id);
    }
  }, [activeSessionId, addSession, setActiveSession]);

  // --- 图片处理 ---

  // 将图片文件压缩为 data URL（最大宽度 1024px，保持比例）
  const compressImage = useCallback(
    (file: File, maxWidth = 1024): Promise<{ dataUrl: string; mimeType: string }> => {
      return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
          reject(new Error('仅支持图片文件'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas 上下文不可用'));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            // 统一输出为 JPEG 以减小体积
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve({ dataUrl, mimeType: 'image/jpeg' });
          };
          img.onerror = () => reject(new Error('图片加载失败'));
          img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
      });
    },
    [],
  );

  // 处理选中的图片文件
  const handleImageSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const maxImages = 4;
      const remaining = maxImages - pendingImages.length;
      if (remaining <= 0) return;
      const toProcess = Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, remaining);

      for (const file of toProcess) {
        try {
          const { dataUrl, mimeType } = await compressImage(file);
          setPendingImages((prev) => [
            ...prev,
            { dataUrl, mimeType, filename: file.name },
          ]);
        } catch (err) {
          console.error('图片处理失败:', err);
        }
      }
    },
    [compressImage, pendingImages.length],
  );

  // 从 data URL 中提取 base64 部分（去掉 data:image/jpeg;base64, 前缀）
  const extractBase64 = useCallback((dataUrl: string): string => {
    const commaIdx = dataUrl.indexOf(',');
    return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  }, []);

  // 粘贴图片支持
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        imageFiles.forEach((f) => dt.items.add(f));
        handleImageSelect(dt.files);
      }
    };
    textarea.addEventListener('paste', handlePaste);
    return () => textarea.removeEventListener('paste', handlePaste);
  }, [handleImageSelect]);

  // --- 语音识别 ---

  // 初始化 Web Speech API
  useEffect(() => {
    const SpeechRecognitionImpl =
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognitionImpl) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new (SpeechRecognitionImpl as new () => {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: (event: { error: string }) => void;
      start: () => void;
      stop: () => void;
    })();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalTranscript = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        // results 项没有 isFinal 属性在类型中，用 0/1 判断
        if (i === event.results.length - 1 && (result as unknown as { isFinal?: boolean }).isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      // 实时显示中间结果
      const current = finalTranscript + interim;
      setMessageInput(current);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error('语音识别错误:', event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const toggleVoiceInput = useCallback(() => {
    const recognition = recognitionRef.current as {
      start: () => void;
      stop: () => void;
    } | null;
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
      } catch (err) {
        console.error('启动语音识别失败:', err);
        setIsListening(false);
      }
    }
  }, [isListening]);

  // Handle send
  const handleSend = useCallback(async () => {
    const text = messageInput.trim();
    // 允许只有图片无文字时也发送（只要有图片就可以）
    if ((!text && pendingImages.length === 0) || stream.isStreaming) return;

    const sentImages = pendingImages;
    const attachments = sentImages.map((img, idx) => ({
      type: 'image',
      base64: extractBase64(img.dataUrl),
      mimeType: img.mimeType,
      filename: img.filename || `image-${idx + 1}.jpg`,
      id: `img-${Date.now()}-${idx}`,
    }));
    const imageUrls = sentImages.map((img) => img.dataUrl);

    setMessageInput('');
    setPendingImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Build conversation history from store messages (last 20)
    const history = messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const cap = capabilities.find((c) => c.id === activeCapability);

    await stream.send({
      sessionId: activeSessionId ?? `session-${Date.now()}`,
      message: text || '请分析这张图片',
      capability: cap?.capabilityName,
      knowledgeBases: selectedKBs.length > 0 ? selectedKBs : undefined,
      language: settings.language,
      providerId: effectiveProviderId,
      modelId: effectiveModelId,
      apiKey: effectiveApiKey,
      baseUrl: effectiveBaseUrl,
      conversationHistory: history,
      attachments: attachments.length > 0 ? attachments : undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });
  }, [
    messageInput,
    pendingImages,
    stream,
    messages,
    activeCapability,
    activeSessionId,
    selectedKBs,
    settings.language,
    effectiveProviderId,
    effectiveModelId,
    effectiveApiKey,
    effectiveBaseUrl,
    extractBase64,
  ]);

  // Handle regenerate
  const handleRegenerate = useCallback(
    async (assistantMsgId: string) => {
      if (stream.isStreaming) return;

      // Find the assistant message and the preceding user message
      const allMsgs = messages;
      const assistantIdx = allMsgs.findIndex((m) => m.id === assistantMsgId);
      if (assistantIdx < 0) return;

      let userMsgContent = '';
      for (let i = assistantIdx - 1; i >= 0; i--) {
        if (allMsgs[i].role === 'user') {
          userMsgContent = allMsgs[i].content;
          break;
        }
      }
      if (!userMsgContent) return;

      // Build conversation history from messages BEFORE the user message
      const history = allMsgs.slice(0, assistantIdx - 1).slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const cap = capabilities.find((c) => c.id === activeCapability);

      await stream.regenerate(assistantMsgId, {
        sessionId: activeSessionId ?? `session-${Date.now()}`,
        message: userMsgContent,
        capability: cap?.capabilityName,
        knowledgeBases: selectedKBs.length > 0 ? selectedKBs : undefined,
        language: settings.language,
        providerId: effectiveProviderId,
        modelId: effectiveModelId,
        apiKey: effectiveApiKey,
        baseUrl: effectiveBaseUrl,
        conversationHistory: history,
      });
    },
    [stream, messages, activeCapability, activeSessionId, selectedKBs, settings.language, effectiveProviderId, effectiveModelId, effectiveApiKey, effectiveBaseUrl],
  );

  // Import dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    conversations: Array<{ title: string; messageCount: number; format: string }>;
  } | null>(null);
  const [importError, setImportError] = useState('');

  const handleImportFile = useCallback(async (file: File) => {
    setImportLoading(true);
    setImportError('');
    setImportPreview(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = (await import('@/lib/auth-token')).getApiToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/v1/chat/import', {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: '导入失败' }));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setImportPreview(data.data ?? data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImportLoading(false);
    }
  }, []);

  const handleImportText = useCallback(async () => {
    if (!importText.trim()) return;
    setImportLoading(true);
    setImportError('');
    setImportPreview(null);
    try {
      const token = (await import('@/lib/auth-token')).getApiToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/v1/chat/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: importText }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: '导入失败' }));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setImportPreview(data.data ?? data);

      // Load imported conversations into the session store
      const conversations = data.data?.conversations ?? data.conversations ?? [];
      for (const conv of conversations) {
        addSession({
          id: conv.id ?? `imported-${Date.now()}`,
          title: conv.title ?? '导入的对话',
          mode: 'chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'active' as const,
        });
      }
      setImportOpen(false);
      setImportText('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImportLoading(false);
    }
  }, [importText, addSession]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  // Get current streaming content for live display
  const streamingContent = stream.getStreamingContent();

  // Active session info
  const currentSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-full bg-[var(--background)]">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-[var(--foreground)]">
              {currentSession?.title ?? '对话'}
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
              {capabilities.find((c) => c.id === activeCapability)?.label ?? '对话'}
            </span>
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                清空
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
              title="导入对话记录"
            >
              <Upload className="h-[18px] w-[18px] text-[var(--muted-foreground)]" />
            </button>
            <button className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
              <Search className="h-[18px] w-[18px] text-[var(--muted-foreground)]" />
            </button>
            <button className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
              <Settings className="h-[18px] w-[18px] text-[var(--muted-foreground)]" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 && !stream.isStreaming && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Sparkles className="h-10 w-10 text-[var(--muted-foreground)] mb-4 opacity-40" />
              <h2 className="text-[16px] font-medium text-[var(--foreground)] mb-2">
                开始对话
              </h2>
              <p className="text-[13px] text-[var(--muted-foreground)] max-w-sm">
                提问、解题或探索话题。选择下方的功能模式来切换交互方式。
              </p>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[70%] bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-2xl rounded-tr-sm px-4 py-3">
                    {/* 显示附带的图片 */}
                    {msg.imageUrls && msg.imageUrls.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.imageUrls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`附件 ${idx + 1}`}
                            className="rounded-lg max-h-32 object-cover"
                          />
                        ))}
                      </div>
                    )}
                    <p className="text-[13.5px] leading-relaxed">{msg.content}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)] mt-1 text-right">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            }

            // Assistant message
            return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[85%] space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="h-4 w-4 text-[var(--primary)]" />
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      助手
                    </span>
                  </div>

                  {/* Thinking block */}
                  {msg.thinking && (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden mb-2">
                      <button
                        onClick={() => setThinkingExpanded(!thinkingExpanded)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--muted)] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-3.5 w-3.5 text-[var(--primary)]" />
                          <span className="text-[12px] font-medium text-[var(--foreground)]">
                            思考过程
                          </span>
                        </div>
                        {thinkingExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                        )}
                      </button>
                      {thinkingExpanded && (
                        <div className="px-4 pb-3 border-t border-[var(--border)] pt-3">
                          <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed whitespace-pre-wrap">
                            {msg.thinking}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tool calls — enhanced cards */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {msg.toolCalls.map((tc, idx) => (
                        <ToolCallCard
                          key={idx}
                          toolName={tc.name}
                          args={tc.input ? (() => { try { return JSON.parse(tc.input) as Record<string, unknown>; } catch { return undefined; } })() : undefined}
                        />
                      ))}
                    </div>
                  )}

                  {/* Message content — enhanced markdown */}
                  <EnhancedMarkdownMessage
                    content={msg.content}
                    className="text-[var(--foreground)]"
                    proseClass="prose prose-sm dark:prose-invert max-w-none prose-p:leading-7 prose-li:leading-7"
                    renderMode={msg.renderMode}
                  />
                  <div className="flex items-center gap-3">
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {!stream.isStreaming && (
                      <button
                        onClick={() => handleRegenerate(msg.id)}
                        className="p-1 rounded hover:bg-[var(--muted)] transition-colors group"
                        title="重新生成"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Live streaming indicator + content */}
          {stream.isStreaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="h-4 w-4 text-[var(--primary)]" />
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    助手
                  </span>
                  {stream.stage && (
                    <span className="text-[10px] text-[var(--primary)] font-medium bg-[var(--primary)]/10 px-1.5 py-0.5 rounded">
                      {stream.stage}
                    </span>
                  )}
                </div>

                {/* Live thinking */}
                {stream.thinking && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden mb-2">
                    <button
                      onClick={() => setThinkingExpanded(!thinkingExpanded)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--muted)] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-3.5 w-3.5 text-[var(--primary)] animate-pulse" />
                        <span className="text-[12px] font-medium text-[var(--foreground)]">
                          思考中...
                        </span>
                      </div>
                      {thinkingExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      )}
                    </button>
                    {thinkingExpanded && (
                      <div className="px-4 pb-3 border-t border-[var(--border)] pt-3">
                        <p className="text-[12px] text-[var(--muted-foreground)] leading-relaxed whitespace-pre-wrap">
                          {stream.thinking}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Live tool calls */}
                {stream.toolCalls.length > 0 && toolCallsExpanded && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {stream.toolCalls.map((tc, idx) => (
                      <div
                        key={idx}
                        className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"
                      >
                        {tc.status === 'running' ? (
                          <Loader2 className="h-3 w-3 text-[var(--primary)] animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                        )}
                        <span className="text-[11px] text-[var(--muted-foreground)]">
                          {tc.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live streaming content — enhanced markdown */}
                {streamingContent ? (
                  <div className="text-[var(--foreground)]">
                    <EnhancedMarkdownMessage
                      content={streamingContent}
                      proseClass="prose prose-sm dark:prose-invert max-w-none prose-p:leading-7 prose-li:leading-7"
                    />
                    <span className="inline-block w-1.5 h-4 bg-[var(--primary)] animate-pulse ml-0.5 align-middle" />
                  </div>
                ) : (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-3 flex items-center gap-1">
                    <div className="flex gap-1">
                      <div
                        className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <div
                        className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <div
                        className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ask_user prompt */}
          {stream.waitForInput && (
            <div className="flex justify-start">
              <div className="bg-[var(--card)] border-2 border-[var(--primary)]/30 rounded-xl p-4 max-w-[70%]">
                <p className="text-[13px] text-[var(--foreground)] mb-3">
                  {stream.waitForInput.prompt || '助手需要你的输入：'}
                </p>
                <div className="flex gap-2">
                  <input
                    ref={userInputRef}
                    type="text"
                    className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--primary)]"
                    placeholder="输入你的回答..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        stream.submitInput(e.currentTarget.value.trim());
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const input = userInputRef.current;
                      if (input?.value?.trim()) {
                        stream.submitInput(input.value.trim());
                        input.value = '';
                      }
                    }}
                    className="px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-[13px] font-medium hover:opacity-90"
                  >
                    提交
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {stream.error && (
            <div className="flex justify-start">
              <div className="bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 rounded-xl px-4 py-3 max-w-[70%]">
                <p className="text-[13px] text-[var(--destructive)]">{stream.error}</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Capability Tabs */}
        <div className="border-t border-[var(--border)] px-6 py-3">
          <div className="flex gap-2">
            {capabilities.map((cap) => {
              const Icon = cap.icon;
              return (
                <button
                  key={cap.id}
                  onClick={() => setCapability(cap.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all',
                    activeCapability === cap.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--accent)]',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cap.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-[var(--border)] px-6 py-4">
          {/* 图片预览区 */}
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {pendingImages.map((img, idx) => (
                <div
                  key={idx}
                  className="relative group"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.filename}
                    className="rounded-lg h-20 w-20 object-cover border border-[var(--border)]"
                  />
                  <button
                    onClick={() =>
                      setPendingImages((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="absolute -top-1.5 -right-1.5 bg-[var(--destructive)] text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="移除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleImageSelect(e.target.files);
              if (imageInputRef.current) imageInputRef.current.value = '';
            }}
          />

          <div className="flex gap-2 items-end">
            <button
              onClick={() => imageInputRef.current?.click()}
              className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
              title="上传图片"
            >
              <ImageIcon className="h-[18px] w-[18px] text-[var(--muted-foreground)]" />
            </button>
            {speechSupported && (
              <button
                onClick={toggleVoiceInput}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  isListening
                    ? 'bg-[var(--destructive)]/10 text-[var(--destructive)]'
                    : 'hover:bg-[var(--muted)] text-[var(--muted-foreground)]',
                )}
                title={isListening ? '停止录音' : '语音输入'}
              >
                {isListening ? (
                  <MicOff className="h-[18px] w-[18px]" />
                ) : (
                  <Mic className="h-[18px] w-[18px]" />
                )}
              </button>
            )}
            <button className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
              <BookOpen className="h-[18px] w-[18px] text-[var(--muted-foreground)]" />
            </button>
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={messageInput}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? '正在聆听...' : '输入消息或粘贴图片...'}
                className={cn(
                  'w-full bg-[var(--card)] border rounded-lg px-4 py-2.5 text-[13.5px] text-[var(--foreground)] outline-none resize-none min-h-[44px] max-h-[120px]',
                  isListening
                    ? 'border-[var(--destructive)] animate-pulse'
                    : 'border-[var(--border)] focus:border-[var(--primary)]',
                )}
                rows={1}
                disabled={stream.isStreaming}
              />
            </div>
            {stream.isStreaming ? (
              <button
                onClick={stream.cancel}
                className="px-4 py-2.5 rounded-lg bg-[var(--destructive)] text-white hover:opacity-90 transition-opacity"
              >
                <StopCircle className="h-[18px] w-[18px]" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!messageInput.trim() && pendingImages.length === 0}
                className={cn(
                  'px-4 py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity',
                  !messageInput.trim() && pendingImages.length === 0 && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Send className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-2 text-center">
            回车发送 · Shift+回车换行 · 可粘贴或上传图片 · {speechSupported ? '点击麦克风语音输入' : '当前浏览器不支持语音输入'}
          </p>
        </div>
      </div>

      {/* Right Activity Panel */}
      <div className="w-80 border-l border-[var(--border)] bg-[var(--card)] overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Agent Status */}
          <div className="space-y-2">
            <h3 className="text-[12px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
              智能体状态
            </h3>
            <div className="bg-[var(--background)] rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-[var(--foreground)]">状态</span>
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    stream.isStreaming
                      ? 'text-[var(--primary)]'
                      : stream.error
                        ? 'text-[var(--destructive)]'
                        : 'text-[var(--success)]',
                  )}
                >
                  {stream.isStreaming
                    ? '运行中'
                    : stream.error
                      ? '错误'
                      : '就绪'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-[var(--foreground)]">
                  活跃工具
                </span>
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {stream.toolCalls.filter((tc) => tc.status === 'running').length}
                </span>
              </div>
              {stream.stage && (
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-[var(--foreground)]">阶段</span>
                  <span className="text-[11px] text-[var(--primary)] font-medium">
                    {stream.stage}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tool Calls */}
          {stream.toolCalls.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setToolCallsExpanded(!toolCallsExpanded)}
                className="flex items-center gap-1 w-full"
              >
                <h3 className="text-[12px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                  工具调用 ({stream.toolCalls.length})
                </h3>
                {toolCallsExpanded ? (
                  <ChevronUp className="h-3 w-3 text-[var(--muted-foreground)]" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-[var(--muted-foreground)]" />
                )}
              </button>
              {toolCallsExpanded && (
                <div className="space-y-1.5">
                  {stream.toolCalls.map((tc, idx) => (
                    <div
                      key={idx}
                      className="bg-[var(--background)] rounded-lg p-2.5 flex items-center justify-between"
                    >
                      <span className="text-[12px] text-[var(--foreground)]">
                        {tc.name}
                      </span>
                      {tc.status === 'running' ? (
                        <Loader2 className="h-3.5 w-3.5 text-[var(--primary)] animate-spin" />
                      ) : tc.status === 'completed' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-[var(--destructive)]" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Knowledge Bases */}
          {knowledgeBases.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[12px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                知识库
              </h3>
              <div className="space-y-1.5">
                {knowledgeBases.map((kb) => {
                  const isSelected = selectedKBs.includes(kb.id);
                  return (
                    <button
                      key={kb.id}
                      onClick={() =>
                        setSelectedKBs((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== kb.id)
                            : [...prev, kb.id],
                        )
                      }
                      className={cn(
                        'w-full bg-[var(--background)] rounded-lg p-2.5 flex items-center justify-between transition-colors',
                        isSelected && 'ring-1 ring-[var(--primary)]',
                      )}
                    >
                      <div className="text-left min-w-0 flex-1">
                        <span className="text-[12px] text-[var(--foreground)] block truncate">
                          {kb.name}
                        </span>
                        <span className="text-[10px] text-[var(--muted-foreground)]">
                          {kb.documentCount} 文档 · {kb.blockCount} 块
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] font-medium ml-2 shrink-0',
                          kb.indexStatus === 'ready'
                            ? 'text-[var(--success)]'
                            : 'text-[var(--warning)]',
                        )}
                      >
                        {kb.indexStatus === 'ready' ? '就绪' : kb.indexStatus}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sources — enhanced card */}
          {stream.sources.length > 0 && (
            <SourceCard
              sources={stream.sources.map((s, i) => ({
                index: i + 1,
                title: s.name,
                url: s.url,
                snippet: s.kind,
              }))}
            />
          )}
        </div>
      </div>

      {/* Import Dialog */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold text-[var(--foreground)]">
                导入对话记录
              </h2>
              <button
                onClick={() => {
                  setImportOpen(false);
                  setImportText('');
                  setImportPreview(null);
                  setImportError('');
                }}
                className="p-1 rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                <X className="h-4 w-4 text-[var(--muted-foreground)]" />
              </button>
            </div>

            <p className="text-[13px] text-[var(--muted-foreground)] mb-4">
              从 ChatGPT、Claude 或其他平台导入对话。上传导出文件或直接粘贴文本。
            </p>

            {/* File upload */}
            <div className="mb-4">
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1.5">
                上传文件
              </label>
              <input
                type="file"
                accept=".json,.jsonl,.txt,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                }}
                className="block w-full text-[13px] text-[var(--foreground)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[12px] file:font-medium file:bg-[var(--primary)] file:text-[var(--primary-foreground)] hover:file:opacity-90"
              />
            </div>

            {/* Text paste */}
            <div className="mb-4">
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1.5">
                或粘贴对话文本
              </label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="在此粘贴导出的对话记录..."
                rows={4}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] resize-none"
              />
            </div>

            {/* Preview */}
            {importPreview && (
              <div className="mb-4 p-3 bg-[var(--background)] border border-[var(--border)] rounded-lg">
                <p className="text-[12px] font-medium text-[var(--foreground)] mb-1">
                  预览
                </p>
                {importPreview.conversations?.map((conv, i) => (
                  <div key={i} className="text-[12px] text-[var(--muted-foreground)]">
                    {conv.title} — {conv.messageCount} 条消息 ({conv.format})
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {importError && (
              <div className="mb-4 p-3 bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 rounded-lg">
                <p className="text-[12px] text-[var(--destructive)]">{importError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setImportOpen(false);
                  setImportText('');
                  setImportPreview(null);
                  setImportError('');
                }}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImportText}
                disabled={!importText.trim() || importLoading}
                className={cn(
                  'px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity',
                  (!importText.trim() || importLoading) && 'opacity-50 cursor-not-allowed',
                )}
              >
                {importLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  '导入'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
