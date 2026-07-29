import 'ai';

declare module 'ai' {
  interface ToolUIPart {
    type: 'tool-invocation';
    state:
      | 'input-streaming'
      | 'input-available'
      | 'output-available'
      | 'output-error'
      | 'approval-requested'
      | 'approval-responded'
      | 'output-denied';
    input: Record<string, unknown>;
    output: unknown;
    errorText?: string;
  }
}
