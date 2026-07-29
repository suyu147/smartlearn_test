/**
 * L2 Update prompt — Extract structured facts from raw surface activity (English).
 */

import type { UpdateL2Prompt } from '@/lib/deeptutor/services/memory/prompts/zh/update_l2';

export function updateL2PromptEn(vars: {
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
      `You are the memory steward for DeepTutor user ${vars.userLabel}.`,
      ``,
      `Role: read recent ${vars.surface} activity (raw, untruncated) and extract durable facts about the user.`,
      ``,
      `Output: a single JSON object — nothing else, no prose, no code fences.`,
      ``,
      `    {"facts": [`,
      `      {"text":   "<≤240 chars; one fact per entry>",`,
      `       "section": "<one of: ${vars.sections}>",`,
      `       "refs":   ["<surface>:<entity_id>", ...]}`,
      `    ]}`,
      ``,
      `Hard rules`,
      `- Each fact must have ≥1 ref. Each ref must come from the "Allowed refs" list below`,
      `  or from @entity <surface>:<id> markers visible in the chunk — do NOT invent IDs.`,
      `- text ≤ 240 chars. Concise, action-oriented ("learning X", "stuck on Y").`,
      `- Forbidden absolutes: master, expert, love, always, never, fully understand.`,
      `- This surface focuses on: ${vars.focus}.`,
      `- If there is nothing substantive in this chunk, return {"facts": []} — this is the correct expected answer.`,
      ``,
      `Today is ${vars.today}.`,
    ].join('\n'),

    user: [
      `# Existing ${vars.surface} memory (do not repeat already-captured facts):`,
      `${vars.existing || '(no existing memory)'}`,
      ``,
      `# Chunk ${vars.chunkIndex}/${vars.chunkTotal} (chars ${vars.chunkStart}..${vars.chunkEnd}):`,
      `----------------------------------------------------------------`,
      `${vars.chunk}`,
      `----------------------------------------------------------------`,
      ``,
      `# Allowed refs for this chunk:`,
      `${vars.allowedRefs || '(none)'}`,
      ``,
      `Return JSON. Only cite refs from the list above or visible in this chunk.`,
    ].join('\n'),
  };
}
