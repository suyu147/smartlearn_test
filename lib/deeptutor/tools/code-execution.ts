/**
 * CodeExecutionTool — Execute code in a sandboxed environment
 *
 * Sends code to the Piston API for sandboxed execution.
 * Supports Python, JavaScript, TypeScript, and other languages.
 *
 * Parameters:
 * - code: The code to execute
 * - language: Programming language (default: python)
 * - timeout: Execution timeout in seconds (default: 15, max: 60)
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
import type { SandboxServiceImpl } from '@/lib/deeptutor/services/sandbox';
import { createLogger } from '@/lib/logger';

const log = createLogger('CodeExecutionTool');

// ---------------------------------------------------------------------------
// Tool context (set per turn)
// ---------------------------------------------------------------------------

let _sandboxService: SandboxServiceImpl | null = null;

export function setSandboxToolContext(sandbox: SandboxServiceImpl): void {
  _sandboxService = sandbox;
}

// ---------------------------------------------------------------------------
// CodeExecutionTool
// ---------------------------------------------------------------------------

export class CodeExecutionTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'code_execution',
      description: 'Execute code in a sandboxed environment. Supports Python, JavaScript, TypeScript, and more. Use for calculations, data analysis, plotting, and verification tasks.',
      parameters: [
        createToolParameter({
          name: 'code',
          type: 'string',
          description: 'The source code to execute.',
          required: true,
        }),
        createToolParameter({
          name: 'language',
          type: 'string',
          description: 'Programming language (python, javascript, typescript, ruby, go, rust, java, cpp, c).',
          required: false,
          default: 'python',
        }),
        createToolParameter({
          name: 'timeout',
          type: 'integer',
          description: 'Execution timeout in seconds (max 60).',
          required: false,
          default: 15,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Execute code in a sandboxed environment.',
      whenToUse: 'Use for mathematical calculations, data analysis, algorithm verification, generating plots, or any task that benefits from running code.',
      inputFormat: 'code: source code string; language: programming language (default python); timeout: seconds',
      guideline: 'Write complete, self-contained code. Print the final result to stdout. Use standard libraries when possible.',
      note: 'Output is truncated at 50,000 characters. Network access is restricted.',
      phase: 'execution',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const code = kwargs.code as string;
    const language = (kwargs.language as string) ?? 'python';
    const timeout = (kwargs.timeout as number) ?? 15;

    if (!code || code.trim().length === 0) {
      return createToolResult({
        content: 'Error: code parameter is required.',
        success: false,
      });
    }

    if (!_sandboxService) {
      return createToolResult({
        content: 'Code execution service is not available. Piston API must be running.',
        success: false,
      });
    }

    try {
      const result = await _sandboxService.execute(code, {
        language,
        timeout,
      });

      const parts: string[] = [];

      if (result.stdout) {
        parts.push(`Output:\n${result.stdout}`);
      }
      if (result.stderr) {
        parts.push(`Errors:\n${result.stderr}`);
      }
      if (result.timedOut) {
        parts.push(`[Execution timed out after ${timeout}s]`);
      }

      parts.push(`\n[${result.language} | exit code: ${result.exitCode} | ${result.elapsed}ms]`);

      const content = parts.join('\n\n');
      const success = result.exitCode === 0 && !result.timedOut;

      return createToolResult({
        content,
        success,
        metadata: {
          language: result.language,
          exitCode: result.exitCode,
          elapsed: result.elapsed,
          timedOut: result.timedOut,
        },
      });
    } catch (err) {
      log.error('Code execution failed:', err);
      return createToolResult({
        content: `Code execution error: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      });
    }
  }
}
