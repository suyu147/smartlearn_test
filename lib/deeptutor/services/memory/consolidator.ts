/**
 * Memory Consolidator — LLM-driven L2 and L3 update
 *
 * Replaces the old rollupL1ToL2 / synthesizeL3Recent (simple text concatenation)
 * with LLM-based fact extraction and cross-surface synthesis.
 *
 * Uses DT_TOOL_MODEL env var (default gpt-4o-mini) for low-cost consolidation.
 *
 * L2 Update: Reads snapshot changes → chunks → LLM → structured facts → L2.md
 * L3 Update: Reads new L2 entries → chunks → LLM → synthesized insights → L3/{slot}.md
 */

import { createLogger } from '@/lib/logger';
import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import {
  deserializeDocument,
  serializeDocument,
  addEntry,
  getAllEntryIds,
  getAllEntries,
  type Document,
  type Entry,
} from '@/lib/deeptutor/services/memory/document';
import { newEntryId } from '@/lib/deeptutor/services/memory/ids';
import { validateOps, applyOps, type OpResult } from '@/lib/deeptutor/services/memory/ops';
import type { Op } from '@/lib/deeptutor/services/memory/ops';
import { updateL2Prompt } from '@/lib/deeptutor/services/memory/prompts/zh/update_l2';
import { updateL2PromptEn } from '@/lib/deeptutor/services/memory/prompts/en/update_l2';
import { updateL3Prompt } from '@/lib/deeptutor/services/memory/prompts/zh/update_l3';
import { chunkWithBoundary, renderTracesForConcat } from '@/lib/deeptutor/services/memory/chunker';
import { MetaStore, type L2Meta, type L3Meta } from '@/lib/deeptutor/services/memory/meta';
import { readChatEntities, readChatEntitiesIncremental } from '@/lib/deeptutor/services/memory/snapshot';
import type { Surface } from '@/lib/deeptutor/services/memory';

const log = createLogger('Consolidator');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SECTIONS_CHAT = 'Learning Topics, Difficulties, Questions, Preferences, Progress, Context';
const CHUNK_MAX_CHARS = 3500;
const MAX_L2_PER_SURFACE = 6000; // Cap L2 file size
const TRACE_BUDGET = 50; // Max trace events to feed into L2

// ---------------------------------------------------------------------------
// L3 slot definitions
// ---------------------------------------------------------------------------

const L3_SLOT_CONFIG: Record<string, { focus: string; sections: string }> = {
  recent: {
    focus: '近期对你重要的学习事件和进展',
    sections: 'Key Events, Progress Updates, Recent Topics',
  },
  profile: {
    focus: '你是谁：背景、身份、学习风格、知识储备',
    sections: 'Background, Identity, Learning Style, Knowledge Base',
  },
  scope: {
    focus: '你的学习范围：当前在学什么、掌握程度、兴趣方向',
    sections: 'Active Topics, Mastery Levels, Interests',
  },
};

// ---------------------------------------------------------------------------
// LLM call wrapper for consolidator
// ---------------------------------------------------------------------------

/** Cached user LLM config per consolidator run cycle */
let _cachedUserConfig: { providerId: ProviderId; modelId: string; apiKey: string } | null = null;

/**
 * Resolve the LLM config for the consolidator.
 *
 * Resolution order (mirrors Python's activate_llm_selection pattern):
 * 1. Cached user config (set per-run via setUserLLMConfig)
 * 2. User's stored API key (DtApiKey) + user settings (UserSettings)
 * 3. Environment variables: DT_TOOL_API_KEY / DT_TOOL_PROVIDER / DT_TOOL_MODEL
 * 4. OPENAI_API_KEY fallback
 *
 * Returns null if no usable config is found.
 */
async function resolveLLMConfig(): Promise<{ providerId: ProviderId; modelId: string; apiKey: string } | null> {
  // 1. Cached user config (from explicit run-time selection)
  if (_cachedUserConfig && _cachedUserConfig.apiKey) {
    return _cachedUserConfig;
  }

  // 2. Try user's stored API key + settings
  //    (lazy import to avoid circular deps at module load time)
  try {
    const { getApiKeyService } = await import('@/lib/deeptutor/services/config/api-key-service');
    const { prisma } = await import('@/lib/db/client');
    const apiKeyService = getApiKeyService();

    // Try to find the first active API key for this user
    // Since consolidator is server-side, we use the first available key
    const keys = await prisma.dtApiKey.findMany({
      where: { isActive: true },
      take: 1,
      orderBy: { updatedAt: 'desc' },
    });

    if (keys.length > 0) {
      const decryptedKey = apiKeyService.decrypt(keys[0].apiKey);
      const providerId = (keys[0].provider || 'openai') as ProviderId;

      // Get the user's preferred model from settings
      const settings = await prisma.userSettings.findFirst({
        where: { id: { not: '' } }, // any settings row
        select: { model: true, provider: true },
      });

      const modelId = settings?.model || process.env.DT_TOOL_MODEL || 'gpt-4o-mini';
      const finalProviderId = (settings?.provider || providerId) as ProviderId;

      return { providerId: finalProviderId, modelId, apiKey: decryptedKey };
    }
  } catch (err) {
    log.debug('Could not resolve LLM config from user settings:', err);
  }

  // 3. Environment variables
  const envApiKey = process.env.DT_TOOL_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  if (envApiKey) {
    return {
      providerId: (process.env.DT_TOOL_PROVIDER ?? 'openai') as ProviderId,
      modelId: process.env.DT_TOOL_MODEL ?? 'gpt-4o-mini',
      apiKey: envApiKey,
    };
  }

  return null;
}

/**
 * Set the user LLM config for the current consolidator run.
 * Called by the memory-subscriber or API route before starting consolidation.
 */
export function setUserLLMConfig(config: { providerId: ProviderId; modelId: string; apiKey: string } | null): void {
  _cachedUserConfig = config;
}

async function consolidatorLLM(params: {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const config = await resolveLLMConfig();

  if (!config || !config.apiKey) {
    log.warn('No LLM config available for consolidator — set user API key, DT_TOOL_API_KEY, or OPENAI_API_KEY');
    return '[Consolidator not configured — no LLM API key available]';
  }

  const { model } = getModel({
    providerId: config.providerId,
    modelId: config.modelId,
    apiKey: config.apiKey,
  });

  const result = await callLLM(
    {
      model,
      system: params.system,
      prompt: params.prompt,
      temperature: params.temperature,
      maxOutputTokens: params.maxTokens,
    },
    'memory-consolidator',
  );

  return result.text;
}

// ---------------------------------------------------------------------------
// Fact parsing
// ---------------------------------------------------------------------------

interface RawFact {
  text: string;
  section: string;
  refs: string[];
}

interface ParsedFacts {
  facts: RawFact[];
}

/**
 * Parse the LLM's JSON output into a ParsedFacts object.
 * Handles common LLM output quirks: code fences, trailing commas, etc.
 */
function parseFactsResponse(raw: string): ParsedFacts | null {
  let text = raw.trim();

  // Remove code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.facts)) {
      return parsed as ParsedFacts;
    }
    log.warn('Parsed JSON but facts is not an array:', text.slice(0, 300));
    return null;
  } catch {
    log.warn('Failed to parse facts JSON. Raw response:', raw.slice(0, 300));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fact validation
// ---------------------------------------------------------------------------

function validateFactRefs(facts: RawFact[], allowedRefs: Set<string>): RawFact[] {
  return facts.filter((f) => {
    if (!f.refs || f.refs.length === 0) return false;
    for (const ref of f.refs) {
      if (!allowedRefs.has(ref)) {
        log.debug(`Rejected fact: ref "${ref}" not in allowed set`);
        return false;
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// L2 Update
// ---------------------------------------------------------------------------

interface L2UpdateOptions {
  language?: 'zh' | 'en';
  traceBudget?: number;
}

/**
 * Run L2 (surface summary) update using LLM fact extraction.
 */
export async function runUpdateL2(
  userId: string,
  surface: Surface,
  readL2Fn: (userId: string, surface: Surface) => Promise<string>,
  writeL2Fn: (userId: string, surface: Surface, content: string) => Promise<void>,
  readTraceFn: (userId: string, surface: Surface, limit: number) => Promise<Array<{ ts: string; kind: string; payload: unknown }>>,
  options: L2UpdateOptions = {},
): Promise<void> {
  const lang = options.language ?? 'zh';
  const traceBudget = options.traceBudget ?? TRACE_BUDGET;
  const metaStore = new MetaStore();

  try {
    // 1. Read existing L2
    const existingL2 = await readL2Fn(userId, surface);

    // 2. Read snapshot entities (raw data)
    const l2meta = await metaStore.readL2Meta(userId, surface);
    const entities = l2meta.lastUpdateAt
      ? await readChatEntitiesIncremental(userId, new Date(l2meta.lastUpdateAt))
      : await readChatEntities(userId);

    if (entities.length === 0) {
      log.debug(`L2 update: no new entities for ${userId}/${surface}`);
      return;
    }

    // Save meta NOW (before LLM) so the next incremental run picks up
    // entities created during the LLM window. Use current time as the cutoff
    // (NOT entity timestamp) to ensure we don't miss entities whose updatedAt
    // equals the cutoff time due to ensureSession touch.
    const cutoff = new Date().toISOString();
    const existingRefs = l2meta.seenEntityRefs;
    for (const e of entities) {
      const ref = `${surface}:${e.id}`;
      if (!existingRefs.includes(ref)) {
        existingRefs.push(ref);
      }
    }
    const trimmedRefs = existingRefs.slice(-200);
    await metaStore.writeL2Meta(userId, surface, {
      seenEntityRefs: trimmedRefs,
      lastUpdateAt: cutoff,
    });

    // 3. Render entities as text for chunking
    const rendered = renderTracesForConcat(entities);
    const chunks = chunkWithBoundary(rendered, CHUNK_MAX_CHARS);

    log.info(`L2 update: ${entities.length} entities → ${chunks.length} chunks for ${userId}/${surface}`);

    // Build allowed refs set
    const allowedRefs = new Set<string>();
    for (const e of entities) {
      allowedRefs.add(`${surface}:${e.id}`);
    }

    // 4. Process each chunk — accumulate into a single document
    let totalFacts = 0;
    const doc = existingL2.trim()
      ? deserializeDocument(existingL2, `${surface} Memory`)
      : { title: `${surface} Memory`, sections: [] };

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];

      // Build prompt
      const promptVars = {
        userLabel: userId,
        surface,
        sections: DEFAULT_SECTIONS_CHAT,
        focus: '用户在聊天中学习的内容、遇到的困难、表达的偏好',
        today: new Date().toISOString().split('T')[0],
        existing: existingL2.length > 2000 ? existingL2.slice(-2000) : existingL2,
        chunkIndex: ci + 1,
        chunkTotal: chunks.length,
        chunkStart: chunk.startChar,
        chunkEnd: chunk.endChar,
        chunk: chunk.text,
        allowedRefs: Array.from(allowedRefs).join(', '),
      };

      const prompt = lang === 'en'
        ? updateL2PromptEn(promptVars)
        : updateL2Prompt(promptVars);

      // Call LLM
      const raw = await consolidatorLLM({
        system: prompt.system,
        prompt: prompt.user,
        temperature: 0,
        maxTokens: 1500,
      });

      const parsed = parseFactsResponse(raw);
      if (!parsed || parsed.facts.length === 0) {
        continue;
      }

      // Validate refs
      const validFacts = validateFactRefs(parsed.facts, allowedRefs);
      if (validFacts.length === 0) {
        log.debug(`L2 chunk ${ci + 1}/${chunks.length}: all facts rejected by ref validation`);
        continue;
      }

      // 5. Build ops from facts
      const ops: Op[] = validFacts.map((f) => ({
        op: 'add' as const,
        section: f.section || 'General',
        text: f.text.slice(0, 240),
        refs: f.refs,
      }));

      // 6. Validate and apply to shared document
      for (const op of ops) {
        if (op.op === 'add') {
          (op as unknown as Record<string, unknown>).__entryId = newEntryId();
        }
      }

      const validationErrors = validateOps(ops, doc);
      if (validationErrors.length > 0) {
        log.warn(`L2 op validation failed:`, validationErrors.map(e => e.message));
        continue;
      }

      // Assign IDs and apply
      for (const op of ops) {
        if (op.op === 'add') {
          const entry: Entry = {
            id: newEntryId(),
            section: op.section,
            text: op.text,
            refs: op.refs,
          };
          addEntry(doc, entry);
        }
      }

      totalFacts += ops.length;
    }

    // 7. Write updated L2 (cap size) — serialize the shared doc
    if (totalFacts > 0) {
      let serialized = serializeDocument(doc);
      if (serialized.length > MAX_L2_PER_SURFACE) {
        serialized = serialized.slice(-MAX_L2_PER_SURFACE);
        log.info(`L2 capped to ${MAX_L2_PER_SURFACE} chars for ${userId}/${surface}`);
      }

      await writeL2Fn(userId, surface, serialized);
    }

    log.info(`L2 update complete: ${totalFacts} facts added for ${userId}/${surface}`);
  } catch (err) {
    log.error(`L2 update failed for ${userId}/${surface}:`, err);
  }
}

// ---------------------------------------------------------------------------
// L3 Update
// ---------------------------------------------------------------------------

interface L3UpdateOptions {
  language?: 'zh' | 'en';
}

/**
 * Run L3 (cross-surface synthesis) update using LLM synthesis.
 */
export async function runUpdateL3(
  userId: string,
  readL2Fn: (userId: string, surface: Surface) => Promise<string>,
  readL3Fn: (userId: string, slot: string) => Promise<string>,
  writeL3Fn: (userId: string, slot: string, content: string) => Promise<void>,
  options: L3UpdateOptions = {},
): Promise<void> {
  const lang = options.language ?? 'zh';
  const metaStore = new MetaStore();
  const l3meta = await metaStore.readL3Meta(userId);

  const l2Surfaces: Surface[] = ['chat', 'notebook', 'quiz', 'kb'];
  let newL2Entries: Entry[] = [];

  // Collect new L2 entries across all surfaces
  for (const surface of l2Surfaces) {
    const l2content = await readL2Fn(userId, surface);
    if (!l2content.trim()) continue;

    const doc = deserializeDocument(l2content, `${surface} Memory`);
    const allIds = getAllEntryIds(doc);
    const seenIds = new Set(l3meta.seenL2EntryIds[surface] ?? []);

    for (const entry of getAllEntries(doc)) {
      if (!seenIds.has(entry.id)) {
        // Tag with surface info
        const tagged: Entry = {
          ...entry,
          section: `[${surface}] ${entry.section}`,
        };
        newL2Entries.push(tagged);
      }
    }

    // Update tracking
    l3meta.seenL2EntryIds[surface] = allIds.slice(-500); // Keep recent 500
  }

  if (newL2Entries.length < 3) {
    log.debug(`L3 update: only ${newL2Entries.length} new L2 entries, skipping`);
    return;
  }

  // Render L2 entries as text for chunking
  const rendered = newL2Entries
    .map((e) => `- [${e.section}] ${e.text}`)
    .join('\n');

  const chunks = chunkWithBoundary(rendered, CHUNK_MAX_CHARS);
  log.info(`L3 update: ${newL2Entries.length} new L2 entries → ${chunks.length} chunks for ${userId}`);

  // Process each L3 slot
  for (const [slot, config] of Object.entries(L3_SLOT_CONFIG)) {
    const existingL3 = await readL3Fn(userId, slot);

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];

      const promptVars = {
        userLabel: userId,
        slot,
        slotFocus: config.focus,
        sections: config.sections,
        today: new Date().toISOString().split('T')[0],
        existing: existingL3.length > 2000 ? existingL3.slice(-2000) : existingL3,
        chunkIndex: ci + 1,
        chunkTotal: chunks.length,
        chunk: chunk.text,
        l2Surfaces: l2Surfaces.join(', '),
      };

      const prompt = updateL3Prompt(promptVars);

      const raw = await consolidatorLLM({
        system: prompt.system,
        prompt: prompt.user,
        temperature: 0,
        maxTokens: 1500,
      });

      const parsed = parseFactsResponse(raw);
      if (!parsed || parsed.facts.length === 0) continue;

      // Build ops
      const ops: Op[] = parsed.facts.map((f) => ({
        op: 'add' as const,
        section: f.section || 'General',
        text: f.text.slice(0, 240),
        refs: f.refs.filter((r) => l2Surfaces.includes(r as Surface)),
      }));

      // Apply to document
      const doc = existingL3.trim()
        ? deserializeDocument(existingL3, `L3/${slot}`)
        : { title: `L3/${slot}`, sections: [] };

      for (const op of ops) {
        if (op.op === 'add') {
          const entry: Entry = {
            id: newEntryId(),
            section: op.section,
            text: op.text,
            refs: op.refs,
          };
          addEntry(doc, entry);
        }
      }

      // Write back
      let serialized = serializeDocument(doc);
      await writeL3Fn(userId, slot, serialized);
    }
  }

  // Update L3 meta
  l3meta.lastUpdateAt = new Date().toISOString();
  await metaStore.writeL3Meta(userId, l3meta);

  log.info(`L3 update complete: ${l3meta.lastUpdateAt} for ${userId}`);
}
