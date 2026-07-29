'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar';
import { ScreenCanvas, computeContentHeight } from '@/components/slide-renderer/Editor/ScreenCanvas';
import { cn } from '@/lib/utils';
import type { Scene } from '@/lib/types/stage';

const CANVAS_W = 1000;
const CANVAS_H = 562.5;

interface CanvasAreaProps {
  currentScene: Scene | null;
  currentSceneIndex: number;
  scenesCount: number;
  mode: string;
  engineState: string;
  whiteboardOpen: boolean;
  sidebarCollapsed: boolean;
  chatCollapsed: boolean;
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  onPrevSlide: () => void;
  onNextSlide: () => void;
  onPlayPause: () => void;
  onWhiteboardClose: () => void;
  isPresenting: boolean;
  onTogglePresentation: () => void;
  showStopDiscussion: boolean;
  onStopDiscussion: () => void;
}

export function CanvasArea({
  currentScene,
  currentSceneIndex,
  scenesCount,
  mode: _mode,
  engineState,
  whiteboardOpen,
  sidebarCollapsed,
  chatCollapsed,
  onToggleSidebar,
  onToggleChat,
  onPrevSlide,
  onNextSlide,
  onPlayPause,
  onWhiteboardClose,
  isPresenting,
  onTogglePresentation,
  showStopDiscussion,
  onStopDiscussion,
}: CanvasAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasScale = useCanvasStore((s) => s.canvasScale);
  const setCanvasScale = useCanvasStore((s) => s.setCanvasScale);

  const _hasSlideContent = useMemo(() => {
    if (!currentScene) return false;
    if (currentScene.type === 'slide' && currentScene.content?.type === 'slide') {
      const content = currentScene.content as { canvas?: import('@/lib/types/slides').Slide };
      return !!content?.canvas;
    }
    return false;
  }, [currentScene]);

  const hasAnyContent = useMemo(() => {
    return currentScene !== null;
  }, [currentScene]);

  const contentHeight = useMemo(() => {
    if (!currentScene || currentScene.type !== 'slide') return CANVAS_H;
    const content = currentScene.content as { canvas?: import('@/lib/types/slides').Slide };
    const elements = content?.canvas?.elements;
    if (!elements) return CANVAS_H;
    return computeContentHeight(elements);
  }, [currentScene]);

  const needsScroll = contentHeight > CANVAS_H;

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const containerWidth = container.clientWidth - 40;
      const containerHeight = container.clientHeight - 40;

      let scale: number;
      if (needsScroll) {
        scale = containerWidth / CANVAS_W;
      } else {
        const slideRatio = CANVAS_W / CANVAS_H;
        const containerRatio = containerWidth / containerHeight;
        if (containerRatio > slideRatio) {
          scale = containerHeight / CANVAS_H;
        } else {
          scale = containerWidth / CANVAS_W;
        }
      }

      setCanvasScale(scale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [setCanvasScale, needsScroll]);

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        className={cn(
          'flex-1 bg-gray-100 dark:bg-gray-800',
          needsScroll
            ? 'overflow-y-auto overflow-x-hidden ppt-scroll-container flex justify-center pt-5 pb-5'
            : 'overflow-hidden flex items-center justify-center',
        )}
      >
        {hasAnyContent ? (
          <SceneProvider>
            <div
              className="relative bg-white shadow-2xl"
              style={
                needsScroll
                  ? {
                      width: CANVAS_W * canvasScale,
                      height: contentHeight * canvasScale,
                      overflow: 'hidden',
                    }
                  : {
                      width: CANVAS_W,
                      height: CANVAS_H,
                      transform: `scale(${canvasScale})`,
                      transformOrigin: 'center center',
                    }
              }
            >
              {needsScroll && (
                <div
                  style={{
                    width: CANVAS_W,
                    height: contentHeight,
                    transform: `scale(${canvasScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <ScreenCanvas />
                </div>
              )}
              {!needsScroll && <ScreenCanvas />}
            </div>
          </SceneProvider>
        ) : (
          <div className="text-gray-400 dark:text-gray-500 text-center">
            <p className="text-lg">暂无幻灯片内容</p>
            <p className="text-sm mt-1">请先生成课件</p>
          </div>
        )}
      </div>

      <CanvasToolbar
        currentSceneIndex={currentSceneIndex}
        scenesCount={scenesCount}
        engineState={engineState}
        onPrevSlide={onPrevSlide}
        onNextSlide={onNextSlide}
        onPlayPause={onPlayPause}
        onWhiteboardClose={onWhiteboardClose}
        isPresenting={isPresenting}
        onTogglePresentation={onTogglePresentation}
        whiteboardOpen={whiteboardOpen}
        sidebarCollapsed={sidebarCollapsed}
        chatCollapsed={chatCollapsed}
        onToggleSidebar={onToggleSidebar}
        onToggleChat={onToggleChat}
        showStopDiscussion={showStopDiscussion}
        onStopDiscussion={onStopDiscussion}
      />
    </div>
  );
}
