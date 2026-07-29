/**
 * BrainstormTool — Generate 5-8 creative directions for a given topic
 *
 * Migrated from DeepTutor Python: deeptutor/tools/brainstorm.py
 * A single LLM call with a high-temperature creative system prompt.
 */

import { BaseTool, createToolResult } from '@/lib/deeptutor/core/tool-protocol';
import type { ToolDefinition, ToolResult } from '@/lib/deeptutor/core/tool-protocol';
import { createLogger } from '@/lib/logger';

const log = createLogger('BrainstormTool');

// ---------------------------------------------------------------------------
// LLM call abstraction
// ---------------------------------------------------------------------------

/**
 * Abstract LLM call signature injected into tools that need LLM access.
 *
 * The caller (agent loop / registration helper) wires this to the real
 * `callLLM` from `@/lib/ai/llm` with a pre-selected model, keeping the
 * tool decoupled from provider and model configuration.
 */
export interface LLMCallFn {
  (params: {
    system: string;
    prompt: string;
    temperature: number;
    maxTokens: number;
  }): Promise<string>;
}

/** Default no-op implementation that returns an error when no LLM backend is configured. */
const PLACEHOLDER_LLM_CALL: LLMCallFn = async () => {
  throw new Error('No LLM backend configured. Please configure an AI provider (OpenAI, Anthropic, etc.) in Settings > LLM to use brainstorming.');
};

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a creative brainstorming engine. Your job is to generate diverse,
original, and actionable ideas for a given topic.

Guidelines:
- Produce between 5 and 8 distinct directions or ideas.
- Each idea should have a short, memorable title and a 2-3 sentence description.
- Favor breadth over depth: cover different angles, disciplines, or strategies.
- Avoid obvious or generic suggestions — push for originality.
- Use numbered lists for clarity.
- When relevant, note potential risks or trade-offs for each idea.`;

// ---------------------------------------------------------------------------
// BrainstormTool
// ---------------------------------------------------------------------------

export class BrainstormTool extends BaseTool {
  private readonly llmCall: LLMCallFn;

  constructor(llmCall?: LLMCallFn) {
    super();
    this.llmCall = llmCall ?? PLACEHOLDER_LLM_CALL;
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'brainstorm',
      description:
        'Generate 5-8 creative directions or ideas for a given topic. ' +
        'Use this for open-ended exploration, ideation, and breadth-first thinking.',
      parameters: [
        {
          name: 'topic',
          type: 'string',
          description: 'The topic or question to brainstorm about',
          required: true,
          default: null,
          enum: null,
          items: null,
        },
        {
          name: 'context',
          type: 'string',
          description: 'Optional additional context to guide the brainstorming',
          required: false,
          default: '',
          enum: null,
          items: null,
        },
      ],
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const topic = kwargs.topic as string;
    const context = (kwargs.context as string) ?? '';

    if (!topic || typeof topic !== 'string') {
      return createToolResult({
        content: 'Error: "topic" is required and must be a non-empty string.',
        success: false,
      });
    }

    const userPrompt = context
      ? `Topic: ${topic}\n\nAdditional context: ${context}`
      : `Topic: ${topic}`;

    log.info('Brainstorming on topic:', topic.slice(0, 80));

    try {
      const brainstormText = await this.llmCall({
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.8,
        maxTokens: 2048,
      });

      return createToolResult({
        content: brainstormText,
        metadata: { topic },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Brainstorm LLM call failed:', message);
      return createToolResult({
        content: `Brainstorm failed: ${message}`,
        success: false,
        metadata: { topic },
      });
    }
  }
}

export default BrainstormTool;
