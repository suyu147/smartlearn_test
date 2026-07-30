'use client';

import { useCallback, useRef, useState } from 'react';
import { X, Maximize2, Minimize2, Volume2, VolumeX, Loader2, AlertCircle } from 'lucide-react';
import { useDigitalHumanStore } from '@/lib/store/digital-human-store';
import type { DigitalHumanPosition } from '@/lib/digital-human/types';

interface Props {
  /** 是否静音 */
  muted?: boolean;
  /** 自定义位置覆盖 */
  position?: DigitalHumanPosition;
  /** 自定义缩放覆盖 */
  scale?: number;
}

const POSITION_STYLES: Record<DigitalHumanPosition, string> = {
  overlay: 'absolute bottom-0 right-0 z-20',
  sidebar: 'relative w-full',
  pip: 'absolute bottom-4 right-4 z-20',
};

const SIZE_STYLES: Record<DigitalHumanPosition, { width: string; height: string }> = {
  overlay: { width: '240px', height: '320px' },
  sidebar: { width: '100%', height: 'auto' },
  pip: { width: '180px', height: '240px' },
};

export function DigitalHumanPlayer({
  muted = false,
  position: positionProp,
  scale: scaleProp,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);

  const enabled = useDigitalHumanStore((s) => s.enabled);
  const position = positionProp ?? useDigitalHumanStore((s) => s.position);
  const scale = scaleProp ?? useDigitalHumanStore((s) => s.scale);
  const isGenerating = useDigitalHumanStore((s) => s.isGenerating);
  const taskStatus = useDigitalHumanStore((s) => s.taskStatus);
  const videoUrl = useDigitalHumanStore((s) => s.videoUrl);
  const lastError = useDigitalHumanStore((s) => s.lastError);
  const generatedText = useDigitalHumanStore((s) => s.generatedText);
  const setIsVideoPlaying = useDigitalHumanStore((s) => s.setIsVideoPlaying);
  const stopPolling = useDigitalHumanStore((s) => s.stopPolling);
  const clearAll = useDigitalHumanStore((s) => s.clearAll);

  const handlePlay = useCallback(() => {
    setIsVideoPlaying(true);
  }, [setIsVideoPlaying]);

  const handlePause = useCallback(() => {
    setIsVideoPlaying(false);
  }, [setIsVideoPlaying]);

  const handleDismiss = useCallback(() => {
    stopPolling();
    clearAll();
  }, [stopPolling, clearAll]);

  // 不显示的条件
  if (!enabled) return null;
  // 没有正在生成且没有视频可播放时不显示
  if (!isGenerating && taskStatus !== 'completed' && !lastError) return null;

  const effectivePosition = position;
  const effectiveSize = isExpanded
    ? { width: '360px', height: '480px' }
    : SIZE_STYLES[effectivePosition];
  const effectiveScale = isExpanded ? 1 : scale;

  return (
    <div
      className={`${POSITION_STYLES[effectivePosition]} transition-all duration-300`}
      style={{
        ...effectiveSize,
        transform: effectiveScale !== 1 ? `scale(${effectiveScale})` : undefined,
        transformOrigin: 'bottom right',
      }}
    >
      {/* 生成中状态 */}
      {isGenerating && (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg">
          <div className="flex flex-col items-center gap-3 p-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            <div className="text-center">
              <p className="text-sm font-medium text-blue-700">
                {taskStatus === 'generating' ? '正在创建视频...' : '视频生成中...'}
              </p>
              <p className="mt-1 text-[10px] text-blue-500">通常需要 1-3 分钟</p>
            </div>
          </div>
        </div>
      )}

      {/* 已完成：MP4 视频播放器 */}
      {taskStatus === 'completed' && videoUrl && (
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black shadow-lg">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            src={videoUrl}
            controls
            playsInline
            muted={isMuted}
            onPlay={handlePlay}
            onPause={handlePause}
          />

          {/* 控制栏 */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 transition-opacity hover:opacity-100">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="rounded-full p-1 text-white/80 hover:text-white"
              aria-label={isMuted ? '取消静音' : '静音'}
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="rounded-full p-1 text-white/80 hover:text-white"
              aria-label={isExpanded ? '缩小' : '放大'}
            >
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* 生成完成但无视频URL */}
      {taskStatus === 'completed' && !videoUrl && (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-lg">
          <div className="flex flex-col items-center gap-2 p-4">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <p className="text-center text-xs text-amber-700">视频生成完成，但未获取到视频地址</p>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {lastError && (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-pink-50 shadow-lg">
          <div className="flex flex-col items-center gap-2 p-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-center text-xs text-red-700">{lastError}</p>
            <button
              onClick={handleDismiss}
              className="mt-1 text-[10px] text-red-500 underline hover:text-red-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 播报文案（可展开查看） */}
      {generatedText && isExpanded && (
        <div className="absolute bottom-full mb-2 left-0 right-0 max-h-32 overflow-y-auto rounded-lg bg-white/95 p-2 text-[10px] text-gray-700 shadow-md">
          <p className="font-medium text-gray-900 mb-1">AI 扩写文案:</p>
          <p>{generatedText}</p>
        </div>
      )}
    </div>
  );
}
