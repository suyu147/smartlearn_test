import { streamLLM, callLLM } from '@/lib/ai/llm';
import { resolveModel } from '@/lib/server/resolve-model';
import tutorChatPrompt from '@/lib/prompts/tutor-chat-prompt.json';
import profileBuildPrompt from '@/lib/prompts/profile-build-prompt.json';
import type { ProviderId } from '@/lib/types/provider';
import type { ResourceType } from '@/lib/types/resource';
import type { ProfileDimensions } from '@/lib/types/profile';

const TUTOR_SYSTEM_PROMPT = tutorChatPrompt.systemPrompt;
const PROFILE_BUILD_SYSTEM_PROMPT = profileBuildPrompt.systemPrompt;

interface AttachedResourcePayload {
  id: string;
  type: ResourceType;
  title: string;
  content: string;
}

function buildAttachedContext(attachedResources: AttachedResourcePayload[] | undefined, currentNodeTitle?: string) {
  if (!attachedResources || attachedResources.length === 0) return '';
  return ['以下是用户本轮主动附加给你的学习上下文，请优先结合这些材料回答：', currentNodeTitle ? `当前学习节点: ${currentNodeTitle}` : '', ...attachedResources.map((resource, index) => [`资源 ${index + 1}: ${resource.title}`, `类型: ${resource.type}`, '内容摘录:', resource.content].join('\n'))].filter(Boolean).join('\n\n');
}

export function streamTutorResponse(message: string, conversationHistory: { role: string; content: string }[], attachedResources: AttachedResourcePayload[] | undefined, currentNodeTitle: string | undefined, aiConfig?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
  const { model } = resolveModel({
    providerId: aiConfig?.providerId as ProviderId | undefined,
    modelId: aiConfig?.modelId,
    apiKey: aiConfig?.apiKey,
    baseUrl: aiConfig?.baseUrl,
  });
  const attachedContext = buildAttachedContext(attachedResources, currentNodeTitle);
  const messages = [...conversationHistory.slice(-10).map((item) => ({ role: item.role as 'user' | 'assistant', content: item.content })), { role: 'user' as const, content: attachedContext ? `${attachedContext}\n\n用户问题: ${message}` : message }];
  return streamLLM({ model, system: TUTOR_SYSTEM_PROMPT, messages, maxOutputTokens: 2048 }, 'learn-tutor');
}

/** 各维度中文标签，用于提示词展示 */
const DIMENSION_LABELS: Record<string, string> = {
  knowledgeBase: '知识基础',
  cognitiveStyle: '认知风格',
  learningGoals: '学习目标',
  weakPoints: '薄弱知识点',
  timePreference: '时间偏好',
  interests: '兴趣方向',
  learningPace: '学习节奏',
  errorPatterns: '易错点',
};

/**
 * 判断某个维度是否已被收集到有效数据
 */
function isDimensionFilled(key: string, dims: ProfileDimensions): boolean {
  // 通过索引获取维度值
  const v = (dims as unknown as Record<string, unknown>)[key];
  if (v == null || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  switch (key) {
    case 'knowledgeBase': return Array.isArray(obj.subjects) && obj.subjects.length > 0;
    case 'cognitiveStyle': return typeof obj.preference === 'string' && obj.preference.length > 0;
    case 'learningGoals': return (Array.isArray(obj.shortTerm) && obj.shortTerm.length > 0) || (typeof obj.longTerm === 'string' && obj.longTerm.length > 0);
    case 'weakPoints': return (Array.isArray(obj.topics) && obj.topics.length > 0) || (Array.isArray(obj.errorPatterns) && obj.errorPatterns.length > 0);
    case 'timePreference': return (typeof obj.preferredDuration === 'number' && obj.preferredDuration > 0) || (typeof obj.preferredTimeSlot === 'string' && obj.preferredTimeSlot.length > 0);
    case 'interests': return Array.isArray(obj.domains) && obj.domains.length > 0;
    case 'learningPace': return typeof obj.depthPreference === 'string' && obj.depthPreference.length > 0;
    case 'errorPatterns': return (Array.isArray(obj.commonMistakes) && obj.commonMistakes.length > 0) || (Array.isArray(obj.difficultAreas) && obj.difficultAreas.length > 0);
    default: return false;
  }
}

/**
 * 构建动态系统提示词，包含当前画像状态，引导AI聚焦未填维度
 */
function buildProfileSystemPrompt(currentDimensions: ProfileDimensions): string {
  const filled: string[] = [];
  const unfilled: string[] = [];
  for (const key of Object.keys(DIMENSION_LABELS)) {
    if (isDimensionFilled(key, currentDimensions)) {
      filled.push(DIMENSION_LABELS[key]);
    } else {
      unfilled.push(DIMENSION_LABELS[key]);
    }
  }

  const filledStr = filled.length > 0 ? filled.join('、') : '无';
  const unfilledStr = unfilled.length > 0 ? unfilled.join('、') : '全部完成';

  return `${PROFILE_BUILD_SYSTEM_PROMPT}

## 当前画像状态（重要！）

已完成的维度（不要再问这些）：${filledStr}
尚未完成的维度（优先推进这些）：${unfilledStr}

**你的核心任务：优先引导用户提供"尚未完成"维度的信息，自然过渡，不要回头问已完成维度的问题。**`;
}

/**
 * Stream a profile-building conversation response.
 * Uses a specialized prompt that guides the AI to learn about the user's learning profile through natural conversation.
 */
export function streamProfileBuildResponse(
  message: string,
  conversationHistory: { role: string; content: string }[],
  currentDimensions?: ProfileDimensions,
  aiConfig?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string },
) {
  const { model } = resolveModel({
    providerId: aiConfig?.providerId as ProviderId | undefined,
    modelId: aiConfig?.modelId,
    apiKey: aiConfig?.apiKey,
    baseUrl: aiConfig?.baseUrl,
  });
  const messages = [
    ...conversationHistory.slice(-10).map((item) => ({ role: item.role as 'user' | 'assistant', content: item.content })),
    { role: 'user' as const, content: message },
  ];
  const systemPrompt = currentDimensions
    ? buildProfileSystemPrompt(currentDimensions)
    : PROFILE_BUILD_SYSTEM_PROMPT;
  return streamLLM({ model, system: systemPrompt, messages, maxOutputTokens: 2048 }, 'profile-build');
}

/**
 * Try to extract a valid JSON object from an LLM response string.
 * Handles: code blocks, raw JSON, JSON surrounded by explanatory text.
 */
function extractJsonFromResponse(text: string): string | null {
  const trimmed = text.trim();

  // Strategy 1: fenced code block ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const candidate = codeBlockMatch[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // fall through
    }
  }

  // Strategy 2: the whole string is valid JSON
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // fall through
  }

  // Strategy 3: find the outermost { ... } by brace matching
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Extract profile dimensions from the conversation using a non-streaming LLM call.
 * Returns partial ProfileDimensions based on what can be inferred from the conversation.
 */
export async function extractProfileDimensions(
  conversationHistory: { role: string; content: string }[],
  currentDimensions: ProfileDimensions,
  aiConfig?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string },
): Promise<Partial<ProfileDimensions> | null> {
  // Need at least one user message + one assistant response
  if (conversationHistory.length < 2) return null;

  const { model } = resolveModel({
    providerId: aiConfig?.providerId as ProviderId | undefined,
    modelId: aiConfig?.modelId,
    apiKey: aiConfig?.apiKey,
    baseUrl: aiConfig?.baseUrl,
  });

  const conversationText = conversationHistory
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n\n');

  const extractionPrompt = `你是一个学习画像提取专家。根据以下对话内容，提取用户的学习画像维度信息。

规则：
1. 只提取对话中明确提到或可以高度确信推断的信息，不要猜测。
2. 如果某个维度无法提取，不要在 JSON 中包含该字段。
3. 严格只输出 JSON，不要有任何额外文字。

当前画像维度：
${JSON.stringify(currentDimensions, null, 2)}

对话内容：
${conversationText}

请返回包含更新字段的 JSON（只包含有变化的字段）：
{
  "knowledgeBase": { "level": "beginner|intermediate|advanced", "subjects": [{ "name": "技术名", "mastery": 0.0-1.0 }] },
  "cognitiveStyle": { "type": "visual|auditory|reading|kinesthetic", "preference": "偏好描述" },
  "learningGoals": { "shortTerm": ["短期目标"], "longTerm": "长期目标" },
  "weakPoints": { "topics": ["薄弱领域"], "errorPatterns": ["错误模式"] },
  "timePreference": { "preferredDuration": 分钟数, "preferredTimeSlot": "时间段", "frequency": "daily|weekly|irregular" },
  "interests": { "domains": ["兴趣领域"], "preferredFormats": ["document|video|code|quiz|mindmap"] },
  "learningPace": { "speed": "slow|moderate|fast", "depthPreference": "broad|deep" },
  "errorPatterns": { "commonMistakes": ["常见错误"], "difficultAreas": ["困难领域"] }
}

如果无法从对话中提取任何有价值的信息，返回空对象 {}。`;

  try {
    const result = await callLLM(
      {
        model,
        system: '你是学习画像分析系统。只返回有效 JSON，不要包含任何其他文字。',
        messages: [{ role: 'user', content: extractionPrompt }],
        maxOutputTokens: 1024,
      },
      'profile-extract',
    );

    const jsonStr = extractJsonFromResponse(result.text);
    if (!jsonStr) {
      console.warn('[profile-extract] Could not extract JSON from LLM response:', result.text.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const keyCount = Object.keys(parsed).length;
      console.log(`[profile-extract] Extracted ${keyCount} dimension(s):`, Object.keys(parsed));
      return keyCount > 0 ? (parsed as Partial<ProfileDimensions>) : null;
    }
    return null;
  } catch (err) {
    console.error('[profile-extract] Extraction failed:', err);
    return null;
  }
}
