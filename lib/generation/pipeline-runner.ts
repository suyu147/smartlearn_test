import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type { AICallFn, GenerationCallbacks, GenerationResult } from './pipeline-types';
import { buildSceneFromOutline } from './scene-builder';
import { createLogger } from '@/lib/logger';
const log = createLogger('PipelineRunner');

export interface GenerationSession {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;
}

export function createGenerationSession(): GenerationSession {
  return {
    id: `session_${Date.now()}`,
    status: 'idle',
    progress: 0,
  };
}

export async function runGenerationPipeline(
  outlines: SceneOutline[],
  aiCall: AICallFn,
  stageId: string,
  callbacks?: GenerationCallbacks,
  options?: {
    assignedImages?: import('@/lib/types/generation').PdfImage[];
    imageMapping?: import('@/lib/types/generation').ImageMapping;
    visionEnabled?: boolean;
    agents?: import('./pipeline-types').AgentInfo[];
    userProfile?: string;
  },
): Promise<GenerationResult<Scene[]>> {
  const totalScenes = outlines.length;
  let completedCount = 0;
  const _scenes: Scene[] = [];

  callbacks?.onProgress?.({
    currentStage: 3,
    overallProgress: 50,
    stageProgress: 0,
    statusMessage: `正在并行生成 ${totalScenes} 个场景...`,
    scenesGenerated: 0,
    totalScenes,
  });

  const results = await Promise.all(
    outlines.map(async (outline, _index) => {
      try {
        const scene = await buildSceneFromOutline(
          outline,
          aiCall,
          stageId,
          options?.assignedImages,
          options?.imageMapping,
          undefined,
          options?.visionEnabled,
          undefined,
          options?.agents,
          undefined,
          options?.userProfile,
        );

        completedCount++;
        callbacks?.onProgress?.({
          currentStage: 3,
          overallProgress: 50 + Math.floor((completedCount / totalScenes) * 50),
          stageProgress: Math.floor((completedCount / totalScenes) * 100),
          statusMessage: `已完成 ${completedCount}/${totalScenes} 个场景`,
          scenesGenerated: completedCount,
          totalScenes,
        });

        if (!scene) {
          log.error(`Failed to build scene for: ${outline.title}`);
          return null;
        }

        return scene;
      } catch (error) {
        completedCount++;
        log.error(`Error generating scene ${outline.title}:`, error);
        callbacks?.onError?.(`Failed to generate scene ${outline.title}: ${error}`);
        return null;
      }
    }),
  );

  const successfulScenes = results
    .filter((r): r is Scene => r !== null)
    .sort((a, b) => a.order - b.order);

  if (successfulScenes.length === 0) {
    return { success: false, error: 'All scenes failed to generate' };
  }

  return { success: true, data: successfulScenes };
}
