/**
 * GithubTool — Read-only GitHub query tool using the `gh` CLI
 *
 * Provides safe, read-only access to GitHub resources:
 * pull requests, issues, workflow runs, repos, and the GitHub API.
 * No mutation verbs are exposed — all operations are queries.
 *
 * Migrated from DeepTutor Python: deeptutor/tools/github_query.py
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
import { execFile } from 'child_process';

const log = createLogger('GithubTool');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXEC_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_CHARS = 16_000;

const QUERY_TYPES = ['pr', 'issue', 'run', 'repo', 'api'] as const;
type QueryType = (typeof QUERY_TYPES)[number];

// ---------------------------------------------------------------------------
// Module-level context (set before use)
// ---------------------------------------------------------------------------

let _token: string | undefined;

/**
 * Set context for the GitHub tool.
 * Call once during app bootstrap before any tool execution.
 *
 * @param options.token — Optional GitHub token passed via GH_TOKEN env var
 *                        when spawning `gh`. When omitted the tool relies on
 *                        the user's existing `gh auth login` session.
 */
export function setGithubToolContext(options?: { token?: string }): void {
  _token = options?.token;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the `gh` CLI command and arguments for a given query type + target.
 */
function buildCommand(
  queryType: QueryType,
  target: string,
  fields?: string,
): { cmd: string; args: string[] } {
  const fieldArgs = fields ? ['--json', fields] : [];

  switch (queryType) {
    case 'pr':
      return { cmd: 'gh', args: ['pr', 'view', String(target), ...fieldArgs] };
    case 'issue':
      return { cmd: 'gh', args: ['issue', 'view', String(target), ...fieldArgs] };
    case 'run':
      return {
        cmd: 'gh',
        args: ['run', 'list', '--repo', target, '--limit', '10', ...fieldArgs],
      };
    case 'repo':
      return { cmd: 'gh', args: ['repo', 'view', target, ...fieldArgs] };
    case 'api':
      return {
        cmd: 'gh',
        args: ['api', '-H', 'Accept: application/vnd.github+json', target],
      };
  }
}

/**
 * Execute a `gh` CLI command and return stdout.
 * Rejects on non-zero exit code or timeout.
 */
function runGh(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (_token) {
      env.GH_TOKEN = _token;
    }

    execFile(
      cmd,
      args,
      { timeout: EXEC_TIMEOUT_MS, env, maxBuffer: 1024 * 1024 },
      (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
        if (error) {
          // Surface a helpful message when `gh` is not installed
          if (
            error.message.includes('ENOENT') ||
            (error as NodeJS.ErrnoException).code === 'ENOENT'
          ) {
            reject(
              new Error(
                'The `gh` CLI is not installed or not on PATH. ' +
                  'Install it from https://cli.github.com/ and run `gh auth login`.',
              ),
            );
            return;
          }

          const exitCode = (error as NodeJS.ErrnoException & { code?: number | string }).code ?? 'unknown';
          const stderrStr = typeof stderr === 'string' ? stderr : stderr.toString();
          const detail = stderrStr.trim() || error.message;
          reject(new Error(`gh exited with code ${exitCode}: ${detail}`));
          return;
        }

        const output = typeof stdout === 'string' ? stdout : stdout.toString();
        resolve(output);
      },
    );
  });
}

/**
 * Truncate output to MAX_OUTPUT_CHARS, appending a notice if clipped.
 */
function truncateOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) {
    return text;
  }
  return (
    text.slice(0, MAX_OUTPUT_CHARS) +
    `\n\n[... truncated — output exceeded ${MAX_OUTPUT_CHARS.toLocaleString()} characters]`
  );
}

// ---------------------------------------------------------------------------
// GithubTool
// ---------------------------------------------------------------------------

export class GithubTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'github',
      description:
        'Query GitHub for PRs, issues, runs, repos, or API endpoints. Read-only.',
      parameters: [
        createToolParameter({
          name: 'query_type',
          type: 'string',
          description:
            'What to query: "pr" (pull request), "issue", "run" (workflow runs), "repo", or "api" (raw GitHub API endpoint).',
          required: true,
          enum: [...QUERY_TYPES],
        }),
        createToolParameter({
          name: 'target',
          type: 'string',
          description:
            'The query target. PR/issue: number or URL. Run/repo: owner/repo path. API: REST endpoint path (e.g. "/repos/owner/repo/commits").',
          required: true,
        }),
        createToolParameter({
          name: 'fields',
          type: 'string',
          description:
            'Comma-separated JSON fields to return (e.g. "title,body,state"). Only applies to pr, issue, run, and repo query types.',
          required: false,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Read-only GitHub queries.',
      whenToUse:
        'When you need to look up a pull request, issue, workflow run, repository metadata, or call a read-only GitHub API endpoint.',
      inputFormat:
        'query_type: one of pr | issue | run | repo | api. target: the PR/issue number, owner/repo, or API path. fields: optional comma-separated JSON field names.',
      guideline:
        'Use this tool for read-only access. It cannot create, merge, comment, or modify anything on GitHub. Prefer specific query types over raw "api" when possible.',
      note:
        'Requires the `gh` CLI to be installed and authenticated. Output is truncated at 16 000 characters.',
      phase: 'retrieval',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const queryType = kwargs.query_type as string;
    const target = kwargs.target as string;
    const fields = kwargs.fields as string | undefined;

    // --- Validate query_type ---
    if (!queryType || !QUERY_TYPES.includes(queryType as QueryType)) {
      return createToolResult({
        content: `Error: query_type must be one of: ${QUERY_TYPES.join(', ')}.`,
        success: false,
      });
    }

    // --- Validate target ---
    if (!target || target.trim().length === 0) {
      return createToolResult({
        content: 'Error: target parameter is required.',
        success: false,
      });
    }

    try {
      const { cmd, args } = buildCommand(
        queryType as QueryType,
        target.trim(),
        fields?.trim() || undefined,
      );

      log.info(`Executing: ${cmd} ${args.join(' ')}`);

      const stdout = await runGh(cmd, args);
      const output = truncateOutput(stdout);

      return createToolResult({
        content: output,
        metadata: {
          query_type: queryType,
          target,
          fields: fields || null,
          truncated: stdout.length > MAX_OUTPUT_CHARS,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`GitHub query failed: ${message}`);

      return createToolResult({
        content: `GitHub query failed: ${message}`,
        success: false,
        metadata: { query_type: queryType, target },
      });
    }
  }
}
