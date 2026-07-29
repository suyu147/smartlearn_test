/**
 * PersonaService — Agent persona/soul management
 *
 * Manages persona definitions that shape the AI assistant's behavior.
 * Each persona is a markdown file with YAML frontmatter (name, description)
 * and a body containing the system prompt text.
 *
 * Storage layout:
 *   data/personas/
 *     index.json              — persona list
 *     {personaId}.md          — per-persona content
 *
 * Phase 3a
 */

import { createLogger } from '@/lib/logger';
import { getDataDir } from '@/lib/paths';
import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';

const log = createLogger('PersonaService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Persona {
  id: string;
  name: string;
  description: string;
  tags: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaDetail extends Persona {
  systemPrompt: string;  // The full soul/system prompt text
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERSONA_BASE_DIR = getDataDir('personas');

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateId(): string {
  return `persona_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

/**
 * Parse simple YAML-like frontmatter from a markdown string.
 * Expects the format:
 *   ---
 *   key: value
 *   key: [a, b, c]
 *   ---
 *   (body)
 *
 * Returns the parsed metadata object and the body text.
 */
function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const meta: Record<string, unknown> = {};
  let body = '';

  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    // No frontmatter — entire content is the body
    return { meta, body: content };
  }

  // Find the closing ---
  const secondDelim = trimmed.indexOf('---', 3);
  if (secondDelim === -1) {
    return { meta, body: content };
  }

  const fmBlock = trimmed.slice(3, secondDelim).trim();
  body = trimmed.slice(secondDelim + 3).trim();

  // Parse each line
  for (const line of fmBlock.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const colonIdx = trimmedLine.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmedLine.slice(0, colonIdx).trim();
    let value: unknown = trimmedLine.slice(colonIdx + 1).trim();

    // Parse array values: [a, b, c]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (inner === '') {
        value = [];
      } else {
        value = inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
      }
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    }

    meta[key] = value;
  }

  return { meta, body };
}

/**
 * Serialize a Persona's metadata + system prompt into frontmatter markdown.
 */
function serializeFrontmatter(persona: Persona, systemPrompt: string): string {
  const tagsStr = '[' + persona.tags.join(', ') + ']';
  return [
    '---',
    `name: ${persona.name}`,
    `description: ${persona.description}`,
    `tags: ${tagsStr}`,
    `isDefault: ${persona.isDefault}`,
    `createdAt: ${persona.createdAt}`,
    `updatedAt: ${persona.updatedAt}`,
    '---',
    '',
    systemPrompt,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// PersonaServiceImpl
// ---------------------------------------------------------------------------

export class PersonaServiceImpl {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? PERSONA_BASE_DIR;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * List all personas, sorted by updatedAt descending.
   */
  async listPersonas(): Promise<Persona[]> {
    try {
      const index = await this.readIndex();
      return index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch (err) {
      log.error('Failed to list personas:', err);
      return [];
    }
  }

  /**
   * Get a single persona with its full system prompt.
   * Returns null if not found.
   */
  async getPersona(id: string): Promise<PersonaDetail | null> {
    try {
      const filePath = join(this.baseDir, `${id}.md`);
      const content = await readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(content);

      const index = await this.readIndex();
      const entry = index.find((p) => p.id === id);
      if (!entry) {
        log.warn(`Persona file exists but not in index: ${id}`);
        return null;
      }

      return {
        ...entry,
        systemPrompt: body,
        // Merge any metadata overrides (keep index as source of truth for structured fields)
        name: (meta.name as string) ?? entry.name,
        description: (meta.description as string) ?? entry.description,
      };
    } catch (err) {
      log.error(`Failed to get persona ${id}:`, err);
      return null;
    }
  }

  /**
   * Create a new persona. Writes the .md file and updates the index.
   */
  async createPersona(
    name: string,
    description: string,
    systemPrompt: string,
    tags?: string[],
  ): Promise<Persona> {
    const now = new Date().toISOString();
    const persona: Persona = {
      id: generateId(),
      name,
      description,
      tags: tags ?? [],
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Ensure directory exists
      await mkdir(this.baseDir, { recursive: true });

      // Write the persona .md file
      const mdContent = serializeFrontmatter(persona, systemPrompt);
      await writeFile(join(this.baseDir, `${persona.id}.md`), mdContent, 'utf-8');

      // Update index
      const index = await this.readIndex();
      index.push(persona);
      await this.writeIndex(index);

      log.info(`Created persona "${name}" (${persona.id})`);
      return persona;
    } catch (err) {
      log.error(`Failed to create persona "${name}":`, err);
      throw err;
    }
  }

  /**
   * Update an existing persona. Only provided fields are changed.
   * Returns null if the persona was not found.
   */
  async updatePersona(
    id: string,
    updates: Partial<{ name: string; description: string; systemPrompt: string; tags: string[] }>,
  ): Promise<Persona | null> {
    try {
      const index = await this.readIndex();
      const idx = index.findIndex((p) => p.id === id);
      if (idx === -1) {
        log.warn(`Persona not found for update: ${id}`);
        return null;
      }

      const existing = index[idx];

      // Read existing file to get current system prompt
      let currentPrompt = '';
      try {
        const filePath = join(this.baseDir, `${id}.md`);
        const content = await readFile(filePath, 'utf-8');
        const { body } = parseFrontmatter(content);
        currentPrompt = body;
      } catch {
        log.warn(`Persona file missing for ${id}, will recreate`);
      }

      // Apply updates
      const updated: Persona = {
        ...existing,
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        tags: updates.tags ?? existing.tags,
        updatedAt: new Date().toISOString(),
      };

      const finalPrompt = updates.systemPrompt ?? currentPrompt;

      // Write updated .md file
      const mdContent = serializeFrontmatter(updated, finalPrompt);
      await writeFile(join(this.baseDir, `${id}.md`), mdContent, 'utf-8');

      // Update index
      index[idx] = updated;
      await this.writeIndex(index);

      log.info(`Updated persona "${updated.name}" (${id})`);
      return updated;
    } catch (err) {
      log.error(`Failed to update persona ${id}:`, err);
      return null;
    }
  }

  /**
   * Delete a persona. Removes the .md file and updates the index.
   * Returns true if deleted, false if not found.
   */
  async deletePersona(id: string): Promise<boolean> {
    try {
      const index = await this.readIndex();
      const filtered = index.filter((p) => p.id !== id);
      if (filtered.length === index.length) {
        log.warn(`Persona not found for deletion: ${id}`);
        return false;
      }

      // Delete the .md file
      try {
        await unlink(join(this.baseDir, `${id}.md`));
      } catch {
        log.warn(`Persona file already missing for ${id}`);
      }

      // Update index
      await this.writeIndex(filtered);

      log.info(`Deleted persona ${id}`);
      return true;
    } catch (err) {
      log.error(`Failed to delete persona ${id}:`, err);
      return false;
    }
  }

  /**
   * Get the default persona (the one with isDefault=true).
   * Returns null if no default is set.
   */
  async getDefaultPersona(): Promise<PersonaDetail | null> {
    try {
      const index = await this.readIndex();
      const defaultEntry = index.find((p) => p.isDefault);
      if (!defaultEntry) {
        log.debug('No default persona configured');
        return null;
      }
      return this.getPersona(defaultEntry.id);
    } catch (err) {
      log.error('Failed to get default persona:', err);
      return null;
    }
  }

  /**
   * Build the system prompt text for injection into capability context.
   * If personaId is provided, use that persona's prompt.
   * Otherwise, fall back to the default persona.
   * Returns an empty string if no persona is available.
   */
  async buildPersonaPrompt(personaId?: string): Promise<string> {
    try {
      let detail: PersonaDetail | null = null;

      if (personaId) {
        detail = await this.getPersona(personaId);
        if (!detail) {
          log.warn(`Requested persona ${personaId} not found, falling back to default`);
        }
      }

      if (!detail) {
        detail = await this.getDefaultPersona();
      }

      if (!detail) {
        log.debug('No persona available for prompt injection');
        return '';
      }

      return detail.systemPrompt;
    } catch (err) {
      log.error('Failed to build persona prompt:', err);
      return '';
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async readIndex(): Promise<Persona[]> {
    try {
      const content = await readFile(join(this.baseDir, 'index.json'), 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async writeIndex(index: Persona[]): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(
      join(this.baseDir, 'index.json'),
      JSON.stringify(index, null, 2),
      'utf-8',
    );
  }
}

// ---------------------------------------------------------------------------
// Backward-compat interface
// ---------------------------------------------------------------------------

export interface PersonaService {
  list(): Promise<Record<string, unknown>[]>;
  get(personaId: string): Promise<Record<string, unknown> | null>;
}
