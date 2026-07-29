/**
 * SolveReplanTool — Trigger a replan when the current approach is not working
 *
 * Phase 3a solve tool used by the DeepSolveCapability pipeline.
 * Sets a module-level flag with the reason for replanning, which the
 * pipeline reads to decide whether to restart the planning phase.
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

const log = createLogger('SolveReplanTool');

// ---------------------------------------------------------------------------
// Module-level replan state
// ---------------------------------------------------------------------------

let _replanRequested = false;
let _replanReason = '';

/** Whether a replan has been requested since the last reset. */
export function isReplanRequested(): boolean {
  return _replanRequested;
}

/** The reason provided when the replan was triggered. */
export function getReplanReason(): string {
  return _replanReason;
}

/** Reset replan state (called between pipeline runs or after a new plan is generated). */
export function resetReplanState(): void {
  _replanRequested = false;
  _replanReason = '';
}

// ---------------------------------------------------------------------------
// SolveReplanTool
// ---------------------------------------------------------------------------

export class SolveReplanTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'solve_replan',
      description:
        'Trigger a replan when the current approach is not working. ' +
        'Use when a step cannot be completed or the plan needs revision.',
      parameters: [
        createToolParameter({
          name: 'reason',
          type: 'string',
          description: 'Why the current plan is not working.',
          required: true,
        }),
        createToolParameter({
          name: 'attempt_summary',
          type: 'string',
          description: 'Optional summary of what was tried before deciding to replan.',
          required: false,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Signal that the current solve plan is not working and a new plan is needed.',
      whenToUse:
        'Use when you have attempted one or more steps of the plan and determined that ' +
        'the current approach will not lead to a correct or complete solution. ' +
        'Do NOT use this as a shortcut to avoid difficult steps — only when the plan ' +
        'itself is fundamentally flawed or the problem has been misunderstood.',
      inputFormat:
        'reason: a clear explanation of why the current plan is failing; ' +
        'attempt_summary: (optional) a brief summary of what was tried',
      guideline:
        'Be specific about what went wrong. "Step 3 requires information I cannot obtain" ' +
        'is more useful than "this is not working". Include the attempt_summary when you ' +
        'have already made meaningful progress that the new plan should account for.',
      note:
        'After calling this tool the pipeline will re-enter the planning phase. ' +
        'Previously recorded step results (from solve_finish_step) remain available ' +
        'and can be referenced in the new plan.',
      phase: 'solve',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const reason = kwargs.reason as string;
    const attemptSummary = (kwargs.attempt_summary as string) ?? '';

    if (!reason || typeof reason !== 'string') {
      return createToolResult({
        content: 'Error: "reason" is required and must be a non-empty string.',
        success: false,
      });
    }

    try {
      _replanRequested = true;
      _replanReason = attemptSummary
        ? `${reason}\n\nAttempt summary: ${attemptSummary}`
        : reason;

      log.info('Replan triggered. Reason:', reason.slice(0, 120));
      if (attemptSummary) {
        log.info('Attempt summary:', attemptSummary.slice(0, 120));
      }

      const content = [
        'Replan has been triggered.',
        `Reason: ${reason}`,
        attemptSummary ? `Attempt summary: ${attemptSummary}` : '',
        'The pipeline will generate a new plan. Previous step results remain available.',
      ]
        .filter(Boolean)
        .join('\n');

      return createToolResult({
        content,
        metadata: {
          reason,
          hasAttemptSummary: Boolean(attemptSummary),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to trigger replan:', message);
      return createToolResult({
        content: `Failed to trigger replan: ${message}`,
        success: false,
        metadata: { reason },
      });
    }
  }
}

export default SolveReplanTool;
