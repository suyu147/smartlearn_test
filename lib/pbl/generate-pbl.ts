import type { GeneratedPBLContent } from '@/lib/types/generation';
import type { SceneOutline } from '@/lib/types/generation';
import { streamLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import { parseJsonResponse } from '@/lib/generation/json-repair';

const PBL_SYSTEM_PROMPT = `你是一个项目式学习（PBL）内容设计专家。根据给定的主题和要求，设计完整的PBL项目方案。

你需要返回JSON格式，包含以下字段：
- projectConfig: 项目配置
  - title: 项目标题
  - description: 项目描述
  - tasks: 任务列表，每个任务包含 id、title、description、type（research/design/implement/present/reflect）、deliverable
- agents: 参与者角色列表（空数组即可）
- issueboard: 议题板 { issues: [] }

确保任务设计循序渐进，覆盖从调研到反思的完整PBL流程。`;

export async function generatePBLContent(
  config: {
    projectTopic?: string;
    projectDescription?: string;
    targetSkills?: string[];
    issueCount?: number;
    language?: string;
  },
  _languageModel: unknown,
  _options?: { onProgress?: (msg: string) => void },
): Promise<GeneratedPBLContent> {
  try {
    const { model } = getModel({
      providerId: (process.env.AI_PROVIDER as ProviderId) || 'deepseek',
      modelId: process.env.AI_MODEL || 'deepseek-chat',
      apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '',
    });

    const prompt = `请设计一个PBL项目方案：
主题：${config.projectTopic || '自由主题'}
描述：${config.projectDescription || '综合学习项目'}
目标技能：${config.targetSkills?.join(', ') || '综合能力'}
议题数量：${config.issueCount || 5}
语言：${config.language || '中文'}`;

    const result = await streamLLM(
      {
        model,
        system: PBL_SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 4096,
      },
      'pbl-generate',
    );

    const content = await result.text;
    const parsed = parseJsonResponse<GeneratedPBLContent>(content);

    if (parsed && parsed.projectConfig) {
      return parsed;
    }

    return {
      projectConfig: {
        title: config.projectTopic || 'PBL项目',
        description: config.projectDescription || '',
        tasks: [],
      },
      agents: [],
      issueboard: { issues: [] },
    };
  } catch (error) {
    console.error('PBL generation error:', error);
    return {
      projectConfig: {
        title: config.projectTopic || 'PBL项目',
        description: config.projectDescription || '',
        tasks: [],
      },
      agents: [],
      issueboard: { issues: [] },
    };
  }
}

export async function generatePBLSceneContent(
  outline: SceneOutline,
  languageModel: unknown,
  _options?: { onProgress?: (msg: string) => void },
): Promise<GeneratedPBLContent | null> {
  try {
    const pblConfig = outline.pblConfig;
    if (!pblConfig) return null;

    const result = await generatePBLContent(
      {
        projectTopic: pblConfig.projectTitle,
        projectDescription: pblConfig.projectDescription,
        targetSkills: pblConfig.targetSkills,
        issueCount: pblConfig.issueCount,
        language: pblConfig.language || outline.language,
      },
      languageModel,
      _options,
    );

    return result;
  } catch (error) {
    console.error('PBL scene generation error:', error);
    return null;
  }
}
