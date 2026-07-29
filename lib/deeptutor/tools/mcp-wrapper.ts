/**
 * MCPToolWrapper — Adapts an MCP server tool to the DeepTutor BaseTool interface.
 *
 * Each MCP tool is wrapped with:
 * - Name: mcp_{server_name}_{tool_name}
 * - Parameters: derived from the MCP tool's inputSchema
 * - Execute: delegates to MCPService.executeTool()
 *
 * Migrated from: deeptutor/tutorbot/agent/tools/mcp.py → MCPToolWrapper
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolResult,
  createToolResult,
  createToolParameter,
  type ToolParameter,
} from '@/lib/deeptutor/core/tool-protocol';
import type { MCPService, MCPToolInfo } from '@/lib/deeptutor/services/mcp';
import { createLogger } from '@/lib/logger';

const log = createLogger('MCPToolWrapper');

// ---------------------------------------------------------------------------
// Schema conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a JSON Schema property to a ToolParameter.
 */
function jsonSchemaToParameter(
  name: string,
  schema: Record<string, unknown>,
  required: boolean,
): ToolParameter {
  const type = (schema.type as string) ?? 'string';
  const description = (schema.description as string) ?? '';
  const defaultValue = schema.default ?? null;

  let paramType = 'string';
  switch (type) {
    case 'integer': paramType = 'integer'; break;
    case 'number': paramType = 'number'; break;
    case 'boolean': paramType = 'boolean'; break;
    case 'array': paramType = 'array'; break;
    case 'object': paramType = 'object'; break;
    default: paramType = 'string'; break;
  }

  return createToolParameter({
    name,
    type: paramType,
    description,
    required,
    default: defaultValue,
    enum: (schema.enum as string[]) ?? null,
    items: (type === 'array' && schema.items) ? (schema.items as Record<string, unknown>) : null,
  });
}

/**
 * Convert a JSON Schema to an array of ToolParameters.
 */
function jsonSchemaToParameters(inputSchema: Record<string, unknown>): ToolParameter[] {
  const properties = (inputSchema.properties as Record<string, Record<string, unknown>>) ?? {};
  const requiredFields = new Set((inputSchema.required as string[]) ?? []);

  return Object.entries(properties).map(([name, schema]) =>
    jsonSchemaToParameter(name, schema, requiredFields.has(name)),
  );
}

// ---------------------------------------------------------------------------
// MCPToolWrapper
// ---------------------------------------------------------------------------

export class MCPToolWrapper extends BaseTool {
  private toolInfo: MCPToolInfo;
  private mcpService: MCPService;
  private _parameters: ToolParameter[];

  constructor(toolInfo: MCPToolInfo, mcpService: MCPService) {
    super();
    this.toolInfo = toolInfo;
    this.mcpService = mcpService;
    this._parameters = jsonSchemaToParameters(toolInfo.inputSchema);
  }

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.toolInfo.description || `MCP tool: ${this.toolInfo.name} (server: ${this.toolInfo.serverName})`,
      parameters: this._parameters,
    };
  }

  /** Tool name follows convention: mcp_{server}_{tool} */
  get name(): string {
    return `mcp_${this.toolInfo.serverName}_${this.toolInfo.name}`;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    log.debug(`Executing MCP tool: ${this.toolInfo.serverName}/${this.toolInfo.name}`);

    const result = await this.mcpService.executeTool(
      this.toolInfo.serverName,
      this.toolInfo.name,
      args,
    );

    return createToolResult({
      content: result,
      success: !result.startsWith('[MCP Error'),
    });
  }
}
