/**
 * SolvePlanTool — Create a step-by-step plan for solving a complex problem
 *
 * Phase 3a solve tool used by the DeepSolveCapability pipeline.
 * Calls the LLM with a planning prompt and returns a structured plan
 * as JSON: { analysis: string, steps: [{ id: string, goal: string }] }
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

const log = createLogger('SolvePlanTool');

// ---------------------------------------------------------------------------
// LLM call abstraction (module-level, injected by the capability pipeline)
// ---------------------------------------------------------------------------

type LLMCallFn = (params: {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}) => Promise<string>;

let _llmCall: LLMCallFn | null = null;

/** Inject the LLM call function before the tool is used. */
export function setSolvePlanContext(llmCall: LLMCallFn): void {
  _llmCall = llmCall;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert problem-solving planner. Your job is to decompose a
complex problem into a clear, actionable, step-by-step plan.

Guidelines:
- Begin with a concise analysis of the problem: what is being asked, what are
  the key constraints, and what approach is most likely to succeed.
- Then produce a numbered list of concrete steps. Each step should have a
  short, stable ID (e.g. "step_1", "step_2") and a clear goal statement.
- Steps should be ordered so that each builds on the previous ones.
- Keep steps atomic: one clear sub-task per step.
- Aim for 3–8 steps depending on problem complexity.

You MUST respond with valid JSON in the following exact shape (no extra text):
{
  "analysis": "<your analysis of the problem>",
  "steps": [
    { "id": "step_1", "goal": "<what this step achieves>" },
    { "id": "step_2", "goal": "<what this step achieves>" }
  ]
}`;

// ---------------------------------------------------------------------------
// SolvePlanTool
// ---------------------------------------------------------------------------

export class SolvePlanTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'solve_plan',
      description:
        'Create a step-by-step plan for solving a complex problem. ' +
        'Returns a structured plan with numbered steps.',
      parameters: [
        createToolParameter({
          name: 'problem',
          type: 'string',
          description: 'The problem description to plan a solution for.',
          required: true,
        }),
        createToolParameter({
          name: 'context',
          type: 'string',
          description: 'Optional additional context or previous attempts that may inform the plan.',
          required: false,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Create a structured, step-by-step plan for solving a complex problem.',
      whenToUse:
        'Use at the start of a deep-solve pipeline run, or whenever a fresh plan is needed ' +
        'after a replan has been triggered.',
      inputFormat:
        'problem: a clear description of the problem to solve; ' +
        'context: (optional) background info or prior attempts',
      guideline:
        'Provide a specific, well-scoped problem description. Vague inputs produce vague plans. ' +
        'Include relevant constraints or goals in the problem field.',
      note:
        'The returned plan is JSON with an "analysis" field and a "steps" array. ' +
        'Each step has an "id" (e.g. step_1) used by solve_finish_step, and a "goal" description.',
      phase: 'solve',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const problem = kwargs.problem as string;
    const context = (kwargs.context as string) ?? '';

    if (!problem || typeof problem !== 'string') {
      return createToolResult({
        content: 'Error: "problem" is required and must be a non-empty string.',
        success: false,
      });
    }

    if (!_llmCall) {
      return createToolResult({
        content:
          'Error: SolvePlanTool requires an LLM call function. ' +
          'Call setSolvePlanContext(llmCall) before using this tool.',
        success: false,
      });
    }

    const userPrompt = context
      ? `Problem: ${problem}\n\nAdditional context:\n${context}`
      : `Problem: ${problem}`;

    log.info('Creating solve plan for problem:', problem.slice(0, 80));

    try {
      const raw = await _llmCall({
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.1,
        maxTokens: 4096,
      });

      // Attempt to parse the LLM response as JSON to validate structure.
      // If parsing fails we still return the raw text — the LLM may have
      // wrapped the JSON in a code fence or added a preamble.
      let plan = raw;
      try {
        // Strip optional markdown code fences before parsing.
        const jsonCandidate = raw
          .replace(/^```(?:json)?\n?/i, '')
          .replace(/\n?```\s*$/, '')
          .trim();
        const parsed = JSON.parse(jsonCandidate) as {
          analysis?: unknown;
          steps?: unknown;
        };

        if (
          typeof parsed.analysis !== 'string' ||
          !Array.isArray(parsed.steps) ||
          parsed.steps.length === 0
        ) {
          log.warn('LLM returned JSON with unexpected shape; returning raw text.');
        } else {
          // Re-serialise to guarantee clean JSON downstream.
          plan = JSON.stringify(parsed, null, 2);
        }
      } catch {
        log.warn('LLM response was not valid JSON; returning raw text as plan.');
      }

      return createToolResult({
        content: plan,
        metadata: { problem, hasContext: Boolean(context) },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('SolvePlan LLM call failed:', message);
      return createToolResult({
        content: `Failed to create solve plan: ${message}`,
        success: false,
        metadata: { problem },
      });
    }
  }
}

export default SolvePlanTool;
