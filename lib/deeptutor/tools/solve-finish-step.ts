/**
 * SolveFinishStepTool — Mark a plan step as completed and record its result
 *
 * Phase 3a solve tool used by the DeepSolveCapability pipeline.
 * Stores step results in a module-level Map so the pipeline can inspect
 * what has been completed and retrieve each step's answer.
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

const log = createLogger('SolveFinishStepTool');

// ---------------------------------------------------------------------------
// Module-level step results store
// ---------------------------------------------------------------------------

const _stepResults: Map<string, string> = new Map();

/** Return the current map of completed step results (step_id -> result). */
export function getSolveStepResults(): Map<string, string> {
  return _stepResults;
}

/** Clear all stored step results (called between pipeline runs). */
export function clearSolveStepResults(): void {
  _stepResults.clear();
}

// ---------------------------------------------------------------------------
// SolveFinishStepTool
// ---------------------------------------------------------------------------

export class SolveFinishStepTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'solve_finish_step',
      description:
        'Mark a plan step as completed and record its result. ' +
        'Call this after finishing each step of the solve plan.',
      parameters: [
        createToolParameter({
          name: 'step_id',
          type: 'string',
          description: 'The step ID from the plan (e.g. "step_1").',
          required: true,
        }),
        createToolParameter({
          name: 'result',
          type: 'string',
          description: 'The answer or result produced for this step.',
          required: true,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Record the result of a completed solve-plan step.',
      whenToUse:
        'Call immediately after completing each step of the solve plan. ' +
        'The step_id must match one of the IDs returned by solve_plan.',
      inputFormat:
        'step_id: the ID of the step that was completed (e.g. "step_1"); ' +
        'result: the answer, finding, or output produced for that step',
      guideline:
        'Provide a clear, self-contained result string. If the step produced ' +
        'structured data (e.g. code, a formula), include it inline. ' +
        'If the step failed or yielded no useful result, record that honestly — ' +
        'the pipeline may trigger a replan based on incomplete or failed steps.',
      note:
        'Results are stored in a module-level map and can be retrieved by the ' +
        'pipeline via getSolveStepResults(). Call clearSolveStepResults() between runs.',
      phase: 'solve',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const stepId = kwargs.step_id as string;
    const result = kwargs.result as string;

    if (!stepId || typeof stepId !== 'string') {
      return createToolResult({
        content: 'Error: "step_id" is required and must be a non-empty string.',
        success: false,
      });
    }

    if (!result || typeof result !== 'string') {
      return createToolResult({
        content: 'Error: "result" is required and must be a non-empty string.',
        success: false,
      });
    }

    try {
      const isOverwrite = _stepResults.has(stepId);
      _stepResults.set(stepId, result);

      if (isOverwrite) {
        log.info(`Step "${stepId}" result overwritten.`);
      } else {
        log.info(`Step "${stepId}" marked as finished. Total completed: ${_stepResults.size}`);
      }

      // Build a short summary: first 120 chars of the result.
      const summary =
        result.length > 120 ? `${result.slice(0, 120)}...` : result;

      const completedIds = Array.from(_stepResults.keys());

      const content = [
        `Step "${stepId}" has been recorded as completed.`,
        `Result summary: ${summary}`,
        `Completed steps so far: [${completedIds.join(', ')}]`,
        isOverwrite
          ? 'Note: this step was already completed; the previous result has been replaced.'
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      return createToolResult({
        content,
        metadata: {
          step_id: stepId,
          completedCount: _stepResults.size,
          completedIds,
          isOverwrite,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Failed to record result for step "${stepId}":`, message);
      return createToolResult({
        content: `Failed to record step result: ${message}`,
        success: false,
        metadata: { step_id: stepId },
      });
    }
  }
}

export default SolveFinishStepTool;
