/**
 * ReadSourceTool — Read full content of an attached source by ID
 *
 * When sources are attached to a session (documents, notebooks, etc.),
 * a manifest with source IDs and previews is injected into the system prompt.
 * The LLM can then call this tool to read the full content of any source.
 *
 * Source ID prefixes:
 * - at- : document attachment
 * - nb- : notebook
 * - bk- : book
 *
 * The source_index (a map of ID → full text) is injected per-turn
 * via setSourceIndex().
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

const log = createLogger('ReadSourceTool');

// ---------------------------------------------------------------------------
// Turn-scoped source index (injected by the chat pipeline per turn)
// ---------------------------------------------------------------------------

let _sourceIndex: Map<string, SourceEntry> = new Map();

export interface SourceEntry {
  /** Source ID (e.g., "at-abc123") */
  id: string;
  /** Display name */
  name: string;
  /** Source kind (attachment, notebook, book) */
  kind: string;
  /** Full text content */
  content: string;
  /** Size in characters */
  charCount: number;
}

/**
 * Set the source index for the current turn.
 * Called by the chat pipeline before executing a turn.
 */
export function setSourceIndex(entries: SourceEntry[]): void {
  _sourceIndex = new Map(entries.map((e) => [e.id, e]));
}

/**
 * Get the current source index.
 */
export function getSourceIndex(): Map<string, SourceEntry> {
  return _sourceIndex;
}

/**
 * Build a source manifest text for injection into the system prompt.
 * Returns (manifestText, sourceEntries) tuple.
 */
export function buildSourceManifest(
  sources: Array<{ id: string; name: string; kind: string; content: string }>,
  maxPreviewChars: number = 2000,
): { manifest: string; entries: SourceEntry[] } {
  if (sources.length === 0) {
    return { manifest: '', entries: [] };
  }

  const entries: SourceEntry[] = [];
  const lines: string[] = [
    '[Attached Sources]',
    'The following sources are attached to this conversation. Use the read_source tool with the source ID to read full content.',
    '',
  ];

  for (const source of sources) {
    const charCount = source.content.length;
    const preview = source.content.slice(0, maxPreviewChars);
    const truncated = charCount > maxPreviewChars ? ` [... ${charCount} chars total]` : '';

    entries.push({
      id: source.id,
      name: source.name,
      kind: source.kind,
      content: source.content,
      charCount,
    });

    lines.push(`- [${source.id}] ${source.name} (${source.kind}, ${charCount} chars)`);
    lines.push(`  Preview: ${preview}${truncated}`);
    lines.push('');
  }

  lines.push('[End Attached Sources]');

  return { manifest: lines.join('\n'), entries };
}

// ---------------------------------------------------------------------------
// ReadSourceTool
// ---------------------------------------------------------------------------

export class ReadSourceTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'read_source',
      description: 'Read the full content of an attached source by its ID. Source IDs start with "at-" (attachment), "nb-" (notebook), or "bk-" (book).',
      parameters: [
        createToolParameter({
          name: 'source_id',
          type: 'string',
          description: 'The source ID to read. Begins with at- (attachment), nb- (notebook), or bk- (book).',
          required: true,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Read full content of an attached source by ID.',
      whenToUse: 'When you need to read the complete content of a document, notebook, or book that was shown as a preview in the attached sources manifest.',
      inputFormat: 'source_id: the ID from the [Attached Sources] manifest (e.g., "at-abc123")',
      guideline: 'Only call this when you need the full content. The preview in the system prompt may already contain enough information.',
      phase: 'retrieval',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const sourceId = kwargs.source_id as string;

    if (!sourceId || sourceId.trim().length === 0) {
      return createToolResult({
        content: 'Error: source_id parameter is required.',
        success: false,
      });
    }

    const entry = _sourceIndex.get(sourceId);

    if (!entry) {
      const available = Array.from(_sourceIndex.keys());
      return createToolResult({
        content: `Source "${sourceId}" not found. Available sources: ${available.length > 0 ? available.join(', ') : '(none)'}`,
        success: false,
        metadata: { source_id: sourceId, available_ids: available },
      });
    }

    log.info(`Reading source: ${sourceId} (${entry.name}, ${entry.charCount} chars)`);

    return createToolResult({
      content: entry.content,
      metadata: {
        source_id: sourceId,
        name: entry.name,
        kind: entry.kind,
        char_count: entry.charCount,
      },
    });
  }
}
