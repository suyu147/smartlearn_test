import { streamLLM } from '@/lib/ai/llm';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { resolveModel } from '@/lib/server/resolve-model';
import evaluationPrompt from '@/lib/prompts/evaluation-prompt.json';
import type { ProfileDimensions } from '@/lib/types/profile';
import type { ProviderId } from '@/lib/types/provider';
import type { EvaluationResultPayload, QuizResultPayload } from '../types';

const EVALUATION_SYSTEM_PROMPT = evaluationPrompt.systemPrompt;

export async function evaluateQuizResults(quizResults: QuizResultPayload[], profile: ProfileDimensions, aiConfig?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
  const { model } = resolveModel({
    providerId: aiConfig?.providerId as ProviderId | undefined,
    modelId: aiConfig?.modelId,
    apiKey: aiConfig?.apiKey,
    baseUrl: aiConfig?.baseUrl,
  });
  const correctCount = quizResults.filter((item) => item.correct).length;
  const totalCount = quizResults.length;
  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const resultsSummary = quizResults.map((item) => `[${item.correct ? '✓' : '✗'}] 难度${item.difficulty}/5 | 知识点: ${item.knowledgePoints.join(', ')} | 题目: ${item.question} | 学生答案: ${item.userAnswer} | 正确答案: ${item.correctAnswer}`).join('\n');
  const result = streamLLM({ model, system: EVALUATION_SYSTEM_PROMPT, prompt: `练习结果（得分: ${score}/${totalCount}，正确率: ${score}%）：\n${resultsSummary}\n\n当前学习画像：\n${JSON.stringify(profile, null, 2)}`, maxOutputTokens: 2048 }, 'learn-evaluate');
  let fullContent = '';
  for await (const chunk of result.textStream) fullContent += chunk;
  const evaluation = parseJsonResponse<EvaluationResultPayload>(fullContent);
  return { evaluation: evaluation ?? null, score, text: fullContent };
}
