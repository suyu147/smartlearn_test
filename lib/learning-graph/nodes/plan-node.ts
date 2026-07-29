import { generateId } from '@/lib/utils';
import { streamLLM } from '@/lib/ai/llm';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { resolveModel } from '@/lib/server/resolve-model';
import type { ProviderId } from '@/lib/types/provider';
import type { LearnEvent } from '../types';
import type { LearningStateType } from '../state';
const PLAN_NEXT_NODE_PROMPT = `你是一个学习路径规划师。请根据学生画像、学习目标与已完成节点，只规划“下一个”学习节点。

输出必须是 JSON，不要输出 markdown，不要解释额外文字。

输出格式：
{
  "title": "节点标题",
  "knowledgePoints": ["知识点1", "知识点2"],
  "estimatedMinutes": 30
}

约束：
- 只规划 1 个节点
- knowledgePoints 数量为 2-4 个
- estimatedMinutes 输出 10-120 之间的整数
- 必须结合已完成节点避免重复
- 必须结合画像中的薄弱点、目标和基础水平`;

function getWriter(config: { configurable?: { writer?: (event: LearnEvent) => void } }) {
  return config.configurable?.writer ?? (() => undefined);
}

function buildPrompt(state: LearningStateType) {
  const completed = state.completedNodes.length > 0
    ? state.completedNodes
      .map((node) => `- ${node.title}（知识点：${node.knowledgePoints.join('、')}）`)
      .join('\n')
    : '暂无已完成节点。';

  return [
    `学习目标：${state.goal}`,
    `当前画像：${JSON.stringify(state.profile, null, 2)}`,
    `已完成节点：\n${completed}`,
    state.evaluationFeedback?.weakPoints?.length
      ? `上轮评估薄弱点：${state.evaluationFeedback.weakPoints.join('、')}，请优先规划包含这些知识点的节点。`
      : '',
    '请规划下一个学习节点。',
  ].filter(Boolean).join('\n\n');
}

export async function planNode(
  state: LearningStateType,
  config: { configurable?: { writer?: (event: LearnEvent) => void } },
) {
  const write = getWriter(config);
  write({ type: 'phase_start', phase: 'plan' });

  try {
    const { model } = resolveModel({
      providerId: state.aiConfig?.providerId as ProviderId | undefined,
      modelId: state.aiConfig?.modelId,
      apiKey: state.aiConfig?.apiKey,
      baseUrl: state.aiConfig?.baseUrl,
    });
    const result = streamLLM({
      model,
      system: PLAN_NEXT_NODE_PROMPT,
      prompt: buildPrompt(state),
      maxOutputTokens: 2048,
    }, 'learn-plan-node');

    let fullContent = '';
    for await (const chunk of result.textStream) {
      fullContent += chunk;
      write({ type: 'text_delta', text: chunk });
    }

    const parsed = parseJsonResponse<{ title?: string; knowledgePoints?: string[]; estimatedMinutes?: number }>(fullContent);
    if (!parsed?.title || !Array.isArray(parsed.knowledgePoints) || parsed.knowledgePoints.length === 0) {
      throw new Error('节点规划失败');
    }

    const node = {
      id: generateId(),
      title: parsed.title,
      knowledgePoints: parsed.knowledgePoints.slice(0, 4),
      resources: [],
      estimatedMinutes: Math.max(10, Math.min(120, Number(parsed.estimatedMinutes) || 30)),
      prerequisites: state.completedNodes.length > 0 ? [state.completedNodes[state.completedNodes.length - 1].id] : [],
      status: 'in_progress' as const,
    };

    write({ type: 'node_ready', node });
    write({ type: 'phase_end', phase: 'plan' });
    return { currentNode: node, phase: 'plan' };
  } catch (error) {
    write({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    write({ type: 'phase_end', phase: 'plan' });
    return { phase: 'plan' };
  }
}
