/**
 * WriteNoteTool — Write a note to a notebook
 *
 * Saves important findings, analysis results, or observations
 * to the user's notebooks for later reference.
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
import type { NotebookServiceImpl } from '@/lib/deeptutor/services/notebook';
import { getCurrentUserId } from '@/lib/deeptutor/context/tool-context';

let _notebookService: NotebookServiceImpl | null = null;

export function setWriteNoteContext(nb: NotebookServiceImpl, _userId?: string): void {
  _notebookService = nb;
  // userId is now provided via AsyncLocalStorage; the parameter is kept
  // for backward compat but ignored.
}

export class WriteNoteTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'write_note',
      description: 'Write a note to a notebook. Use to save important findings, analysis results, or observations for later reference.',
      parameters: [
        createToolParameter({
          name: 'title',
          type: 'string',
          description: 'Note title.',
          required: true,
        }),
        createToolParameter({
          name: 'content',
          type: 'string',
          description: 'Note content.',
          required: true,
        }),
        createToolParameter({
          name: 'notebook_id',
          type: 'string',
          description: 'Target notebook ID. If omitted, creates a "Default" notebook.',
          required: false,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Write a note to a notebook.',
      whenToUse: 'When you want to save findings, analysis, summaries, or any information for the user to reference later.',
      inputFormat: 'title: note title; content: note body; notebook_id: target notebook (optional)',
      phase: 'storage',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const title = kwargs.title as string;
    const content = kwargs.content as string;
    let notebookId = kwargs.notebook_id as string | undefined;

    if (!title || !content) {
      return createToolResult({ content: 'Error: title and content are required.', success: false });
    }

    if (!_notebookService) {
      return createToolResult({ content: 'Notebook service not available.', success: false });
    }

    try {
      const userId = getCurrentUserId();

      // Auto-create default notebook if not specified
      if (!notebookId) {
        const notebooks = await _notebookService.listNotebooks(userId);
        const defaultNb = notebooks.find((nb) => nb.name === 'Default');
        if (defaultNb) {
          notebookId = defaultNb.id;
        } else {
          const newNb = await _notebookService.createNotebook(userId, 'Default');
          notebookId = newNb.id;
        }
      }

      const record = await _notebookService.addRecord(userId, notebookId, {
        type: 'note',
        title,
        summary: content.slice(0, 200),
        content,
        metadata: {},
      });

      return createToolResult({
        content: `Note saved: "${title}" (id: ${record.id}, notebook: ${notebookId})`,
        metadata: { note_id: record.id, notebook_id: notebookId },
      });
    } catch (err) {
      return createToolResult({
        content: `Error saving note: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}
