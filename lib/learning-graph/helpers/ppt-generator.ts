import { resolveImageGenApiKey, resolveImageGenProvider } from '@/lib/server/provider-config';
import { resolveModel } from '@/lib/server/resolve-model';
import { streamLLM } from '@/lib/ai/llm';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { buildSceneFromOutline } from '@/lib/generation/scene-builder';
import { batchGenerateImages } from '@/lib/generation/image-generator';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { assignSpeakersToScenesAsync } from '@/lib/generation/speaker-postprocessor';
import type { Scene, CodeButton } from '@/lib/types/stage';
import type { ProviderId } from '@/lib/types/provider';
import type { ConceptHotspot } from '@/lib/types/slides';
import type { ImageMapping, UserRequirements } from '@/lib/types/generation';

function createAICallFn(providerId?: string, modelId?: string, apiKey?: string, baseUrl?: string) {
  return async (systemPrompt: string, userPrompt: string) => {
    const { model } = resolveModel({ providerId: providerId as ProviderId | undefined, modelId, apiKey, baseUrl });
    const result = await streamLLM({ model, system: systemPrompt, prompt: userPrompt, maxOutputTokens: 8192 }, 'ppt-generation');
    return result.text;
  };
}

function backfillGeneratedImages(scene: Scene, mapping: ImageMapping) {
  if (scene.type !== 'slide') return;
  const content = scene.content as { canvas?: { elements?: Array<Record<string, unknown>> } };
  for (const element of content.canvas?.elements ?? []) {
    if (element.type === 'image' && typeof element.src === 'string' && mapping[element.src]) element.src = mapping[element.src];
  }
}

// ── 概念热区 & 代码按钮生成 ────────────────────────────

const CODE_KEYWORDS = [
  '编程', '代码', '函数', '变量', '类', '对象', '算法', '数据结构',
  'python', 'java', 'javascript', 'typescript', 'c++', 'go', 'rust',
  'sql', 'html', 'css', 'react', 'vue', 'node', 'api', 'sdk',
  'git', 'docker', '命令行', '终端', 'shell', '调试', '测试',
  '框架', '库', '包', '模块', '依赖', '导入', '导出', '接口',
  '排序', '搜索', '递归', '迭代', '遍历', '图', '树', '哈希',
  '动态规划', '贪心', '回溯', '分治',
];

function needsCodeButtons(knowledgePoints: string[]): boolean {
  const lower = knowledgePoints.join(' ').toLowerCase();
  return CODE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/** 从所有 slide 场景中收集文本内容，用于概念 snippet 生成的上下文 */
function collectSlideText(scenes: Scene[]): string {
  const parts: string[] = [];
  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;
    const canvas = (scene.content as { canvas?: { elements?: Array<Record<string, unknown>> } }).canvas;
    for (const el of canvas?.elements ?? []) {
      if (el.type === 'text' && typeof el.content === 'string') {
        parts.push(el.content);
      }
    }
  }
  return parts.join('\n').slice(0, 3000);
}

/** 批量生成概念讲解 snippet，与 PPT scene 并行调用 */
async function generateConceptSnippets(
  aiCall: (sys: string, user: string) => Promise<string>,
  knowledgePoints: string[],
  slideContext: string,
): Promise<ConceptHotspot[]> {
  const systemPrompt = '你是概念讲解助手。请只输出 JSON，不要输出任何其他文字。';
  const userPrompt = [
    '请为以下知识点各生成 50-200 字的简明概念讲解。',
    `知识点列表：${JSON.stringify(knowledgePoints)}`,
    `PPT 上下文（供参考）：\n${slideContext}`,
    '输出格式：JSON 数组 [{"keyword":"知识点","snippet":"讲解文字"}]',
  ].join('\n');
  const raw = await aiCall(systemPrompt, userPrompt);
  const parsed = parseJsonResponse<Array<{ keyword: string; snippet: string }>>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is ConceptHotspot => typeof item.keyword === 'string' && typeof item.snippet === 'string')
    .map((item) => ({ keyword: item.keyword, snippet: item.snippet }));
}

/** 将生成的 hotspots 注入到匹配的 slide 元素中 */
function injectHotspots(scenes: Scene[], hotspots: ConceptHotspot[]) {
  if (!hotspots.length) return;
  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;
    const canvas = (scene.content as { canvas?: { elements?: Array<Record<string, unknown>> } }).canvas;
    for (const el of canvas?.elements ?? []) {
      if (el.type !== 'text' || typeof el.content !== 'string') continue;
      const textContent = el.content as string;
      const matched = hotspots.filter((hs) => textContent.includes(hs.keyword));
      if (matched.length > 0) {
        el.hotspots = matched;
      }
    }
  }
}

/** 为涉及编程/算法的 slide 场景生成可运行代码按钮 */
async function generateCodeButtons(
  aiCall: (sys: string, user: string) => Promise<string>,
  knowledgePoints: string[],
  slideContext: string,
): Promise<CodeButton[]> {
  const systemPrompt = '你是代码示例生成器。请只输出 JSON，不要输出任何其他文字。';
  const userPrompt = [
    '请为以下编程相关的知识点各生成一段 10-30 行的可运行示例代码。',
    `知识点列表：${JSON.stringify(knowledgePoints)}`,
    `PPT 上下文：\n${slideContext}`,
    '输出格式：JSON 数组 [{"label":"运行示例：xxx","language":"python","code":"..."}]',
    '要求：代码完整可运行，包含必要的注释。',
  ].join('\n');
  const raw = await aiCall(systemPrompt, userPrompt);
  const parsed = parseJsonResponse<Array<{ label: string; language: string; code: string }>>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is CodeButton => typeof item.label === 'string' && typeof item.language === 'string' && typeof item.code === 'string')
    .map((item, idx) => ({ id: `code-btn-${idx}`, label: item.label, language: item.language, code: item.code }));
}

/** 将 code buttons 注入到最合适的 slide 场景中（优先最后一个 slide） */
function injectCodeButtons(scenes: Scene[], buttons: CodeButton[]) {
  if (!buttons.length) return;
  const slideScenes = scenes.filter((s) => s.type === 'slide');
  if (!slideScenes.length) return;
  // 将代码按钮附加到最后一个 slide 场景
  const targetScene = slideScenes[slideScenes.length - 1];
  const content = targetScene.content as { codeButtons?: CodeButton[] };
  content.codeButtons = buttons;
}

export async function generatePptScenes(requirement: string, aiConfig?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }, enableImageGeneration?: boolean, includeInteractive?: boolean, knowledgePoints?: string[]) {
  const aiCall = createAICallFn(aiConfig?.providerId, aiConfig?.modelId, aiConfig?.apiKey, aiConfig?.baseUrl);
  const imageGenProvider = resolveImageGenProvider();
  const imageGenAvailable = enableImageGeneration && !!resolveImageGenApiKey(imageGenProvider, undefined);
  const requirements: UserRequirements = { requirement, language: 'zh-CN' };
  const outlineResult = await generateSceneOutlinesFromRequirements(requirements, undefined, undefined, aiCall, undefined, { imageGenerationEnabled: imageGenAvailable, videoGenerationEnabled: false, includeInteractive: includeInteractive !== false });
  if (!outlineResult.success || !outlineResult.data) return [];
  let generatedMediaMapping: ImageMapping = {};
  if (imageGenAvailable) {
    try {
      const allMediaGens = outlineResult.data.filter((o) => o.mediaGenerations?.length).flatMap((o) => o.mediaGenerations!);
      if (allMediaGens.length > 0) generatedMediaMapping = Object.fromEntries(await batchGenerateImages(allMediaGens));
    } catch (imgErr) {
      // Image generation failure must never block PPT generation.
      // Proceed with empty mapping — slides will use placeholder images.
      console.warn('[ppt-generator] Image generation failed, proceeding without images:', imgErr);
    }
  }
  const stageId = `stage_${Date.now()}`;
  const scenes: Scene[] = [];
  for (const outline of outlineResult.data) {
    const scene = await buildSceneFromOutline(outline, aiCall, stageId, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, generatedMediaMapping);
    if (scene) {
      backfillGeneratedImages(scene, generatedMediaMapping);
      scenes.push(scene);
    }
  }

  // ── 后处理：生成概念热区和代码按钮 ──
  const kps = knowledgePoints ?? [];
  if (kps.length > 0 && scenes.length > 0) {
    const slideContext = collectSlideText(scenes);
    const tasks: Promise<void>[] = [];

    // 概念 snippet 生成
    tasks.push(
      generateConceptSnippets(aiCall, kps, slideContext).then((hotspots) => {
        injectHotspots(scenes, hotspots);
      }),
    );

    // 代码按钮生成（仅当知识点涉及编程/算法时）
    if (needsCodeButtons(kps)) {
      tasks.push(
        generateCodeButtons(aiCall, kps, slideContext).then((buttons) => {
          injectCodeButtons(scenes, buttons);
        }),
      );
    }

    // 角色分配：为每个 speech action 标注说话者（主讲老师/助教/学生）
    tasks.push(assignSpeakersToScenesAsync(scenes, aiCall));

    await Promise.all(tasks);
  }

  return scenes.sort((a, b) => a.order - b.order);
}
