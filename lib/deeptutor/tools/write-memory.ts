/**
 * WriteMemoryTool — Save information to the user's long-term memory
 *
 * Writes to L3/preferences.md. This is the only chat-mode write path.
 * Supports add (new entry) and edit (update existing entry) operations.
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
import type { MemoryServiceImpl } from '@/lib/deeptutor/services/memory';
import { getCurrentUserId } from '@/lib/deeptutor/context/tool-context';

let _memoryService: MemoryServiceImpl | null = null;

export function setWriteMemoryContext(memory: MemoryServiceImpl, _userId?: string): void {
  _memoryService = memory;
  // userId is now provided via AsyncLocalStorage; the parameter is kept
  // for backward compat but ignored.
}

export class WriteMemoryTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'write_memory',
      description: 'Save a fact, preference, or observation about the user to long-term memory. Use this when the user shares important preferences, corrects a misconception, or reveals something worth remembering.',
      parameters: [
        createToolParameter({
          name: 'op',
          type: 'string',
          description: 'Operation: "add" to create a new entry, "edit" to update an existing one.',
          required: true,
          enum: ['add', 'edit'],
        }),
        createToolParameter({
          name: 'text',
          type: 'string',
          description: 'The memory text to save (max 240 characters).',
          required: true,
        }),
        createToolParameter({
          name: 'target_id',
          type: 'string',
          description: 'For "edit" op: the ID of the entry to update (from read_memory output).',
          required: false,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Save a fact or preference to long-term memory.',
      whenToUse: 'When the user states a preference, corrects you, shares learning goals, or reveals information worth remembering for future interactions.',
      inputFormat: 'op: "add" or "edit"; text: concise fact (<=240 chars); target_id: for edits',
      guideline: 'Write objective, factual statements. Avoid superlatives like "expert" or "passionate". Keep entries concise.',
      phase: 'storage',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const op = kwargs.op as string;
    const text = kwargs.text as string;
    const targetId = kwargs.target_id as string | undefined;

    if (!op || !text) {
      return createToolResult({
        content: 'Error: op and text parameters are required.',
        success: false,
      });
    }

    if (!_memoryService) {
      return createToolResult({
        content: 'Memory service is not available.',
        success: false,
      });
    }

    try {
      const userId = getCurrentUserId();

      // Emit L1 trace
      await _memoryService.emitTrace(userId, {
        surface: 'chat',
        kind: 'preference_stated',
        payload: { op, text, target_id: targetId },
      });

      // Write to L3 preferences
      const result = await _memoryService.writePreference(
        userId,
        op as 'add' | 'edit',
        text,
        targetId,
      );

      if (result.success) {
        return createToolResult({
          content: `${result.message}: "${text}" (id: ${result.entryId})`,
          metadata: { entry_id: result.entryId, op },
        });
      } else {
        return createToolResult({
          content: `Failed to write memory: ${result.message}`,
          success: false,
        });
      }
    } catch (err) {
      return createToolResult({
        content: `Error writing memory: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}
