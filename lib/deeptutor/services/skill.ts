/**
 * SkillService — User skill management
 *
 * Skills are markdown files (SKILL.md) with YAML frontmatter that
 * provide specialized instructions injected into the AI's system prompt.
 *
 * Storage layout:
 *   data/skills/
 *     {skillName}/
 *       SKILL.md               — frontmatter + body
 *
 * Phase 3a
 */

import { createLogger } from '@/lib/logger';
import { getDataDir } from '@/lib/paths';
import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  rm,
} from 'fs/promises';
import { join } from 'path';

const log = createLogger('SkillService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillMeta {
  name: string;
  description: string;
  triggers: string[];      // Keywords that activate this skill
  tags: string[];
  always: boolean;         // If true, auto-loaded into every context
}

export interface SkillDetail extends SkillMeta {
  body: string;            // The markdown content after frontmatter
  filePath: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  tags: string[];
  always: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_DIR = getDataDir('skills');
const SKILL_FILE = 'SKILL.md';
const DEFAULT_TOP_K = 3;
const TRIGGER_MATCH_SCORE = 3;
const DESCRIPTION_WORD_MATCH_SCORE = 1;
const MIN_DESC_WORD_LENGTH = 4; // only description words with length > 3 count for scoring

// ---------------------------------------------------------------------------
// SkillServiceImpl
// ---------------------------------------------------------------------------

export class SkillServiceImpl {

  // -------------------------------------------------------------------------
  // listSkills — scan data/skills/ dirs, read each SKILL.md frontmatter
  // -------------------------------------------------------------------------

  async listSkills(): Promise<SkillSummary[]> {
    try {
      await this.ensureBaseDir();
      const entries = await readdir(BASE_DIR, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      const summaries: SkillSummary[] = [];

      for (const dirName of dirs) {
        try {
          const filePath = join(BASE_DIR, dirName, SKILL_FILE);
          const content = await readFile(filePath, 'utf-8');
          const meta = parseFrontmatter(content);

          summaries.push({
            name: meta.name || dirName,
            description: meta.description,
            tags: meta.tags,
            always: meta.always,
          });
        } catch (err) {
          log.warn(`Failed to read skill "${dirName}":`, err);
        }
      }

      return summaries;
    } catch (err) {
      log.error('Failed to list skills:', err);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // getSkill — read full SKILL.md content
  // -------------------------------------------------------------------------

  async getSkill(name: string): Promise<SkillDetail | null> {
    try {
      const filePath = join(BASE_DIR, name, SKILL_FILE);
      const content = await readFile(filePath, 'utf-8');
      const { meta, body } = parseSkillFile(content);

      return {
        ...meta,
        name: meta.name || name,
        body,
        filePath,
      };
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      log.error(`Failed to get skill "${name}":`, err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // createSkill — create dir + SKILL.md
  // -------------------------------------------------------------------------

  async createSkill(name: string, meta: SkillMeta, body: string): Promise<SkillDetail> {
    try {
      const skillDir = join(BASE_DIR, name);
      const filePath = join(skillDir, SKILL_FILE);

      await mkdir(skillDir, { recursive: true });

      const content = buildSkillFile({ ...meta, name }, body);
      await writeFile(filePath, content, 'utf-8');

      log.info(`Created skill: ${name}`);

      return {
        ...meta,
        name,
        body,
        filePath,
      };
    } catch (err) {
      log.error(`Failed to create skill "${name}":`, err);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // updateSkill — update meta and/or body
  // -------------------------------------------------------------------------

  async updateSkill(
    name: string,
    meta?: Partial<SkillMeta>,
    body?: string,
  ): Promise<SkillDetail | null> {
    try {
      const existing = await this.getSkill(name);
      if (!existing) {
        return null;
      }

      const updatedMeta: SkillMeta = {
        name: existing.name,
        description: existing.description,
        triggers: existing.triggers,
        tags: existing.tags,
        always: existing.always,
        ...meta,
      };

      const updatedBody = body !== undefined ? body : existing.body;
      const filePath = existing.filePath;

      const content = buildSkillFile(updatedMeta, updatedBody);
      await writeFile(filePath, content, 'utf-8');

      log.info(`Updated skill: ${name}`);

      return {
        ...updatedMeta,
        body: updatedBody,
        filePath,
      };
    } catch (err) {
      log.error(`Failed to update skill "${name}":`, err);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // deleteSkill — remove dir + file
  // -------------------------------------------------------------------------

  async deleteSkill(name: string): Promise<boolean> {
    try {
      const skillDir = join(BASE_DIR, name);

      await rm(skillDir, { recursive: true, force: true });

      log.info(`Deleted skill: ${name}`);
      return true;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      log.error(`Failed to delete skill "${name}":`, err);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // loadForContext — load multiple skills, strip frontmatter, join bodies
  // -------------------------------------------------------------------------

  async loadForContext(names: string[]): Promise<string> {
    try {
      const sections: string[] = [];

      for (const name of names) {
        const skill = await this.getSkill(name);
        if (skill && skill.body.trim().length > 0) {
          sections.push(`### ${skill.name}\n${skill.body.trim()}`);
        }
      }

      if (sections.length === 0) {
        return '';
      }

      return `## Active Skills\n\n${sections.join('\n\n')}`;
    } catch (err) {
      log.error('Failed to load skills for context:', err);
      return '';
    }
  }

  // -------------------------------------------------------------------------
  // autoSelect — keyword scoring, return top K skill names
  // -------------------------------------------------------------------------

  async autoSelect(userMessage: string, topK: number = DEFAULT_TOP_K): Promise<string[]> {
    try {
      const summaries = await this.listSkills();
      const messageLower = userMessage.toLowerCase();

      const scored: Array<{ name: string; score: number }> = [];

      for (const summary of summaries) {
        let score = 0;

        // Load full skill to get triggers
        const skill = await this.getSkill(summary.name);
        if (!skill) continue;

        // Trigger match: +3 per trigger found in user message
        for (const trigger of skill.triggers) {
          if (messageLower.includes(trigger.toLowerCase())) {
            score += TRIGGER_MATCH_SCORE;
          }
        }

        // Description word overlap: +1 per matching word (length > 3)
        const descWords = skill.description.split(/\s+/);
        for (const word of descWords) {
          if (word.length >= MIN_DESC_WORD_LENGTH && messageLower.includes(word.toLowerCase())) {
            score += DESCRIPTION_WORD_MATCH_SCORE;
          }
        }

        if (score > 0) {
          scored.push({ name: summary.name, score });
        }
      }

      // Sort by score descending, take top K
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK).map((s) => s.name);
    } catch (err) {
      log.error('Failed to auto-select skills:', err);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // buildSkillsSummary — lightweight list for system prompt injection
  // -------------------------------------------------------------------------

  async buildSkillsSummary(): Promise<SkillSummary[]> {
    try {
      return this.listSkills();
    } catch (err) {
      log.error('Failed to build skills summary:', err);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // listTags — collect all unique tags across skills
  // -------------------------------------------------------------------------

  async listTags(): Promise<string[]> {
    try {
      const summaries = await this.listSkills();
      const tagSet = new Set<string>();

      for (const summary of summaries) {
        for (const tag of summary.tags) {
          tagSet.add(tag);
        }
      }

      return Array.from(tagSet).sort();
    } catch (err) {
      log.error('Failed to list tags:', err);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // getAlwaysSkills — skills with always=true
  // -------------------------------------------------------------------------

  async getAlwaysSkills(): Promise<SkillDetail[]> {
    try {
      const summaries = await this.listSkills();
      const alwaysSkills: SkillDetail[] = [];

      for (const summary of summaries) {
        if (summary.always) {
          const detail = await this.getSkill(summary.name);
          if (detail) {
            alwaysSkills.push(detail);
          }
        }
      }

      return alwaysSkills;
    } catch (err) {
      log.error('Failed to get always-active skills:', err);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async ensureBaseDir(): Promise<void> {
    await mkdir(BASE_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Frontmatter parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * Returns only the metadata (no body).
 */
function parseFrontmatter(content: string): SkillMeta {
  const { meta } = parseSkillFile(content);
  return meta;
}

/**
 * Parse a full SKILL.md file into metadata + body.
 *
 * Format:
 *   ---
 *   name: skill-name
 *   description: ...
 *   triggers: [a, b, c]
 *   tags: [x, y]
 *   always: false
 *   ---
 *
 *   Body content here...
 */
function parseSkillFile(content: string): { meta: SkillMeta; body: string } {
  const defaults: SkillMeta = {
    name: '',
    description: '',
    triggers: [],
    tags: [],
    always: false,
  };

  // Find the frontmatter block between the first pair of ---
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    return { meta: defaults, body: content };
  }

  const afterFirst = trimmed.slice(3);
  const secondDash = afterFirst.indexOf('---');

  if (secondDash === -1) {
    return { meta: defaults, body: content };
  }

  const frontmatterBlock = afterFirst.slice(0, secondDash);
  const body = afterFirst.slice(secondDash + 3).trim();

  // Parse key: value lines
  const meta: SkillMeta = { ...defaults };

  const lines = frontmatterBlock.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'name':
        meta.name = value;
        break;
      case 'description':
        meta.description = value;
        break;
      case 'triggers':
        meta.triggers = parseYamlArray(value);
        break;
      case 'tags':
        meta.tags = parseYamlArray(value);
        break;
      case 'always':
        meta.always = value.toLowerCase() === 'true';
        break;
    }
  }

  return { meta, body };
}

/**
 * Parse a YAML inline array: [item1, item2, item3]
 */
function parseYamlArray(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '[]') return [];

  // Remove brackets
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    return inner
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter((s) => s.length > 0);
  }

  // Fallback: treat as single item
  return [trimmed.replace(/^['"]|['"]$/g, '')];
}

/**
 * Build a SKILL.md file string from metadata + body.
 */
function buildSkillFile(meta: SkillMeta, body: string): string {
  const triggersStr = formatYamlArray(meta.triggers);
  const tagsStr = formatYamlArray(meta.tags);

  const frontmatter = [
    '---',
    `name: ${meta.name}`,
    `description: ${meta.description}`,
    `triggers: ${triggersStr}`,
    `tags: ${tagsStr}`,
    `always: ${meta.always}`,
    '---',
  ].join('\n');

  return `${frontmatter}\n\n${body.trim()}\n`;
}

/**
 * Format a string array as a YAML inline array: [a, b, c]
 */
function formatYamlArray(items: string[]): string {
  if (!items || items.length === 0) return '[]';
  return `[${items.join(', ')}]`;
}

// ---------------------------------------------------------------------------
// Backward-compat interface (kept for existing imports)
// ---------------------------------------------------------------------------

export interface SkillService {
  list(): Promise<Record<string, unknown>[]>;
  get(skillId: string): Promise<Record<string, unknown> | null>;
}
