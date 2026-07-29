/**
 * L3 Update prompt — Synthesize cross-surface insights from L2 entries.
 *
 * Variables:
 *   {userLabel} — User identifier
 *   {slot} — L3 slot name (recent, profile, scope)
 *   {slotFocus} — What this slot focuses on
 *   {sections} — Comma-separated L3 section names
 *   {today} — Current date
 *   {existing} — Existing L3 document content
 *   {chunkIndex} — Current chunk number (1-based)
 *   {chunkTotal} — Total chunk count
 *   {chunk} — L2 entries rendered as text
 *   {l2Surfaces} — Comma-separated source surface names
 */

export interface UpdateL3Prompt {
  system: string;
  user: string;
}

export function updateL3Prompt(vars: {
  userLabel: string;
  slot: string;
  slotFocus: string;
  sections: string;
  today: string;
  existing: string;
  chunkIndex: number;
  chunkTotal: number;
  chunk: string;
  l2Surfaces: string;
}): UpdateL3Prompt {
  return {
    system: [
      `你是 DeepTutor 用户 ${vars.userLabel} 的记忆管理员。`,
      ``,
      `角色：阅读用户在多个 surface（${vars.l2Surfaces}）上的事实摘要，`,
      `合成到 L3/${vars.slot} 槽位的洞察。`,
      ``,
      `本槽位聚焦: ${vars.slotFocus}`,
      ``,
      `输出：一个 JSON 对象——不要其他内容，不要散文，不要代码围栏。`,
      ``,
      `    {"facts": [`,
      `      {"text":   "<≤240字符；每条一个事实>",`,
      `       "section": "<以下之一: ${vars.sections}>",`,
      `       "refs":   ["<L2 source surface name>", ...]}`,
      `    ]}`,
      ``,
      `硬规则`,
      `- 每个事实必须 ≥1 个 ref。ref 必须是 L2 surface 名称: ${vars.l2Surfaces}——不要编造。`,
      `- text ≤ 240 字符。从多 surface 合成，不要仅重复 L2 条目。`,
      `- 禁止绝对化措辞：精通、专家、热爱、总是、从不、完全理解。`,
      `- 如果本块没有可合成的洞察，返回 {"facts": []}。`,
      ``,
      `今天是 ${vars.today}。`,
    ].join('\n'),

    user: [
      `# 现有 L3/${vars.slot} 记忆（不要重复）:`,
      `${vars.existing || '(无已有记忆)'}`,
      ``,
      `# L2 条目块 ${vars.chunkIndex}/${vars.chunkTotal}:`,
      `----------------------------------------------------------------`,
      `${vars.chunk}`,
      `----------------------------------------------------------------`,
      ``,
      `返回 JSON。ref 必须是 L2 surface 名称。`,
    ].join('\n'),
  };
}
