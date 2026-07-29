'use client';

import { createContext, useContext, useMemo } from 'react';
import type { Scene, SceneContent } from '@/lib/types/stage';
import { useStageStore } from '@/lib/store/stage';

interface SceneContextValue {
  sceneId: string | null;
  scene: Scene | null;
}

const SceneContext = createContext<SceneContextValue>({ sceneId: null, scene: null });

export function SceneProvider({ children }: { children: React.ReactNode }) {
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const scenes = useStageStore((s) => s.scenes);

  const scene = useMemo(() => {
    if (!currentSceneId) return null;
    return scenes.find((s) => s.id === currentSceneId) || null;
  }, [currentSceneId, scenes]);

  return (
    <SceneContext.Provider value={{ sceneId: currentSceneId, scene }}>
      {children}
    </SceneContext.Provider>
  );
}

export function useSceneSelector<TContent extends SceneContent, TResult>(
  selector: (content: TContent) => TResult,
): TResult {
  const { scene } = useContext(SceneContext);
  return useMemo(() => {
    if (!scene) return undefined as unknown as TResult;
    return selector(scene.content as TContent);
  }, [scene, selector]);
}

export function useSceneContext() {
  return useContext(SceneContext);
}
