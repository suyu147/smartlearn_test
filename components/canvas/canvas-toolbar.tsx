'use client';

import { Button } from '@/components/ui/button';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  StopCircle,
} from 'lucide-react';

interface CanvasToolbarProps {
  currentSceneIndex: number;
  scenesCount: number;
  engineState: string;
  onPrevSlide: () => void;
  onNextSlide: () => void;
  onPlayPause: () => void;
  onWhiteboardClose: () => void;
  isPresenting: boolean;
  onTogglePresentation: () => void;
  whiteboardOpen: boolean;
  sidebarCollapsed: boolean;
  chatCollapsed: boolean;
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  showStopDiscussion: boolean;
  onStopDiscussion: () => void;
}

export function CanvasToolbar({
  currentSceneIndex,
  scenesCount,
  engineState,
  onPrevSlide,
  onNextSlide,
  onPlayPause,
  onWhiteboardClose,
  isPresenting,
  onTogglePresentation,
  whiteboardOpen,
  sidebarCollapsed,
  chatCollapsed: _chatCollapsed,
  onToggleSidebar,
  onToggleChat,
  showStopDiscussion,
  onStopDiscussion,
}: CanvasToolbarProps) {
  return (
    <div className="h-12 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between px-3">
      {/* Left section */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} title="侧边栏">
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onToggleChat} title="讨论">
          <MessageSquare className="h-4 w-4" />
        </Button>
      </div>

      {/* Center section - playback controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevSlide}
          disabled={currentSceneIndex <= 0}
          title="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[60px] text-center">
          {currentSceneIndex + 1} / {scenesCount}
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={onNextSlide}
          disabled={currentSceneIndex >= scenesCount - 1}
          title="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-1" />

        <Button
          variant={engineState === 'playing' ? 'default' : 'ghost'}
          size="icon"
          onClick={onPlayPause}
          title={engineState === 'playing' ? '暂停' : '播放'}
          className={engineState === 'playing' ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
        >
          {engineState === 'playing' ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        {showStopDiscussion && (
          <Button variant="ghost" size="icon" onClick={onStopDiscussion} title="停止讨论">
            <StopCircle className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <Button
          variant={whiteboardOpen ? 'default' : 'ghost'}
          size="icon"
          onClick={onWhiteboardClose}
          title="白板"
        >
          <PenLine className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onTogglePresentation} title="全屏">
          {isPresenting ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
