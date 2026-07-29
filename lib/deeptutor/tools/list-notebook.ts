/**
 * ListNotebookTool — List the user's notebooks and their notes
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolResult,
  type ToolPromptHints,
  createToolResult,
  createToolPromptHints,
} from '@/lib/deeptutor/core/tool-protocol';
import type { NotebookServiceImpl } from '@/lib/deeptutor/services/notebook';
import { getCurrentUserId } from '@/lib/deeptutor/context/tool-context';

let _notebookService: NotebookServiceImpl | null = null;

export function setListNotebookContext(nb: NotebookServiceImpl, _userId?: string): void {
  _notebookService = nb;
  // userId is now provided via AsyncLocalStorage; the parameter is kept
  // for backward compat but ignored.
}

export class ListNotebookTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'list_notebook',
      description: 'List the user\'s notebooks with their note counts. Use to see available notebooks before writing a note.',
      parameters: [],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'List available notebooks.',
      whenToUse: 'When you need to see what notebooks exist before writing a note, or to reference existing notes.',
      phase: 'retrieval',
    });
  }

  async execute(_kwargs: Record<string, unknown>): Promise<ToolResult> {
    if (!_notebookService) {
      return createToolResult({ content: 'Notebook service not available.', success: false });
    }

    const userId = getCurrentUserId();
    const notebooks = await _notebookService.listNotebooks(userId);

    if (notebooks.length === 0) {
      return createToolResult({
        content: 'No notebooks found. You can create one or I can write notes directly.',
        metadata: { count: 0 },
      });
    }

    const lines = notebooks.map((nb) =>
      `- [${nb.id}] ${nb.name} (${nb.recordCount} notes)${nb.description ? ` — ${nb.description}` : ''}`
    );

    return createToolResult({
      content: `Notebooks:\n${lines.join('\n')}`,
      metadata: { count: notebooks.length },
    });
  }
}
