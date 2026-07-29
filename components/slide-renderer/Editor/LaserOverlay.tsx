'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useCanvasStore } from '@/lib/store/canvas';
import { useStageStore } from '@/lib/store/stage';
import { useMemo } from 'react';
import type { Scene } from '@/lib/types/stage';
import type { PPTElement } from '@/lib/types/slides';

interface LaserOverlayProps {
  elementId?: string;
  scene?: Scene | null;
  color?: string;
}

function resolveElementCenter(scene: Scene | null | undefined, elementId: string | undefined) {
  if (!scene || scene.type !== 'slide' || !elementId) return null;

  const content = scene.content as { type: string; canvas?: import('@/lib/types/slides').Slide };
  const slide = content?.canvas;
  if (!slide) return null;

  const element = slide.elements.find((el: PPTElement) => el.id === elementId);
  if (!element) return null;

  return {
    x: element.left + element.width / 2,
    y: element.top + element.height / 2,
  };
}

export function LaserOverlay({ elementId, scene, color }: LaserOverlayProps) {
  const scenes = useStageStore((s) => s.scenes);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const laserElementId = useCanvasStore((s) => s.laserElementId);
  const laserOptions = useCanvasStore((s) => s.laserOptions);

  const activeScene = scene ?? (currentSceneId ? scenes.find((s) => s.id === currentSceneId) ?? null : null);
  const activeElementId = elementId ?? laserElementId ?? undefined;
  const activeColor = color ?? laserOptions?.color ?? '#ff0000';

  const elementCenter = useMemo(
    () => resolveElementCenter(activeScene, activeElementId),
    [activeScene, activeElementId],
  );

  if (!elementCenter) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="absolute pointer-events-none"
        style={{
          left: elementCenter.x,
          top: elementCenter.y,
          zIndex: 60,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <motion.div
          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="h-4 w-4 rounded-full"
          style={{
            backgroundColor: activeColor,
            boxShadow: `0 0 12px ${activeColor}, 0 0 24px ${activeColor}40`,
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
}
