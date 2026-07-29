/**
 * L2 Update prompt — Extract structured facts from raw surface activity.
 *
 * Variables:
 *   {userLabel} — User identifier for personalization
 *   {surface} — Surface name (chat, quiz, notebook, etc.)
 *   {sections} — Comma-separated list of valid section names
 *   {focus} — What this surface focuses on
 *   {today} — Current date
 *   {existing} — Existing L2 document content
 *   {chunkIndex} — Current chunk number (1-based)
 *   {chunkTotal} — Total chunk count
 *   {chunkStart} — Start character offset
 *   {chunkEnd} — End character offset
 *   {chunk} — The actual text chunk to process
 *   {allowedRefs} — Comma-separated list of valid refs
 */

export interface UpdateL2Prompt {
  system: string;
  user: string;
}

export function updateL2Prompt(vars: {
  userLabel: string;
  surface: string;
  sections: string;
  focus: string;
  today: string;
  existing: string;
  chunkIndex: number;
  chunkTotal: number;
  chunkStart: number;
  chunkEnd: number;
  chunk: string;
  allowedRefs: string;
}): UpdateL2Prompt {
  return {
    system: [
      `你是 DeepTutor 用户 ${vars.userLabel} 的记忆管理员。`,
      ``,
      `角色：阅读用户近期的 ${vars.surface} 活动（原始、未截断），提取关于用户的持久事实。`,
      ``,
      `输出：一个 JSON 对象——不要其他内容，不要散文，不要代码围栏。`,
      ``,
      `    {"facts": [`,
      `      {"text":   "<≤240字符；每条一个事实>",`,
      `       "section": "<以下之一: ${vars.sections}>",`,
      `       "refs":   ["<surface>:<entity_id>", ...]}`,
      `    ]}`,
      ``,
      `硬规则`,
      `- 每个事实必须 ≥1 个 ref。每个 ref 必须来自下方"本块可引用 ref"列表`,
      `  或你在块中看到的 @entity <surface>:<id> 标记——不要编造 id。`,
      `- text ≤ 240 字符。简洁，动词导向（"在学习 X"，"卡在 Y"）。`,
      `- 禁止绝对化措辞：精通、专家、热爱、总是、从不、完全理解。`,
      `- 本 surface 聚焦: ${vars.focus}。`,
      `- 如果本块没有实质性内容，返回 {"facts": []}——这是正确的预期答案。`,
      ``,
      `今天是 ${vars.today}。`,
    ].join('\n'),

    user: [
      `# 现有 ${vars.surface} 记忆（不要重复已捕获的内容）:`,
      `${vars.existing || '(无已有记忆)'}`,
      ``,
      `# 数据块 ${vars.chunkIndex}/${vars.chunkTotal} (字符 ${vars.chunkStart}..${vars.chunkEnd}):`,
      `----------------------------------------------------------------`,
      `${vars.chunk}`,
      `----------------------------------------------------------------`,
      ``,
      `# 本块可引用 ref:`,
      `${vars.allowedRefs || '(无)'}`,
      ``,
      `返回 JSON。只引用上方列表中或本块中可见的 ref。`,
    ].join('\n'),
  };
}
