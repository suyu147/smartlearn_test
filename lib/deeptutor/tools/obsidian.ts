/**
 * Obsidian Tools — 9 exclusive tools for Obsidian vault interaction.
 *
 * These tools form an exclusive tool surface (KnowledgeCapability):
 * when the obsidian capability is selected, these REPLACE the entire
 * tool set rather than augmenting it.
 *
 * Tools:
 * 1. obsidian_search    — Full-text search across vault notes
 * 2. obsidian_read      — Read a specific note by path
 * 3. obsidian_list      — List notes in a folder or the entire vault
 * 4. obsidian_backlinks — Find notes that link to a given note
 * 5. obsidian_links     — Extract outgoing links from a note
 * 6. obsidian_tags      — List and search tags across the vault
 * 7. obsidian_create_note — Create a new note with content
 * 8. obsidian_append    — Append content to an existing note
 * 9. obsidian_set_property — Set YAML frontmatter properties
 *
 * All tools operate on a local Obsidian vault directory.
 * The vault path is set via setObsidianToolContext() during bootstrap.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolResult,
  type ToolPromptHints,
  createToolResult,
  createToolParameter,
  createToolPromptHints,
} from '@/lib/deeptutor/core/tool-protocol';
import { createLogger } from '@/lib/logger';
import { promises as fs } from 'fs';
import path from 'path';

const log = createLogger('ObsidianTools');

// ---------------------------------------------------------------------------
// Vault context (set during bootstrap, overridden per-user if needed)
// ---------------------------------------------------------------------------

let _vaultPath: string | null = null;

export function setObsidianToolContext(vaultPath: string): void {
  _vaultPath = vaultPath;
  log.info(`Obsidian vault path set to: ${vaultPath}`);
}

export function getObsidianVaultPath(): string | null {
  return _vaultPath;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveVaultPath(): string {
  if (!_vaultPath) {
    throw new Error('Obsidian vault path not configured. Set DT_OBSIDIAN_VAULT or call setObsidianToolContext().');
  }
  return _vaultPath;
}

function safeVaultPath(vaultRoot: string, relativePath: string): string {
  const resolved = path.resolve(vaultRoot, relativePath);
  if (!resolved.startsWith(path.resolve(vaultRoot))) {
    throw new Error('Path traversal detected: access denied outside vault root.');
  }
  return resolved;
}

async function readMarkdownFiles(vaultRoot: string, dir: string = ''): Promise<Array<{ path: string; content: string }>> {
  const targetDir = dir ? safeVaultPath(vaultRoot, dir) : vaultRoot;
  const results: Array<{ path: string; content: string }> = [];

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(targetDir, entry.name);
      const relativePath = path.relative(vaultRoot, fullPath);

      // Skip hidden directories and .obsidian config
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        const nested = await readMarkdownFiles(vaultRoot, relativePath);
        results.push(...nested);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          results.push({ path: relativePath, content });
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch (err) {
    log.error(`Failed to read directory ${targetDir}:`, err);
  }

  return results;
}

/**
 * Non-recursive variant: reads only markdown files in the immediate directory.
 */
async function readMarkdownFilesFlat(vaultRoot: string, dir: string = ''): Promise<Array<{ path: string; content: string }>> {
  const targetDir = dir ? safeVaultPath(vaultRoot, dir) : vaultRoot;
  const results: Array<{ path: string; content: string }> = [];

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullPath = path.join(targetDir, entry.name);
        const relativePath = path.relative(vaultRoot, fullPath);
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          results.push({ path: relativePath, content });
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch (err) {
    log.error(`Failed to read directory ${targetDir}:`, err);
  }

  return results;
}

function extractFrontmatter(content: string): { properties: Record<string, unknown>; body: string } {
  const fmRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = content.match(fmRegex);

  if (!match) {
    return { properties: {}, body: content };
  }

  const fmText = match[1] ?? '';
  const body = match[2] ?? '';
  const properties: Record<string, unknown> = {};

  // Simple YAML key-value parsing (no nested structures)
  for (const line of fmText.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // Handle arrays (simple inline or block)
    if (value === '' || value === '[]') {
      value = [];
    } else if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    } else if (typeof value === 'string') {
      // Remove quotes
      value = value.replace(/^["']|["']$/g, '');
      // Parse booleans and numbers
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(Number(value)) && value !== '') value = Number(value);
    }

    if (key) properties[key] = value;
  }

  return { properties, body };
}

function extractTags(content: string): string[] {
  const tags: Set<string> = new Set();

  // Inline tags: #tag or #nested/tag
  const inlineRegex = /(?:^|\s)#([a-zA-Z\u4e00-\u9fff][\w/\u4e00-\u9fff-]*)/g;
  let match;
  while ((match = inlineRegex.exec(content)) !== null) {
    tags.add(match[1]!);
  }

  // Frontmatter tags
  const { properties } = extractFrontmatter(content);
  if (Array.isArray(properties.tags)) {
    for (const tag of properties.tags) {
      if (typeof tag === 'string') tags.add(tag.replace(/^#/, ''));
    }
  }

  return [...tags];
}

function extractLinks(content: string): string[] {
  const links: Set<string> = new Set();

  // Wiki-style links: [[target]] or [[target|alias]]
  const wikiRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = wikiRegex.exec(content)) !== null) {
    links.add(match[1]!.trim());
  }

  return [...links];
}

// ---------------------------------------------------------------------------
// 1. ObsidianSearchTool
// ---------------------------------------------------------------------------

export class ObsidianSearchTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'obsidian_search',
      description: 'Full-text search across all notes in the Obsidian vault. Returns matching notes with relevant excerpts.',
      parameters: [
        createToolParameter({ name: 'query', type: 'string', description: 'Search query (case-insensitive substring match)' }),
        createToolParameter({ name: 'folder', type: 'string', description: 'Optional folder to limit search scope', required: false, default: '' }),
        createToolParameter({ name: 'max_results', type: 'integer', description: 'Maximum number of results (default: 10)', required: false, default: 10 }),
      ],
    };
  }

  override getPromptHints(): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Search vault notes by text',
      whenToUse: 'When the user asks about notes, concepts, or information that might be in their Obsidian vault',
      inputFormat: 'query: search text, folder: optional scope limit',
      guideline: 'Use broad search terms first, then narrow down. Results include file paths and matching excerpts.',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const vaultRoot = resolveVaultPath();
      const query = (kwargs.query as string).toLowerCase();
      const folder = (kwargs.folder as string) || '';
      const maxResults = (kwargs.max_results as number) || 10;

      const files = await readMarkdownFiles(vaultRoot, folder);
      const matches: Array<{ path: string; excerpt: string; score: number }> = [];

      for (const file of files) {
        const lowerContent = file.content.toLowerCase();
        const idx = lowerContent.indexOf(query);
        if (idx === -1) continue;

        // Extract excerpt around match
        const start = Math.max(0, idx - 100);
        const end = Math.min(file.content.length, idx + query.length + 200);
        const excerpt = (start > 0 ? '...' : '') + file.content.slice(start, end) + (end < file.content.length ? '...' : '');

        // Simple scoring: count occurrences
        let count = 0;
        let pos = 0;
        while ((pos = lowerContent.indexOf(query, pos)) !== -1) {
          count++;
          pos += query.length;
        }

        matches.push({ path: file.path, excerpt, score: count });
      }

      // Sort by score descending
      matches.sort((a, b) => b.score - a.score);
      const top = matches.slice(0, maxResults);

      if (top.length === 0) {
        return createToolResult({ content: `No notes found matching "${query}" in the vault.` });
      }

      const output = top.map((m, i) =>
        `### ${i + 1}. ${m.path} (${m.score} matches)\n${m.excerpt}`
      ).join('\n\n---\n\n');

      return createToolResult({
        content: `Found ${matches.length} matching note(s):\n\n${output}`,
        metadata: { matchCount: matches.length, results: top.map((m) => m.path) },
      });
    } catch (err) {
      return createToolResult({
        content: `Error searching vault: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. ObsidianReadTool
// ---------------------------------------------------------------------------

export class ObsidianReadTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'obsidian_read',
      description: 'Read the full content of a specific note by its vault-relative path.',
      parameters: [
        createToolParameter({ name: 'path', type: 'string', description: 'Vault-relative path to the note (e.g., "Daily/2026-01-15.md")' }),
      ],
    };
  }

  override getPromptHints(): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Read a specific vault note',
      whenToUse: 'When you need the full content of a note whose path you already know',
      inputFormat: 'path: vault-relative file path with .md extension',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const vaultRoot = resolveVaultPath();
      const notePath = safeVaultPath(vaultRoot, kwargs.path as string);

      const content = await fs.readFile(notePath, 'utf-8');
      return createToolResult({
        content: `# ${kwargs.path}\n\n${content}`,
        metadata: { path: kwargs.path, charCount: content.length },
      });
    } catch (err) {
      return createToolResult({
        content: `Error reading note: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 3. ObsidianListTool
// ---------------------------------------------------------------------------

export class ObsidianListTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'obsidian_list',
      description: 'List notes in the vault or a specific folder. Returns file paths and sizes.',
      parameters: [
        createToolParameter({ name: 'folder', type: 'string', description: 'Optional folder to list (default: vault root)', required: false, default: '' }),
        createToolParameter({ name: 'recursive', type: 'boolean', description: 'Whether to list recursively (default: true)', required: false, default: true }),
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const vaultRoot = resolveVaultPath();
      const folder = (kwargs.folder as string) || '';
      const recursive = kwargs.recursive !== false;

      const files = recursive
        ? await readMarkdownFiles(vaultRoot, folder)
        : await readMarkdownFilesFlat(vaultRoot, folder);

      if (files.length === 0) {
        return createToolResult({ content: `No notes found${folder ? ` in folder "${folder}"` : ' in vault'}.` });
      }

      const listing = files
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((f) => `- ${f.path} (${f.content.length} chars)`)
        .join('\n');

      return createToolResult({
        content: `Found ${files.length} note(s):\n\n${listing}`,
        metadata: { count: files.length, paths: files.map((f) => f.path) },
      });
    } catch (err) {
      return createToolResult({
        content: `Error listing notes: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 4. ObsidianBacklinksTool
// ---------------------------------------------------------------------------

export class ObsidianBacklinksTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'obsidian_backlinks',
      description: 'Find all notes that link TO a given note (incoming links / backlinks).',
      parameters: [
        createToolParameter({ name: 'target', type: 'string', description: 'The note name or path to find backlinks for (e.g., "My Note" or "folder/note.md")' }),
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const vaultRoot = resolveVaultPath();
      const target = kwargs.target as string;
      const targetBase = path.basename(target, '.md');

      const files = await readMarkdownFiles(vaultRoot);
      const backlinks: Array<{ path: string; context: string }> = [];

      for (const file of files) {
        const links = extractLinks(file.content);
        for (const link of links) {
          const linkBase = path.basename(link, '.md');
          if (linkBase === targetBase || link === target) {
            // Find the line containing the link
            const lines = file.content.split('\n');
            const linkLine = lines.find((l) => l.includes(`[[${link}`)) ?? '';
            backlinks.push({ path: file.path, context: linkLine.trim() });
            break;
          }
        }
      }

      if (backlinks.length === 0) {
        return createToolResult({ content: `No backlinks found for "${target}".` });
      }

      const output = backlinks
        .map((b) => `- **${b.path}**: ${b.context}`)
        .join('\n');

      return createToolResult({
        content: `Found ${backlinks.length} backlink(s) to "${target}":\n\n${output}`,
        metadata: { count: backlinks.length, sources: backlinks.map((b) => b.path) },
      });
    } catch (err) {
      return createToolResult({
        content: `Error finding backlinks: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 5. ObsidianLinksTool
// ---------------------------------------------------------------------------

export class ObsidianLinksTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'obsidian_links',
      description: 'Extract all outgoing wiki-style links FROM a specific note.',
      parameters: [
        createToolParameter({ name: 'path', type: 'string', description: 'Vault-relative path to the note' }),
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const vaultRoot = resolveVaultPath();
      const notePath = safeVaultPath(vaultRoot, kwargs.path as string);

      const content = await fs.readFile(notePath, 'utf-8');
      const links = extractLinks(content);

      if (links.length === 0) {
        return createToolResult({ content: `No outgoing links found in "${kwargs.path}".` });
      }

      const output = links.map((l) => `- [[${l}]]`).join('\n');

      return createToolResult({
        content: `Found ${links.length} outgoing link(s) in "${kwargs.path}":\n\n${output}`,
        metadata: { count: links.length, links },
      });
    } catch (err) {
      return createToolResult({
        content: `Error extracting links: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 6. ObsidianTagsTool
// ---------------------------------------------------------------------------

export class ObsidianTagsTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'obsidian_tags',
      description: 'List all tags in the vault or find notes with specific tags.',
      parameters: [
        createToolParameter({ name: 'tag', type: 'string', description: 'Optional: filter by specific tag (without #)', required: false, default: '' }),
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const vaultRoot = resolveVaultPath();
      const filterTag = (kwargs.tag as string) || '';

      const files = await readMarkdownFiles(vaultRoot);
      const tagMap = new Map<string, string[]>();

      for (const file of files) {
        const tags = extractTags(file.content);
        for (const tag of tags) {
          const existing = tagMap.get(tag) ?? [];
          existing.push(file.path);
          tagMap.set(tag, existing);
        }
      }

      if (filterTag) {
        const normalizedFilter = filterTag.replace(/^#/, '');
        const matchingFiles = tagMap.get(normalizedFilter) ?? [];

        if (matchingFiles.length === 0) {
          return createToolResult({ content: `No notes found with tag "#${normalizedFilter}".` });
        }

        const output = matchingFiles.map((f) => `- ${f}`).join('\n');
        return createToolResult({
          content: `Found ${matchingFiles.length} note(s) with tag "#${normalizedFilter}":\n\n${output}`,
          metadata: { tag: normalizedFilter, count: matchingFiles.length },
        });
      }

      // List all tags sorted by count
      const sortedTags = [...tagMap.entries()].sort((a, b) => b[1].length - a[1].length);

      if (sortedTags.length === 0) {
        return createToolResult({ content: 'No tags found in the vault.' });
      }

      const output = sortedTags
        .map(([tag, files]) => `- #${tag} (${files.length} notes)`)
        .join('\n');

      return createToolResult({
        content: `Found ${sortedTags.length} unique tag(s):\n\n${output}`,
        metadata: { totalTags: sortedTags.length },
      });
    } catch (err) {
      return createToolResult({
        content: `Error listing tags: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 7. ObsidianCreateNoteTool
// ---------------------------------------------------------------------------

export class ObsidianCreateNoteTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'obsidian_create_note',
      description: 'Create a new note in the Obsidian vault with optional YAML frontmatter and content.',
      parameters: [
        createToolParameter({ name: 'path', type: 'string', description: 'Vault-relative path for the new note (e.g., "Inbox/new-idea.md")' }),
        createToolParameter({ name: 'content', type: 'string', description: 'The markdown content of the note' }),
        createToolParameter({ name: 'properties', type: 'object', description: 'Optional YAML frontmatter properties as JSON object', required: false, default: null }),
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const vaultRoot = resolveVaultPath();
      const notePath = safeVaultPath(vaultRoot, kwargs.path as string);
      const content = kwargs.content as string;
      const properties = kwargs.properties as Record<string, unknown> | null;

      // Build file content with optional frontmatter
      let fileContent = '';
      if (properties && Object.keys(properties).length > 0) {
        fileContent += '---\n';
        for (const [key, value] of Object.entries(properties)) {
          if (Array.isArray(value)) {
            fileContent += `${key}: [${value.map((v) => `"${v}"`).join(', ')}]\n`;
          } else {
            fileContent += `${key}: ${JSON.stringify(value)}\n`;
          }
        }
        fileContent += '---\n\n';
      }
      fileContent += content;

      // Ensure parent directory exists
      const dir = path.dirname(notePath);
      await fs.mkdir(dir, { recursive: true });

      // Check if file already exists
      try {
        await fs.access(notePath);
        return createToolResult({
          content: `Note "${kwargs.path}" already exists. Use obsidian_append to add content, or choose a different path.`,
          success: false,
        });
      } catch {
        // File doesn't exist, good — proceed
      }

      await fs.writeFile(notePath, fileContent, 'utf-8');

      return createToolResult({
        content: `Created note "${kwargs.path}" (${fileContent.length} chars).`,
        metadata: { path: kwargs.path, charCount: fileContent.length },
      });
    } catch (err) {
      return createToolResult({
        content: `Error creating note: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 8. ObsidianAppendTool
// ---------------------------------------------------------------------------

export class ObsidianAppendTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'obsidian_append',
      description: 'Append content to an existing note. Adds content at the end of the file.',
      parameters: [
        createToolParameter({ name: 'path', type: 'string', description: 'Vault-relative path to the note' }),
        createToolParameter({ name: 'content', type: 'string', description: 'Content to append' }),
        createToolParameter({ name: 'separator', type: 'string', description: 'Separator before appended content (default: "\\n\\n")', required: false, default: '\n\n' }),
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const vaultRoot = resolveVaultPath();
      const notePath = safeVaultPath(vaultRoot, kwargs.path as string);
      const content = kwargs.content as string;
      const separator = (kwargs.separator as string) || '\n\n';

      const existing = await fs.readFile(notePath, 'utf-8');
      const updated = existing + separator + content;

      await fs.writeFile(notePath, updated, 'utf-8');

      return createToolResult({
        content: `Appended ${content.length} chars to "${kwargs.path}".`,
        metadata: { path: kwargs.path, totalChars: updated.length },
      });
    } catch (err) {
      return createToolResult({
        content: `Error appending to note: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 9. ObsidianSetPropertyTool
// ---------------------------------------------------------------------------

export class ObsidianSetPropertyTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'obsidian_set_property',
      description: 'Set or update YAML frontmatter properties on a note. Creates frontmatter if none exists.',
      parameters: [
        createToolParameter({ name: 'path', type: 'string', description: 'Vault-relative path to the note' }),
        createToolParameter({ name: 'key', type: 'string', description: 'Property key to set' }),
        createToolParameter({ name: 'value', type: 'string', description: 'Property value (string, number, boolean, or JSON array)' }),
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    try {
      const vaultRoot = resolveVaultPath();
      const notePath = safeVaultPath(vaultRoot, kwargs.path as string);
      const key = kwargs.key as string;
      const rawValue = kwargs.value as string;

      const content = await fs.readFile(notePath, 'utf-8');
      const { properties, body } = extractFrontmatter(content);

      // Parse value
      let parsedValue: unknown = rawValue;
      try {
        parsedValue = JSON.parse(rawValue);
      } catch {
        // Keep as string
      }
      properties[key] = parsedValue;

      // Rebuild frontmatter
      let fmText = '---\n';
      for (const [k, v] of Object.entries(properties)) {
        if (Array.isArray(v)) {
          fmText += `${k}: [${v.map((item) => `"${item}"`).join(', ')}]\n`;
        } else if (typeof v === 'string') {
          fmText += `${k}: "${v}"\n`;
        } else {
          fmText += `${k}: ${v}\n`;
        }
      }
      fmText += '---\n';

      const updated = fmText + body;
      await fs.writeFile(notePath, updated, 'utf-8');

      return createToolResult({
        content: `Set property "${key}" on "${kwargs.path}".`,
        metadata: { path: kwargs.path, key, value: parsedValue },
      });
    } catch (err) {
      return createToolResult({
        content: `Error setting property: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// All 9 obsidian tools factory
// ---------------------------------------------------------------------------

export function createObsidianTools(): BaseTool[] {
  return [
    new ObsidianSearchTool(),
    new ObsidianReadTool(),
    new ObsidianListTool(),
    new ObsidianBacklinksTool(),
    new ObsidianLinksTool(),
    new ObsidianTagsTool(),
    new ObsidianCreateNoteTool(),
    new ObsidianAppendTool(),
    new ObsidianSetPropertyTool(),
  ];
}
