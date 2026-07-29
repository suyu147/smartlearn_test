/**
 * Stage 1: Generate scene outlines from user requirements.
 * Also contains outline fallback logic.
 */

import { nanoid } from 'nanoid';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  UserRequirements,
  SceneOutline,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import { buildPrompt, PROMPT_IDS } from './prompts';
import { formatImageDescription, formatImagePlaceholder } from './prompt-formatters';
import { parseJsonResponse } from './json-repair';
import { uniquifyMediaElementIds } from './scene-builder';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  pdfText: string | undefined,
  pdfImages: PdfImage[] | undefined,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    visionEnabled?: boolean;
    imageMapping?: ImageMapping;
    imageGenerationEnabled?: boolean;
    videoGenerationEnabled?: boolean;
    includeInteractive?: boolean;
    researchContext?: string;
    teacherContext?: string;
  },
): Promise<GenerationResult<SceneOutline[]>> {
  // Build available images description for the prompt
  let availableImagesText =
    requirements.language === 'zh-CN' ? '无可用图片' : 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (pdfImages && pdfImages.length > 0) {
    if (options?.visionEnabled && options?.imageMapping) {
      // Vision mode: split into vision images (first N) and text-only (rest)
      const allWithSrc = pdfImages.filter((img) => options.imageMapping![img.id]);
      const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = pdfImages.filter((img) => !options.imageMapping![img.id]);

      const visionDescriptions = visionSlice.map((img) =>
        formatImagePlaceholder(img, requirements.language),
      );
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img, requirements.language),
      );
      availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: options.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      // Text-only mode: full descriptions
      availableImagesText = pdfImages
        .map((img) => formatImageDescription(img, requirements.language))
        .join('\n');
    }
  }

  // Build user profile string for prompt injection
  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';

  // Build media generation policy based on enabled flags
  const imageEnabled = options?.imageGenerationEnabled ?? false;
  const videoEnabled = options?.videoGenerationEnabled ?? false;
  let mediaGenerationPolicy = '';
  if (!imageEnabled && !videoEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any mediaGenerations in the outlines. Both image and video generation are disabled.**';
  } else if (!imageEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any image mediaGenerations (type: "image") in the outlines. Image generation is disabled. Video generation is allowed.**';
  } else if (!videoEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any video mediaGenerations (type: "video") in the outlines. Video generation is disabled. Image generation is allowed.**';
  }

  // Use simplified prompt variables
  const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
    // New simplified variables
    requirement: requirements.requirement,
    language: requirements.language,
    pdfContent: pdfText
      ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS)
      : requirements.language === 'zh-CN'
        ? '无'
        : 'None',
    availableImages: availableImagesText,
    userProfile: userProfileText,
    mediaGenerationPolicy,
    researchContext:
      options?.researchContext || (requirements.language === 'zh-CN' ? '无' : 'None'),
    // Server-side generation populates this via options; client-side populates via formatTeacherPersonaForPrompt
    teacherContext: options?.teacherContext || '',
  });

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  try {
    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 20,
      stageProgress: 50,
      statusMessage: '正在分析需求，生成场景大纲...',
      scenesGenerated: 0,
      totalScenes: 0,
    });

    const response = await aiCall(prompts.system, prompts.user, visionImages);
    const outlines = parseJsonResponse<SceneOutline[]>(response);

    if (!outlines || !Array.isArray(outlines)) {
      return {
        success: false,
        error: 'Failed to parse scene outlines response',
      };
    }
    // Ensure IDs, order, and language
    const enriched = outlines.map((outline, index) => ({
      ...outline,
      id: outline.id || nanoid(),
      order: index + 1,
      language: requirements.language,
    }));

    const withRequiredInteractive = ensureInteractiveOutline(enriched, requirements, options?.includeInteractive !== false);

    // Replace sequential gen_img_N/gen_vid_N with globally unique IDs
    const uniquified = uniquifyMediaElementIds(withRequiredInteractive);

    // Deduplicate outlines with similar keyPoints
    const result = deduplicateOutlines(uniquified);

    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 50,
      stageProgress: 100,
      statusMessage: `已生成 ${result.length} 个场景大纲`,
      scenesGenerated: 0,
      totalScenes: result.length,
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Deduplicate outlines with highly similar keyPoints.
 * If two slide outlines share >60% of their keyPoints text, merge the later one into the earlier one.
 */
function deduplicateOutlines(outlines: SceneOutline[]): SceneOutline[] {
  if (outlines.length <= 1) return outlines;

  const result: SceneOutline[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < outlines.length; i++) {
    if (seen.has(i)) continue;

    const current = outlines[i];
    // Only deduplicate slide-type outlines
    if (current.type !== 'slide') {
      result.push(current);
      continue;
    }

    const currentPoints = new Set(
      (current.keyPoints || []).map((p) => p.toLowerCase().trim()),
    );

    let isDuplicate = false;
    for (let j = 0; j < i; j++) {
      if (seen.has(j)) continue;
      const prev = outlines[j];
      if (prev.type !== 'slide') continue;

      const prevPoints = new Set(
        (prev.keyPoints || []).map((p) => p.toLowerCase().trim()),
      );

      const intersection = [...currentPoints].filter((p) => prevPoints.has(p));
      const overlapRatio =
        currentPoints.size > 0 ? intersection.length / currentPoints.size : 0;

      if (overlapRatio > 0.6) {
        log.warn(
          `Deduplicating outline "${current.title}" (${Math.round(overlapRatio * 100)}% overlap with "${prev.title}")`,
        );
        seen.add(i);
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.push(current);
    }
  }

  // Re-index order
  return result.map((o, i) => ({ ...o, order: i + 1 }));
}

function ensureInteractiveOutline(
  outlines: SceneOutline[],
  requirements: UserRequirements,
  includeInteractive: boolean,
): SceneOutline[] {
  if (!includeInteractive) {
    return outlines;
  }

  const existingInteractiveIndex = outlines.findIndex((outline) => outline.type === 'interactive');
  if (existingInteractiveIndex !== -1) {
    return outlines.map((outline, index) =>
      index === existingInteractiveIndex && !outline.interactiveConfig
        ? { ...outline, interactiveConfig: createDefaultInteractiveConfig(outline) }
        : outline,
    );
  }

  const fallbackSource =
    outlines.find((outline) => outline.keyPoints && outline.keyPoints.length > 0)
    ?? outlines[0];

  if (!fallbackSource) {
    return outlines;
  }

  const injectedOutline: SceneOutline = {
    ...fallbackSource,
    id: nanoid(),
    title: `${fallbackSource.title} - 交互探索`,
    type: 'interactive',
    order: outlines.length + 1,
    description: fallbackSource.description || `通过交互方式理解 ${fallbackSource.title}`,
    keyPoints: fallbackSource.keyPoints?.length
      ? fallbackSource.keyPoints
      : [requirements.requirement],
    interactiveConfig: createDefaultInteractiveConfig(fallbackSource),
  };

  return [...outlines, injectedOutline].map((outline, index) => ({
    ...outline,
    order: index + 1,
  }));
}

function createDefaultInteractiveConfig(outline: SceneOutline) {
  return {
    template: 'simulation',
    subject: outline.title,
    conceptName: outline.title,
    conceptOverview: outline.description || outline.keyPoints?.join('；') || outline.title,
    designIdea: `Create a self-contained interactive lesson for ${outline.title} with at least one manipulable control, one observable output, and concise guidance for experimentation.`,
  };
}

/**
 * Apply type fallbacks for outlines that can't be generated as their declared type.
 * - interactive without interactiveConfig → slide
 * - pbl without pblConfig or languageModel → slide
 * - quiz without quizConfig → add default quizConfig
 */
export function applyOutlineFallbacks(
  outline: SceneOutline,
  hasLanguageModel: boolean,
): SceneOutline {
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig, synthesizing defaults`,
    );
    return {
      ...outline,
      interactiveConfig: createDefaultInteractiveConfig(outline),
    };
  }
  if (outline.type === 'pbl' && (!outline.pblConfig || !hasLanguageModel)) {
    log.warn(
      `PBL outline "${outline.title}" missing pblConfig or languageModel, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  if (outline.type === 'quiz' && !outline.quizConfig) {
    log.warn(
      `Quiz outline "${outline.title}" missing quizConfig, adding defaults`,
    );
    return {
      ...outline,
      quizConfig: {
        questionCount: 3,
        difficulty: 'medium',
        questionTypes: ['single', 'multiple', 'short_answer'],
      },
    };
  }
  return outline;
}
