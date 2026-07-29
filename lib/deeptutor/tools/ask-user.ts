/**
 * AskUserTool — Structured clarifying questions that pause the agent loop
 *
 * Migrated from DeepTutor Python: deeptutor/tools/ask_user.py
 * Returns pauseForUser to signal the agent loop to pause and await user input.
 */

import { BaseTool, createToolResult } from '@/lib/deeptutor/core/tool-protocol';
import type { ToolDefinition, ToolResult } from '@/lib/deeptutor/core/tool-protocol';
import { createLogger } from '@/lib/logger';

const log = createLogger('AskUserTool');

// ---------------------------------------------------------------------------
// AskUserTool
// ---------------------------------------------------------------------------

export class AskUserTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'ask_user',
      description:
        'Ask the user clarifying questions to better understand their needs. ' +
        'Use this when the request is ambiguous or you need more information.',
      parameters: [
        {
          name: 'question',
          type: 'string',
          description: 'The clarifying question to ask',
          required: true,
          default: null,
          enum: null,
          items: null,
        },
        {
          name: 'options',
          type: 'array',
          description: 'Optional list of suggested answers',
          required: false,
          default: null,
          enum: null,
          items: { type: 'string' },
        },
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const question = kwargs.question as string;
    const options = (kwargs.options as string[]) ?? [];

    if (!question || typeof question !== 'string') {
      return createToolResult({
        content: 'Error: "question" is required and must be a non-empty string.',
        success: false,
      });
    }

    log.info('Asking user:', question.slice(0, 80));

    // Build a human-readable summary for the LLM's tool result message
    const optionsSummary =
      options.length > 0 ? `\nSuggested options: ${options.map((o) => `"${o}"`).join(', ')}` : '';

    return createToolResult({
      content: `Asked the user: "${question}"${optionsSummary}\nWaiting for user response...`,
      pauseForUser: {
        question,
        options,
        type: 'clarification',
      },
    });
  }
}

export default AskUserTool;
