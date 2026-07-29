'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pause, Play, RotateCcw, ChevronLeft, ChevronRight, Code, Volume2, Volume1, VolumeX, Gauge } from 'lucide-react';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { ScreenElement } from '@/components/slide-renderer/Editor/ScreenElement';
import { QuizRenderer } from '@/components/slide-renderer/Editor/QuizRenderer';
import { computeContentHeight, sortPPTElements } from '@/components/slide-renderer/Editor/ScreenCanvas';
import { SpotlightOverlay } from '@/components/slide-renderer/Editor/SpotlightOverlay';
import { LaserOverlay } from '@/components/slide-renderer/Editor/LaserOverlay';
import type { Action } from '@/lib/types/action';
import type { Scene, CodeButton } from '@/lib/types/stage';
import type { PPTElement, SlideBackground, ConceptHotspot } from '@/lib/types/slides';
import { CLASSROOM_SPEAKERS, getSpeakerById, type ClassroomSpeaker } from '@/lib/generation/speaker-roster';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;

type EngineState = 'idle' | 'playing' | 'paused';

interface Props {
  scenes?: Scene[];
  onHotspotClick?: (hotspot: ConceptHotspot) => void;
  onCodeButtonClick?: (button: CodeButton) => void;
}

interface SpotlightState {
  elementId: string;
  dimness: number;
}

interface LaserState {
  elementId: string;
  color: string;
}

interface ActiveSpeaker {
  speaker: ClassroomSpeaker;
  isSpeaking: boolean;
}

// ── Browser TTS 语音缓存 ────────────────────────────────

let cachedVoices: SpeechSynthesisVoice[] | null = null;

function getBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  if (cachedVoices && cachedVoices.length > 0) return cachedVoices;
  cachedVoices = window.speechSynthesis.getVoices();
  return cachedVoices ?? [];
}

/** 为指定角色选择浏览器 TTS 语音 */
function selectVoiceForSpeaker(speaker: ClassroomSpeaker): SpeechSynthesisVoice | undefined {
  const voices = getBrowserVoices();
  if (voices.length === 0) return undefined;
  // 优先选中文语音
  const zhVoices = voices.filter((v) => v.lang.startsWith('zh'));
  const pool = zhVoices.length > 0 ? zhVoices : voices;
  return pool[speaker.voiceIndex % pool.length];
}

// ── SlidePreview 子组件 ────────────────────────────────

function SlidePreview({
  scene,
  spotlight,
  laser,
  onHotspotClick,
}: {
  scene: Scene;
  spotlight: SpotlightState | null;
  laser: LaserState | null;
  onHotspotClick?: (hotspot: ConceptHotspot) => void;
}) {
  const slideData = scene.type === 'slide'
    ? (scene.content as { type: string; canvas?: import('@/lib/types/slides').Slide }).canvas
    : null;
  const quizData = scene.type === 'quiz'
    ? (scene.content as { type: string; questions?: import('@/lib/types/stage').QuizQuestion[] }).questions ?? []
    : [];
  const interactiveHtml = scene.type === 'interactive'
    ? (scene.content as { type: string; html?: string; url?: string }).html
    : undefined;

  const contentHeight = useMemo(() => {
    if (!slideData?.elements) return CANVAS_HEIGHT;
    return computeContentHeight(slideData.elements);
  }, [slideData]);

  const { backgroundStyle } = useSlideBackgroundStyle(slideData?.background as SlideBackground | undefined);

  if (scene.type === 'quiz') {
    return (
      <div className="rounded-lg border bg-white p-4">
        <QuizRenderer questions={quizData} title={scene.title} />
      </div>
    );
  }

  if (scene.type === 'interactive') {
    return (
      <div className="overflow-hidden rounded-lg border bg-white">
        {interactiveHtml ? (
          <iframe
            srcDoc={interactiveHtml}
            className="h-[560px] w-full border-0"
            sandbox="allow-scripts allow-same-origin"
            title={scene.title}
          />
        ) : (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            暂无交互内容
          </div>
        )}
      </div>
    );
  }

  if (!slideData) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg border bg-white text-sm text-muted-foreground">
        暂无课件内容
      </div>
    );
  }

  const elements = sortPPTElements(slideData.elements ?? []);

  return (
    <div className="overflow-auto rounded-lg border bg-muted/10 p-6">
      <div
        className="mx-auto origin-top shadow-lg"
        style={{
          width: CANVAS_WIDTH,
          minHeight: CANVAS_HEIGHT,
          height: contentHeight,
          ...backgroundStyle,
        }}
      >
        <div className="relative" style={{ width: CANVAS_WIDTH, minHeight: CANVAS_HEIGHT, height: contentHeight }}>
          {elements.map((element: PPTElement) => (
            <ScreenElement key={element.id} element={element} contentHeight={contentHeight} />
          ))}
          {spotlight && <SpotlightOverlay scene={scene} elementId={spotlight.elementId} dimness={spotlight.dimness} />}
          {laser && <LaserOverlay scene={scene} elementId={laser.elementId} color={laser.color} />}
          {/* 概念热区指示器 */}
          {onHotspotClick && elements.map((element: PPTElement) => {
            const hotspots = element.hotspots as ConceptHotspot[] | undefined;
            if (!hotspots?.length) return null;
            return hotspots.map((hs, hsIdx) => (
              <button
                key={`hs-${element.id}-${hsIdx}`}
                className="absolute z-10 flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 shadow-sm hover:bg-blue-200 transition-colors border border-blue-300 cursor-pointer"
                style={{
                  left: element.left + element.width - 4,
                  top: element.top - 8,
                }}
                title={`概念: ${hs.keyword}`}
                onClick={(e) => { e.stopPropagation(); onHotspotClick(hs); }}
              >
                <span className="underline decoration-dotted underline-offset-2">{hs.keyword}</span>
              </button>
            ));
          })}
        </div>
      </div>
    </div>
  );
}

// ── 角色指示器组件 ──────────────────────────────────────

function SpeakerIndicator({ active, allSpeakers }: { active: ActiveSpeaker | null; allSpeakers: ClassroomSpeaker[] }) {
  if (allSpeakers.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1">
      {allSpeakers.map((sp) => {
        const isActive = active?.speaker.id === sp.id;
        return (
          <div
            key={sp.id}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all duration-300 ${
              isActive
                ? 'bg-[var(--speaker-bg,#EFF6FF)] shadow-sm ring-1 ring-[var(--speaker-ring,#93C5FD)]'
                : 'bg-muted/50 opacity-50'
            }`}
            style={{
              '--speaker-bg': `${sp.color}15`,
              '--speaker-ring': `${sp.color}60`,
            } as React.CSSProperties}
          >
            <span className="text-base">{sp.avatar}</span>
            <span
              className={`font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
              style={{ color: isActive ? sp.color : undefined }}
            >
              {sp.name}
            </span>
            {isActive && active?.isSpeaking && (
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ backgroundColor: sp.color }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ backgroundColor: sp.color }}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 字幕条组件 ────────────────────────────────────────

function CaptionBar({ text, speaker }: { text: string; speaker: ClassroomSpeaker | null }) {
  if (!text) return null;

  return (
    <div
      className="rounded-lg border px-4 py-3 transition-all duration-300"
      style={{
        borderColor: speaker ? `${speaker.color}30` : undefined,
        backgroundColor: speaker ? `${speaker.color}08` : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        {speaker && (
          <span className="mt-0.5 text-sm shrink-0">{speaker.avatar}</span>
        )}
        <p className="text-sm leading-relaxed text-foreground/90">
          {text}
        </p>
      </div>
    </div>
  );
}

// ── 主组件 PPTViewer ───────────────────────────────────

export function PPTViewer({ scenes, onHotspotClick, onCodeButtonClick }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [spotlight, setSpotlight] = useState<SpotlightState | null>(null);
  const [laser, setLaser] = useState<LaserState | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker | null>(null);
  const [captionText, setCaptionText] = useState('');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);

  const safeScenes = scenes ?? [];
  const clampedIndex = Math.min(currentIndex, Math.max(safeScenes.length - 1, 0));
  const scene = safeScenes[clampedIndex];

  const actionQueueRef = useRef<Action[]>([]);
  const isPlayingRef = useRef(false);
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playNextActionRef = useRef<() => void>(() => {});

  // 缓存可用角色（从 scene actions 中提取实际使用的角色）
  const sceneSpeakers = useMemo(() => {
    if (!scene?.actions) return CLASSROOM_SPEAKERS.slice(0, 1);
    const ids = new Set<string>();
    for (const a of scene.actions) {
      if (a.type === 'speech' && a.agentId) ids.add(a.agentId);
    }
    if (ids.size === 0) return [CLASSROOM_SPEAKERS[0]]; // 默认只显示老师
    return CLASSROOM_SPEAKERS.filter((s) => ids.has(s.id));
  }, [scene?.actions]);

  // ── 清理计时器和特效 ──

  const clearTimersAndEffects = useCallback(() => {
    if (effectTimerRef.current) {
      clearTimeout(effectTimerRef.current);
      effectTimerRef.current = null;
    }
    if (nextActionTimerRef.current) {
      clearTimeout(nextActionTimerRef.current);
      nextActionTimerRef.current = null;
    }
    setSpotlight(null);
    setLaser(null);
  }, []);

  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, []);

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    actionQueueRef.current = [];
    setEngineState('idle');
    setActiveSpeaker(null);
    setCaptionText('');
    clearTimersAndEffects();
    stopSpeech();
  }, [clearTimersAndEffects, stopSpeech]);

  // ── 浏览器 TTS 播放 ──

  const playSpeechAudio = useCallback((text: string, speaker: ClassroomSpeaker): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        // 不支持 TTS，用估算时间模拟
        const duration = Math.max(text.length * 150, 2000);
        nextActionTimerRef.current = setTimeout(resolve, duration);
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = playbackRate;
      utterance.volume = volume;

      const voice = selectVoiceForSpeaker(speaker);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        setActiveSpeaker({ speaker, isSpeaking: true });
      };
      utterance.onend = () => {
        setActiveSpeaker((prev) => prev ? { ...prev, isSpeaking: false } : null);
        utteranceRef.current = null;
        resolve();
      };
      utterance.onerror = () => {
        utteranceRef.current = null;
        resolve();
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // ── 核心播放引擎 ──

  const playNextAction = useCallback(async () => {
    if (actionQueueRef.current.length === 0 || !isPlayingRef.current) {
      // 队列结束
      if (isPlayingRef.current) {
        // 最后一个动作完成后的延迟清理
        await new Promise<void>((r) => {
          nextActionTimerRef.current = setTimeout(() => {
            clearTimersAndEffects();
            setActiveSpeaker(null);
            setCaptionText('');
            setEngineState('idle');
            isPlayingRef.current = false;
            r();
          }, 1500);
        });
      }
      return;
    }

    const action = actionQueueRef.current.shift()!;
    const normalizedType = action.type;

    // ── Spotlight: fire-and-forget ──
    if (normalizedType === 'spotlight' && action.elementId) {
      setSpotlight({ elementId: action.elementId, dimness: action.dimOpacity ?? 0.5 });
      if (effectTimerRef.current) clearTimeout(effectTimerRef.current);
      effectTimerRef.current = setTimeout(() => setSpotlight(null), 5000);
      // 立即推进下一个动作
      if (isPlayingRef.current) {
        queueMicrotask(() => playNextActionRef.current());
      }
      return;
    }

    // ── Laser: fire-and-forget ──
    if (normalizedType === 'laser' && action.elementId) {
      setLaser({ elementId: action.elementId, color: action.color || '#ff0000' });
      if (effectTimerRef.current) clearTimeout(effectTimerRef.current);
      effectTimerRef.current = setTimeout(() => setLaser(null), 5000);
      // 立即推进下一个动作
      if (isPlayingRef.current) {
        queueMicrotask(() => playNextActionRef.current());
      }
      return;
    }

    // ── Speech: 阻塞直到语音结束 ──
    if (normalizedType === 'speech' && action.text) {
      const speaker = (action.agentId ? getSpeakerById(action.agentId) : null) ?? CLASSROOM_SPEAKERS[0];
      setCaptionText(action.text);
      setActiveSpeaker({ speaker, isSpeaking: true });

      await playSpeechAudio(action.text, speaker);

      // 语音结束后短暂停顿再推进
      if (isPlayingRef.current && actionQueueRef.current.length > 0) {
        await new Promise<void>((r) => {
          nextActionTimerRef.current = setTimeout(r, 600);
        });
        if (isPlayingRef.current) {
          playNextActionRef.current();
        }
      } else if (isPlayingRef.current) {
        // 最后一个 speech，延迟后结束
        await new Promise<void>((r) => {
          nextActionTimerRef.current = setTimeout(() => {
            clearTimersAndEffects();
            setActiveSpeaker(null);
            setCaptionText('');
            setEngineState('idle');
            isPlayingRef.current = false;
            r();
          }, 1500);
        });
      }
      return;
    }

    // ── 其他动作类型：跳过，推进下一个 ──
    if (isPlayingRef.current) {
      queueMicrotask(() => playNextActionRef.current());
    }
  }, [clearTimersAndEffects, playSpeechAudio]);

  useEffect(() => {
    playNextActionRef.current = playNextAction;
  }, [playNextAction]);

  // 场景切换时停止播放
  useEffect(() => {
    stopPlayback();
  }, [clampedIndex, stopPlayback]);

  // 组件卸载时停止播放
  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // 加载浏览器语音列表
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const loadVoices = () => {
      cachedVoices = window.speechSynthesis.getVoices();
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // ── 播放/暂停控制 ──

  const handlePlayPause = useCallback(() => {
    if (!scene?.actions?.length) return;

    if (engineState === 'playing') {
      // 暂停
      isPlayingRef.current = false;
      setEngineState('paused');
      stopSpeech();
      if (nextActionTimerRef.current) {
        clearTimeout(nextActionTimerRef.current);
        nextActionTimerRef.current = null;
      }
      setActiveSpeaker((prev) => prev ? { ...prev, isSpeaking: false } : null);
      return;
    }

    // 开始/恢复
    if (engineState === 'idle') {
      actionQueueRef.current = [...scene.actions];
      clearTimersAndEffects();
      setCaptionText('');
    }

    isPlayingRef.current = true;
    setEngineState('playing');
    playNextAction();
  }, [clearTimersAndEffects, engineState, playNextAction, scene, stopSpeech]);

  // 有 speech 或 spotlight/laser 动作时才可播放
  const canPlay = !!scene?.actions?.some(
    (a) => a.type === 'speech' || a.type === 'spotlight' || a.type === 'laser',
  );

  const hasSpeech = !!scene?.actions?.some((a) => a.type === 'speech');

  if (safeScenes.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border">
        <p className="text-muted-foreground">课件内容加载中...</p>
      </div>
    );
  }

  const volumeIcon = useMemo(() => {
    if (volume === 0) return <VolumeX className="h-4 w-4" />;
    if (volume < 0.5) return <Volume1 className="h-4 w-4" />;
    return <Volume2 className="h-4 w-4" />;
  }, [volume]);

  return (
    <div className="space-y-3">
      {/* 标题和场景计数 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-medium">{scene?.title}</h3>
          <span className="text-sm text-muted-foreground">
            场景 {clampedIndex + 1} / {safeScenes.length}
          </span>
        </div>
      </div>

      {/* 角色指示器 */}
      {hasSpeech && (
        <SpeakerIndicator
          active={activeSpeaker}
          allSpeakers={sceneSpeakers}
        />
      )}

      {/* 幻灯片预览 + 中央播放按钮 */}
      <div className="relative">
        {scene ? <SlidePreview scene={scene} spotlight={spotlight} laser={laser} onHotspotClick={onHotspotClick} /> : null}
        {engineState === 'idle' && canPlay && (
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-xl shadow-violet-500/30 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
            aria-label="播放讲解"
          >
            <Play className="h-7 w-7 fill-white" />
          </button>
        )}
      </div>

      {/* 字幕条 */}
      {captionText && (
        <CaptionBar
          text={captionText}
          speaker={activeSpeaker?.speaker ?? null}
        />
      )}

      {/* 语音播放提示（空闲时且有 speech） */}
      {engineState === 'idle' && hasSpeech && !captionText && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Volume2 className="h-3.5 w-3.5" />
          <span>点击中央播放按钮或下方控制栏开始语音讲解</span>
        </div>
      )}

      {/* 底部控制栏 */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
            disabled={clampedIndex === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="上一页"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handlePlayPause}
            disabled={!canPlay}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={engineState === 'playing' ? '暂停' : '播放'}
          >
            {engineState === 'playing' ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <button
            onClick={() => setCurrentIndex((i) => Math.min(i + 1, safeScenes.length - 1))}
            disabled={clampedIndex >= safeScenes.length - 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="下一页"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={stopPlayback}
            disabled={engineState === 'idle'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="重置"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* 倍速 */}
          <div className="flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            <select
              value={playbackRate}
              onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
              className="h-7 rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 text-[11px] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <option key={r} value={r}>{r}x</option>
              ))}
            </select>
          </div>
          {/* 音量 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setVolume((v) => (v === 0 ? 1 : 0))}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label={volume === 0 ? '取消静音' : '静音'}
            >
              {volumeIcon}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-[var(--muted)] accent-[var(--primary)]"
            />
          </div>
        </div>
      </div>

      {/* 代码运行按钮（仅 slide 类型场景） */}
      {scene?.type === 'slide' && (() => {
        const codeButtons = (scene.content as { codeButtons?: CodeButton[] }).codeButtons;
        if (!codeButtons?.length || !onCodeButtonClick) return null;
        return (
          <div className="flex flex-wrap gap-2">
            {codeButtons.map((btn) => (
              <Button
                key={btn.id}
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onCodeButtonClick(btn)}
              >
                <Code className="h-3.5 w-3.5" />
                {btn.label}
              </Button>
            ))}
          </div>
        );
      })()}

      {/* 场景页码指示器 */}
      <div className="flex justify-center gap-2">
        {safeScenes.map((_, index) => (
          <button
            key={index}
            className={`h-2 rounded-full transition-all ${
              index === clampedIndex ? 'w-4 bg-primary' : 'w-2 bg-muted-foreground/30'
            }`}
            onClick={() => setCurrentIndex(index)}
            aria-label={`跳转到场景 ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
