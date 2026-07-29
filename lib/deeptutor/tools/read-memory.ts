/**
 * ReadMemoryTool — Read the user's long-term memory
 *
 * Returns the concatenation of all L3 memory slots
 * (recent, profile, scope, preferences).
 * Auto-mounted when the user has memory content.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolResult,
  type ToolPromptHints,
  createToolResult,
  createToolPromptHints,
} from '@/lib/deeptutor/core/tool-protocol';
import type { MemoryServiceImpl } from '@/lib/deeptutor/services/memory';
import { getCurrentUserId } from '@/lib/deeptutor/context/tool-context';

let _memoryService: MemoryServiceImpl | null = null;

export function setReadMemoryContext(memory: MemoryServiceImpl, _userId?: string): void {
  _memoryService = memory;
  // userId is now provided via AsyncLocalStorage; the parameter is kept
  // for backward compat but ignored.
}

export class ReadMemoryTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'read_memory',
      description: 'Read the user\'s long-term memory including profile, preferences, learning scope, and recent events. Use this to recall information saved from previous interactions.',
      parameters: [],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Read the user\'s long-term memory.',
      whenToUse: 'Use when you need to recall the user\'s preferences, learning history, knowledge level, or any information saved from previous conversations.',
      phase: 'retrieval',
    });
  }

  async execute(_kwargs: Record<string, unknown>): Promise<ToolResult> {
    if (!_memoryService) {
      return createToolResult({
        content: 'Memory service is not available.',
        success: false,
      });
    }

    const userId = getCurrentUserId();
    const content = await _memoryService.readAllL3(userId);

    if (!content) {
      return createToolResult({
        content: 'No memory entries found. The user\'s memory is empty — this appears to be a new user.',
        metadata: { has_memory: false },
      });
    }

    return createToolResult({
      content: `[User Memory]\n\n${content}\n\n[End User Memory]`,
      metadata: { has_memory: true },
    });
  }
}
