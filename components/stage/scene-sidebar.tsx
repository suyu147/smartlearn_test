'use client';

import { cn } from '@/lib/utils';
import { BookOpen, PieChart, MousePointer2, Cpu } from 'lucide-react';
import type { Scene } from '@/lib/types/stage';

interface SceneSidebarProps {
  scenes: Scene[];
  currentSceneId: string | null;
  onSelectScene: (id: string) => void;
}

const sceneTypeIcons: Record<string, typeof BookOpen> = {
  slide: BookOpen,
  quiz: PieChart,
  interactive: MousePointer2,
  pbl: Cpu,
};

export function SceneSidebar({ scenes, currentSceneId, onSelectScene }: SceneSidebarProps) {
  return (
    <div className="w-52 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-gray-100 dark:border-gray-800 flex flex-col shrink-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {scenes.map((scene, index) => {
          const isActive = currentSceneId === scene.id;
          const Icon = sceneTypeIcons[scene.type] || BookOpen;

          return (
            <div
              key={scene.id}
              onClick={() => onSelectScene(scene.id)}
              className={cn(
                'group relative rounded-lg transition-all duration-200 cursor-pointer flex flex-col gap-1 p-1.5',
                isActive
                  ? 'bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-200 dark:ring-purple-700'
                  : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/50',
              )}
            >
              <div className="flex items-center gap-2 px-1.5">
                <span
                  className={cn(
                    'text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                    isActive
                      ? 'bg-purple-600 dark:bg-purple-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500',
                  )}
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    'text-xs font-bold truncate',
                    isActive
                      ? 'text-purple-700 dark:text-purple-300'
                      : 'text-gray-600 dark:text-gray-300',
                  )}
                >
                  {scene.title}
                </span>
              </div>

              <div className="relative aspect-video w-full rounded overflow-hidden bg-gray-100 dark:bg-gray-800 ring-1 ring-black/5 dark:ring-white/5">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-gray-300 dark:text-gray-500" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
