'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useStageStore } from '@/lib/store/stage';
import { useCanvasStore } from '@/lib/store/canvas';
import { ActionEngine } from '@/lib/action/engine';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { SceneSidebar } from '@/components/stage/scene-sidebar';
import type { Scene, StageMode } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';


type EngineState = 'idle' | 'playing' | 'paused';

interface StageComponentProps {
  initialScenes?: Scene[];
  mode?: StageMode;
}

export function StageComponent({ initialScenes, mode = 'playback' }: StageComponentProps) {
  const {
    stage: _stage,
    scenes,
    currentSceneId,
    setStage,
    setScenes,
    addScene: _addScene,
    setCurrentSceneId,
  } = useStageStore();

  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [isPresenting, setIsPresenting] = useState(false);
  const [showStopDiscussion, setShowStopDiscussion] = useState(false);

  const actionEngineRef = useRef<ActionEngine | null>(null);
  const actionQueueRef = useRef<Action[]>([]);
  const isPlayingRef = useRef(false);
  const playNextActionRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (initialScenes && initialScenes.length > 0) {
      const stageId = `stage_${Date.now()}`;
      setStage({
        id: stageId,
        title: '动态课件',
        mode,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setScenes(initialScenes);
    }
  }, [initialScenes, mode, setStage, setScenes]);

  const currentScene = useMemo(() => {
    if (!currentSceneId) return scenes[0] || null;
    return scenes.find((s) => s.id === currentSceneId) || null;
  }, [scenes, currentSceneId]);

  const currentSceneIndex = useMemo(() => {
    if (!currentScene) return 0;
    return scenes.findIndex((s) => s.id === currentScene.id);
  }, [scenes, currentScene]);

  const playNextAction = useCallback(async () => {
    if (actionQueueRef.current.length === 0 || !isPlayingRef.current) {
      setEngineState('idle');
      isPlayingRef.current = false;
      return;
    }

    const action = actionQueueRef.current.shift()!;
    const engine = actionEngineRef.current;
    if (!engine) return;

    try {
      await engine.execute(action);
    } catch {
      // Continue even if action fails
    }

    if (actionQueueRef.current.length > 0 && isPlayingRef.current) {
      const delay = action.type === 'speech' ? 500 : 300;
      setTimeout(() => playNextActionRef.current(), delay);
    } else {
      setEngineState('idle');
      isPlayingRef.current = false;
    }
  }, []);

  useEffect(() => {
    playNextActionRef.current = playNextAction;
  }, [playNextAction]);

  const handlePlayPause = useCallback(() => {
    if (engineState === 'playing') {
      isPlayingRef.current = false;
      setEngineState('paused');
      return;
    }

    const scene = currentScene;
    if (!scene?.actions || scene.actions.length === 0) return;

    if (engineState === 'idle') {
      actionQueueRef.current = [...scene.actions];
    }

    isPlayingRef.current = true;
    setEngineState('playing');
    playNextAction();
  }, [engineState, currentScene, playNextAction]);

  const handlePrevSlide = useCallback(() => {
    const idx = currentSceneIndex;
    if (idx > 0) {
      setCurrentSceneId(scenes[idx - 1].id);
      isPlayingRef.current = false;
      setEngineState('idle');
      actionQueueRef.current = [];
      useCanvasStore.getState().clearAllEffects();
    }
  }, [currentSceneIndex, scenes, setCurrentSceneId]);

  const handleNextSlide = useCallback(() => {
    const idx = currentSceneIndex;
    if (idx < scenes.length - 1) {
      setCurrentSceneId(scenes[idx + 1].id);
      isPlayingRef.current = false;
      setEngineState('idle');
      actionQueueRef.current = [];
      useCanvasStore.getState().clearAllEffects();
    }
  }, [currentSceneIndex, scenes, setCurrentSceneId]);

  const handleWhiteboardClose = useCallback(() => {
    setWhiteboardOpen((prev) => !prev);
  }, []);

  const handleTogglePresentation = useCallback(() => {
    if (!isPresenting) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsPresenting((prev) => !prev);
  }, [isPresenting]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrevSlide();
      if (e.key === 'ArrowRight') handleNextSlide();
      if (e.key === ' ') {
        e.preventDefault();
        handlePlayPause();
      }
      if (e.key === 'Escape' && isPresenting) {
        document.exitFullscreen?.();
        setIsPresenting(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevSlide, handleNextSlide, handlePlayPause, isPresenting]);

  return (
    <div className="flex h-full w-full bg-white dark:bg-gray-900 rounded-lg overflow-hidden">
      {!sidebarCollapsed && scenes.length > 1 && (
        <SceneSidebar
          scenes={scenes}
          currentSceneId={currentScene?.id || null}
          onSelectScene={(id: string) => {
            setCurrentSceneId(id);
            isPlayingRef.current = false;
            setEngineState('idle');
            actionQueueRef.current = [];
            useCanvasStore.getState().clearAllEffects();
          }}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <CanvasArea
          currentScene={currentScene}
          currentSceneIndex={currentSceneIndex}
          scenesCount={scenes.length}
          mode={mode}
          engineState={engineState}
          whiteboardOpen={whiteboardOpen}
          sidebarCollapsed={sidebarCollapsed}
          chatCollapsed={chatCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((p) => !p)}
          onToggleChat={() => setChatCollapsed((p) => !p)}
          onPrevSlide={handlePrevSlide}
          onNextSlide={handleNextSlide}
          onPlayPause={handlePlayPause}
          onWhiteboardClose={handleWhiteboardClose}
          isPresenting={isPresenting}
          onTogglePresentation={handleTogglePresentation}
          showStopDiscussion={showStopDiscussion}
          onStopDiscussion={() => {
            setShowStopDiscussion(false);
            isPlayingRef.current = false;
            setEngineState('idle');
          }}
        />
      </div>
    </div>
  );
}
