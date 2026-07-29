/**
 * 台词角色分配后处理器
 *
 * 为每个 Scene 中的 speech action 分配 speaker (agentId)。
 * 策略：规则启发式 + 可选 LLM 精确分配。
 *
 * 规则启发式：
 *  - 疑问句 → 学生角色
 *  - 短语/感叹 → 好奇同学
 *  - 含"补充"/"另外"/"注意" → 助教
 *  - 其余 → 主讲老师
 *
 * LLM 分配：将所有台词发送给模型，让它为每句标注角色。
 */

import type { Scene } from '@/lib/types/stage';
import type { SpeechAction, Action } from '@/lib/types/action';
import { CLASSROOM_SPEAKERS, type ClassroomSpeaker } from './speaker-roster';
import { parseJsonResponse } from './json-repair';

// ── 规则启发式分配 ──────────────────────────────────────

const QUESTION_PATTERNS = /[？?]|为什么|怎么样|怎么办|难道|是不是|能不能|有没有|什么|哪个|哪些|如何|为何|是否|对吗|理解|明白/;
const SHORT_EXCLAMATION_PATTERNS = /^[^，。！？,\.!\?]{1,12}[！!。~]$/;
const ASSISTANT_PATTERNS = /补充|另外|注意|其实|换句话说|举个例子|也就是说|进一步|延伸|拓展|比如|类比|对比/;

function classifyByRule(text: string): ClassroomSpeaker {
  const trimmed = text.trim();

  // 疑问句 → 学生
  if (QUESTION_PATTERNS.test(trimmed)) {
    // 短小感叹 → 好奇同学
    if (SHORT_EXCLAMATION_PATTERNS.test(trimmed)) {
      return CLASSROOM_SPEAKERS[2]; // student-curious
    }
    // 较长的问题 → 思考者
    if (trimmed.length > 30) {
      return CLASSROOM_SPEAKERS[3]; // student-thinker
    }
    return CLASSROOM_SPEAKERS[2]; // student-curious
  }

  // 补充/拓展类 → 助教
  if (ASSISTANT_PATTERNS.test(trimmed)) {
    return CLASSROOM_SPEAKERS[1]; // assistant
  }

  // 默认 → 主讲老师
  return CLASSROOM_SPEAKERS[0]; // teacher
}

/** 纯规则分配（跳过 LLM 已分配的角色） */
function assignSpeakersByRule(actions: Action[]): void {
  let lastSpeakerId = '';

  for (const action of actions) {
    if (action.type !== 'speech' || !action.text) continue;

    // LLM 已在 prompt 输出中直接标注了 agentId，保留不动
    if (action.agentId && CLASSROOM_SPEAKERS.some((s) => s.id === action.agentId)) {
      lastSpeakerId = action.agentId;
      continue;
    }

    const speaker = classifyByRule(action.text);

    // 避免连续同一学生角色说太多——偶尔穿插老师
    if (speaker.role === 'student' && lastSpeakerId === speaker.id) {
      const alt = speaker.id === 'student-curious' ? CLASSROOM_SPEAKERS[3] : CLASSROOM_SPEAKERS[2];
      (action as SpeechAction).agentId = alt.id;
      lastSpeakerId = alt.id;
      continue;
    }

    (action as SpeechAction).agentId = speaker.id;
    lastSpeakerId = speaker.id;
  }
}

// ── LLM 精确分配 ────────────────────────────────────────

/**
 * 用 LLM 为台词分配角色（更精确但更慢）。
 * 将所有台词打包发给模型，让它标注每句的 speaker id。
 */
async function assignSpeakersByLLM(
  actions: Action[],
  aiCall: (sys: string, user: string) => Promise<string>,
): Promise<void> {
  // 只处理没有 agentId 的 speech action
  const speeches = actions
    .map((a, idx) => (a.type === 'speech' ? { idx, text: a.text, hasAgentId: !!a.agentId } : null))
    .filter(Boolean) as Array<{ idx: number; text: string; hasAgentId: boolean }>;

  // 过滤出需要分配的台词
  const unassigned = speeches.filter((s) => !s.hasAgentId);
  if (unassigned.length === 0) return; // 全部已由 LLM 输出标注

  const speakerList = CLASSROOM_SPEAKERS.map((s) => `"${s.id}"(${s.name}-${s.persona})`).join('、');

  const systemPrompt = '你是课堂台词角色分配器。请只输出 JSON 数组，不要输出任何其他文字。';
  const userPrompt = [
    `角色列表：${speakerList}`,
    `台词列表：${JSON.stringify(unassigned)}`,
    '请为每句台词分配最合适的角色 id。规则：',
    '1. 主要讲解内容分配给 teacher',
    '2. 补充说明、举例类比分配给 assistant',
    '3. 疑问和追问分配给 student-curious 或 student-thinker',
    '4. teacher 应该占 60% 以上的台词',
    '输出格式：[{"idx":0,"speakerId":"teacher"},...]',
  ].join('\n');

  try {
    const raw = await aiCall(systemPrompt, userPrompt);
    const parsed = parseJsonResponse<Array<{ idx: number; speakerId: string }>>(raw);
    if (!Array.isArray(parsed)) {
      assignSpeakersByRule(actions);
      return;
    }
    const assignmentMap = new Map(parsed.map((item) => [item.idx, item.speakerId]));

    for (const { idx } of unassigned) {
      const speakerId = assignmentMap.get(idx);
      const speaker = CLASSROOM_SPEAKERS.find((s) => s.id === speakerId) ?? classifyByRule(actions[idx].text ?? '');
      (actions[idx] as SpeechAction).agentId = speaker.id;
    }
  } catch {
    // LLM 调用失败，回退到规则
    assignSpeakersByRule(actions);
  }
}

// ── 公共 API ────────────────────────────────────────────

export interface SpeakerAssignmentOptions {
  /** 使用 LLM 分配（默认 false，使用规则） */
  useLLM?: boolean;
  /** LLM 调用函数（useLLM=true 时必填） */
  aiCall?: (sys: string, user: string) => Promise<string>;
}

/**
 * 为所有场景中的 speech action 分配 agentId（角色标识）
 */
export function assignSpeakersToScenes(scenes: Scene[], options?: SpeakerAssignmentOptions): void {
  for (const scene of scenes) {
    if (!scene.actions?.length) continue;

    if (options?.useLLM && options.aiCall) {
      // LLM 分配是异步的，这里同步调用
      // 外层需要 await wrapPromise
      assignSpeakersByRule(scene.actions); // 先用规则做初始赋值
    } else {
      assignSpeakersByRule(scene.actions);
    }
  }
}

/**
 * 异步版本：用 LLM 为所有场景分配角色
 */
export async function assignSpeakersToScenesAsync(
  scenes: Scene[],
  aiCall: (sys: string, user: string) => Promise<string>,
): Promise<void> {
  for (const scene of scenes) {
    if (!scene.actions?.length) continue;
    await assignSpeakersByLLM(scene.actions, aiCall);
  }
}
