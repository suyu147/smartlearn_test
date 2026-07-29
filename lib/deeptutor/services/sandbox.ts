/**
 * SandboxService — Remote code execution via Piston API
 *
 * Piston API (https://github.com/engineer-man/piston) provides
 * sandboxed code execution for multiple languages.
 *
 * Env vars:
 *   PISTON_API_URL — Piston API base URL (default: http://localhost:2000)
 *   PISTON_API_KEY — Optional API key for Piston authentication
 *
 * Phase 2c: Piston adapter + quota management.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('SandboxService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  elapsed: number;        // ms
  language: string;
  version: string;
  timedOut: boolean;
}

export interface ExecutionOptions {
  language?: string;      // default: "python"
  version?: string;       // default: "3.12.0"
  timeout?: number;       // seconds, default: 15, max: 60
  stdin?: string;
  args?: string[];
  files?: Array<{ name: string; content: string }>;
}

export interface QuotaConfig {
  maxExecutionsPerHour: number;   // default: 60
  maxExecutionTimeSec: number;    // default: 60
  maxOutputChars: number;         // default: 50000
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PISTON_URL = 'http://localhost:2000';
const DEFAULT_TIMEOUT_SEC = 15;
const MAX_TIMEOUT_SEC = 60;
const MAX_OUTPUT_CHARS = 50_000;
const DEFAULT_MAX_PER_HOUR = 60;

// Language aliases
const LANGUAGE_ALIASES: Record<string, string> = {
  py: 'python', python3: 'python', python: 'python',
  js: 'javascript', node: 'javascript', javascript: 'javascript',
  ts: 'typescript', typescript: 'typescript',
  rb: 'ruby', ruby: 'ruby',
  go: 'go', golang: 'go',
  rs: 'rust', rust: 'rust',
  java: 'java',
  cpp: 'cpp', 'c++': 'cpp', c: 'c',
};

// ---------------------------------------------------------------------------
// Quota Tracker (module-level, single-worker safe)
// ---------------------------------------------------------------------------

const executionTimestamps: number[] = [];

function checkQuota(maxPerHour: number): boolean {
  const now = Date.now();
  const oneHourAgo = now - 3600_000;

  // Prune old entries
  while (executionTimestamps.length > 0 && executionTimestamps[0] < oneHourAgo) {
    executionTimestamps.shift();
  }

  return executionTimestamps.length < maxPerHour;
}

function recordExecution(): void {
  executionTimestamps.push(Date.now());
}

// ---------------------------------------------------------------------------
// SandboxService
// ---------------------------------------------------------------------------

export class SandboxServiceImpl {
  private apiUrl: string;
  private apiKey: string;
  private quota: QuotaConfig;

  constructor(config?: Partial<QuotaConfig>) {
    this.apiUrl = (process.env.PISTON_API_URL ?? DEFAULT_PISTON_URL).replace(/\/+$/, '');
    this.apiKey = process.env.PISTON_API_KEY ?? '';
    this.quota = {
      maxExecutionsPerHour: config?.maxExecutionsPerHour ?? DEFAULT_MAX_PER_HOUR,
      maxExecutionTimeSec: config?.maxExecutionTimeSec ?? MAX_TIMEOUT_SEC,
      maxOutputChars: config?.maxOutputChars ?? MAX_OUTPUT_CHARS,
    };
  }

  /**
   * Execute code via Piston API.
   */
  async execute(code: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    // Resolve language
    const lang = (options.language ?? 'python').toLowerCase();
    const language = LANGUAGE_ALIASES[lang] ?? lang;
    const version = options.version ?? '*';

    // Clamp timeout
    const timeout = Math.min(
      Math.max(options.timeout ?? DEFAULT_TIMEOUT_SEC, 1),
      this.quota.maxExecutionTimeSec,
    );

    // Check quota
    if (!checkQuota(this.quota.maxExecutionsPerHour)) {
      return {
        stdout: '',
        stderr: `Execution quota exceeded: max ${this.quota.maxExecutionsPerHour} executions per hour.`,
        exitCode: -1,
        elapsed: 0,
        language,
        version,
        timedOut: false,
      };
    }

    // Build Piston API request
    const body: Record<string, unknown> = {
      language,
      version,
      files: options.files ?? [{ name: `code.${getFileExtension(language)}`, content: code }],
      stdin: options.stdin ?? '',
      args: options.args ?? [],
      compile_timeout: timeout * 1000,
      run_timeout: timeout * 1000,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.apiUrl}/api/v2/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout((timeout + 10) * 1000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new SandboxError(`Piston API returned ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      recordExecution();

      // Parse Piston response
      const run = json.run ?? {};
      const compile = json.compile ?? {};

      let stdout = (run.stdout ?? '') as string;
      let stderr = (run.stderr ?? '') as string;

      // Include compile errors if any
      if (compile.stderr) {
        stderr = compile.stderr + (stderr ? '\n' + stderr : '');
      }

      // Truncate output
      if (stdout.length > this.quota.maxOutputChars) {
        stdout = stdout.slice(0, this.quota.maxOutputChars) + '\n[... output truncated]';
      }
      if (stderr.length > this.quota.maxOutputChars) {
        stderr = stderr.slice(0, this.quota.maxOutputChars) + '\n[... output truncated]';
      }

      const elapsed = Date.now() - startTime;
      const exitCode = run.code ?? compile.code ?? -1;
      const timedOut = run.signal === 'SIGKILL' || elapsed > timeout * 1000;

      return {
        stdout,
        stderr,
        exitCode,
        elapsed,
        language,
        version: json.version ?? version,
        timedOut,
      };
    } catch (err) {
      if (err instanceof SandboxError) throw err;

      const message = err instanceof Error ? err.message : String(err);

      // Check if Piston is unreachable
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
        log.warn(`Piston API unreachable at ${this.apiUrl}: ${message}`);
        return {
          stdout: '',
          stderr: `[Code execution unavailable] Piston API is not reachable at ${this.apiUrl}. Start a Piston instance or set PISTON_API_URL.`,
          exitCode: -1,
          elapsed: Date.now() - startTime,
          language,
          version,
          timedOut: false,
        };
      }

      throw new SandboxError(`Code execution failed: ${message}`);
    }
  }

  /**
   * Test connectivity to Piston API.
   */
  async testConnectivity(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v2/runtimes`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFileExtension(language: string): string {
  const exts: Record<string, string> = {
    python: 'py', javascript: 'js', typescript: 'ts',
    ruby: 'rb', go: 'go', rust: 'rs', java: 'java',
    cpp: 'cpp', c: 'c',
  };
  return exts[language] ?? 'txt';
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

// Re-export for backward compat
export interface SandboxService {
  execute(code: string, language: string, userId: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}
