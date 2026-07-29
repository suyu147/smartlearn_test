/**
 * MockTool — Lightweight stand-in for Phase 0 testing and validation
 *
 * Records the tool name and kwargs so integration tests can verify that
 * the registry, composition, and agent-loop plumbing work correctly before
 * real tool implementations are wired up.
 */

import {
  BaseTool,
  createToolResult,
  createToolParameter,
} from '../core/tool-protocol';
import type { ToolDefinition, ToolParameter, ToolResult } from '../core/tool-protocol';

export class MockTool extends BaseTool {
  private readonly _name: string;
  private readonly _description: string;
  private readonly _parameters: ToolParameter[];

  constructor(
    name: string,
    description: string,
    parameters?: Partial<ToolParameter>[],
  ) {
    super();
    this._name = name;
    this._description = description;
    this._parameters = (parameters ?? []).map((p) =>
      createToolParameter({ name: p.name ?? 'arg', type: p.type ?? 'string', ...p }),
    );
  }

  getDefinition(): ToolDefinition {
    return {
      name: this._name,
      description: this._description,
      parameters: this._parameters,
    };
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    return createToolResult({
      content: `mock: ${this._name}(${JSON.stringify(kwargs)})`,
    });
  }
}

export default MockTool;
