/**
 * ReasonTool — Deep step-by-step reasoning on a complex question
 *
 * Migrated from DeepTutor Python: deeptutor/tools/reason.py
 * Uses a low-temperature LLM call for precise, logical analysis.
 */

import { BaseTool, createToolResult } from '@/lib/deeptutor/core/tool-protocol';
import type { ToolDefinition, ToolResult } from '@/lib/deeptutor/core/tool-protocol';
import { createLogger } from '@/lib/logger';
import type { LLMCallFn } from './brainstorm';

const log = createLogger('ReasonTool');

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a deep reasoning engine. Your job is to analyse a question or
problem step by step, with rigour and clarity.

Guidelines:
- Decompose the problem into clearly labelled steps or sub-questions.
- For each step, state your reasoning explicitly before drawing conclusions.
- Identify assumptions, edge cases, and potential counter-arguments.
- When multiple interpretations exist, explore each briefly before choosing.
- Conclude with a concise summary or answer grounded in your reasoning.
- Use structured formatting (numbered steps, bullet points, headings) for readability.`;

// ---------------------------------------------------------------------------
// Default no-op LLM call
// ---------------------------------------------------------------------------

const PLACEHOLDER_LLM_CALL: LLMCallFn = async () => {
  throw new Error('No LLM backend configured. Please configure an AI provider (OpenAI, Anthropic, etc.) in Settings > LLM to use reasoning.');
};

// ---------------------------------------------------------------------------
// ReasonTool
// ---------------------------------------------------------------------------

export class ReasonTool extends BaseTool {
  private readonly llmCall: LLMCallFn;

  constructor(llmCall?: LLMCallFn) {
    super();
    this.llmCall = llmCall ?? PLACEHOLDER_LLM_CALL;
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'reason',
      description:
        'Perform deep step-by-step reasoning on a complex question. ' +
        'Use this for logical analysis, problem decomposition, and rigorous argumentation.',
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'The question or problem requiring deep reasoning',
          required: true,
          default: null,
          enum: null,
          items: null,
        },
        {
          name: 'context',
          type: 'string',
          description: 'Optional context or background information',
          required: false,
          default: '',
          enum: null,
          items: null,
        },
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const query = kwargs.query as string;
    const context = (kwargs.context as string) ?? '';

    if (!query || typeof query !== 'string') {
      return createToolResult({
        content: 'Error: "query" is required and must be a non-empty string.',
        success: false,
      });
    }

    const userPrompt = context
      ? `Question: ${query}\n\nBackground context: ${context}`
      : `Question: ${query}`;

    log.info('Reasoning on query:', query.slice(0, 80));

    try {
      const reasoningText = await this.llmCall({
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.0,
        maxTokens: 4096,
      });

      return createToolResult({
        content: reasoningText,
        metadata: { query },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Reason LLM call failed:', message);
      return createToolResult({
        content: `Reasoning failed: ${message}`,
        success: false,
        metadata: { query },
      });
    }
  }
}

export default ReasonTool;
