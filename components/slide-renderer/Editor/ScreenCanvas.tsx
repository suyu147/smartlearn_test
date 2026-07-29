'use client';

import { useMemo } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import { useStageStore } from '@/lib/store/stage';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { SpotlightOverlay } from '@/components/slide-renderer/Editor/SpotlightOverlay';
import { LaserOverlay } from '@/components/slide-renderer/Editor/LaserOverlay';
import { ScreenElement } from '@/components/slide-renderer/Editor/ScreenElement';
import { QuizRenderer } from '@/components/slide-renderer/Editor/QuizRenderer';
import type { PPTElement, SlideBackground } from '@/lib/types/slides';
import type { QuizQuestion } from '@/lib/types/stage';

const _CANVAS_W = 1000;
const CANVAS_H = 562.5;

export function sortPPTElements(elements: PPTElement[]): PPTElement[] {
  return [...elements].sort((left, right) => {
    const leftOrder = typeof (left as { order?: unknown }).order === 'number'
      ? ((left as { order?: number }).order ?? 0)
      : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof (right as { order?: unknown }).order === 'number'
      ? ((right as { order?: number }).order ?? 0)
      : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

export function computeContentHeight(elements: PPTElement[]): number {
  if (!elements || elements.length === 0) return CANVAS_H;
  let maxBottom = CANVAS_H;
  for (const el of elements) {
    const bottom = (el.top ?? 0) + (el.height ?? 0);
    if (bottom > maxBottom) maxBottom = bottom;
  }
  return maxBottom + 20;
}

export function ScreenCanvas() {
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const scenes = useStageStore((s) => s.scenes);
  const spotlightEffect = useCanvasStore((s) => s.spotlightEffect);
  const laserElementId = useCanvasStore((s) => s.laserElementId);

  const currentScene = useMemo(() => {
    if (!currentSceneId) return scenes[0] || null;
    return scenes.find((s) => s.id === currentSceneId) || null;
  }, [currentSceneId, scenes]);

  const slideData = useMemo(() => {
    if (!currentScene || currentScene.type !== 'slide') return null;
    const content = currentScene.content as { type: string; canvas?: import('@/lib/types/slides').Slide };
    return content?.canvas || null;
  }, [currentScene]);

  const quizData = useMemo(() => {
    if (!currentScene || currentScene.type !== 'quiz') return null;
    const content = currentScene.content as { type: string; questions?: QuizQuestion[] };
    return content?.questions || null;
  }, [currentScene]);

  const interactiveHtml = useMemo(() => {
    if (!currentScene || currentScene.type !== 'interactive') return null;
    const content = currentScene.content as { type: string; html?: string };
    return content?.html || null;
  }, [currentScene]);

  const contentHeight = useMemo(() => {
    if (!slideData?.elements) return CANVAS_H;
    return computeContentHeight(slideData.elements);
  }, [slideData]);

  const { backgroundStyle } = useSlideBackgroundStyle(slideData?.background as SlideBackground | undefined);

  if (!currentScene) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <p className="text-gray-400">暂无内容</p>
      </div>
    );
  }

  if (currentScene.type === 'quiz') {
    return <QuizRenderer questions={quizData || []} title={currentScene.title} />;
  }

  if (currentScene.type === 'slide') {
    const elements = sortPPTElements(slideData?.elements || []);

    if (!slideData) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-white">
          <p className="text-gray-400">暂无内容</p>
        </div>
      );
    }

    return (
      <div
        className="relative w-full"
        style={{
          ...backgroundStyle,
          minHeight: CANVAS_H,
          height: contentHeight,
        }}
      >
        {elements.map((element: PPTElement) => (
          <ScreenElement key={element.id} element={element} contentHeight={contentHeight} />
        ))}

        {spotlightEffect && <SpotlightOverlay elementId={spotlightEffect.elementId} />}
        {laserElementId && <LaserOverlay elementId={laserElementId} />}
      </div>
    );
  }

  if (currentScene.type === 'interactive') {
    return (
      <div className="w-full h-full bg-white">
        {interactiveHtml ? (
          <iframe
            srcDoc={interactiveHtml}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            title="Interactive Content"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-gray-400">交互式内容</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-white">
      <p className="text-gray-400">暂不支持的场景类型: {currentScene.type}</p>
    </div>
  );
}
