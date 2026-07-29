/**
 * Tool Protocol — Level 1 base classes
 *
 * Every tool (built-in or plugin) implements BaseTool.
 * Migrated from DeepTutor Python: deeptutor/core/tool_protocol.py
 */

import type { StreamEvent } from './types';

// ---------------------------------------------------------------------------
// ToolParameter — One parameter in a tool's function-calling schema
// ---------------------------------------------------------------------------

export interface ToolParameter {
  name: string;
  /** JSON Schema type: "string" | "integer" | "boolean" | "number" | "array" | "object" */
  type: string;
  description: string;
  required: boolean;
  default: unknown;
  enum: string[] | null;
  /** Inner JSON Schema for type="array" parameters */
  items: Record<string, unknown> | null;
}

export function createToolParameter(
  partial: Partial<ToolParameter> & { name: string; type: string },
): ToolParameter {
  return {
    description: '',
    required: true,
    default: null,
    enum: null,
    items: null,
    ...partial,
  };
}

/** Convert a ToolParameter to JSON Schema property dict */
export function parameterToSchema(param: ToolParameter): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: param.type,
    description: param.description,
  };
  if (param.enum) {
    schema.enum = param.enum;
  }
  if (param.type === 'array') {
    schema.items = param.items ?? { type: 'string' };
  }
  return schema;
}

// ---------------------------------------------------------------------------
// ToolDefinition — Metadata describing a tool to the LLM
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

/** Build an OpenAI-compatible function tool schema */
export function definitionToOpenAISchema(def: ToolDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const p of def.parameters) {
    properties[p.name] = parameterToSchema(p);
    if (p.required) {
      required.push(p.name);
    }
  }

  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// ToolAlias — Alternative tool name or sub-mode
// ---------------------------------------------------------------------------

export interface ToolAlias {
  name: string;
  description: string;
  inputFormat: string;
  whenToUse: string;
  phase: string;
}

// ---------------------------------------------------------------------------
// ToolPromptHints — Prompt-level guidance for when/how to use a tool
// ---------------------------------------------------------------------------

export interface ToolPromptHints {
  shortDescription: string;
  whenToUse: string;
  inputFormat: string;
  guideline: string;
  note: string;
  phase: string;
  aliases: ToolAlias[];
}

export function createToolPromptHints(
  partial: Partial<ToolPromptHints> = {},
): ToolPromptHints {
  return {
    shortDescription: '',
    whenToUse: '',
    inputFormat: '',
    guideline: '',
    note: '',
    phase: '',
    aliases: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// ToolResult — Standardised return value from a tool execution
// ---------------------------------------------------------------------------

export interface ToolResult {
  /** Text returned to the LLM as the role=tool message body */
  content: string;
  /** Citation rows surfaced through stream.sources */
  sources: Record<string, unknown>[];
  /** Free-form payload — also used for structured UI hints */
  metadata: Record<string, unknown>;
  /** False marks explicit failure; LLM can still read content (error message) */
  success: boolean;
  /** When true, agentic loop must stop after this tool */
  terminateTurn: boolean;
  /**
   * When set, chat loop pauses after this tool call, emits pending_user_input,
   * awaits user reply, then resumes. Used by ask_user.
   */
  pauseForUser: Record<string, unknown> | null;
}

export function createToolResult(
  partial: Partial<ToolResult> = {},
): ToolResult {
  return {
    content: '',
    sources: [],
    metadata: {},
    success: true,
    terminateTurn: false,
    pauseForUser: null,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// ToolEventSink — Async callback for tools to stream internal progress
// ---------------------------------------------------------------------------

export type ToolEventSink = (
  eventType: string,
  message?: string,
  metadata?: Record<string, unknown>,
) => Promise<void>;

// ---------------------------------------------------------------------------
// BaseTool — Abstract base for all tools
// ---------------------------------------------------------------------------

export abstract class BaseTool {
  /** Return the tool's metadata & parameter schema */
  abstract getDefinition(): ToolDefinition;

  /** Run the tool with the given keyword arguments */
  abstract execute(kwargs: Record<string, unknown>): Promise<ToolResult>;

  /** The tool's canonical name */
  get name(): string {
    return this.getDefinition().name;
  }

  /** Return prompt-level metadata for dynamic prompt assembly */
  getPromptHints(_language: string = 'en'): ToolPromptHints {
    const def = this.getDefinition();
    return createToolPromptHints({
      shortDescription: def.description,
    });
  }

  /** Whether this tool uses deferred loading (loaded via load_tools) */
  get deferred(): boolean {
    return false;
  }

  /** Tool aliases (alternative names for the same tool) */
  get aliases(): string[] {
    return [];
  }
}
