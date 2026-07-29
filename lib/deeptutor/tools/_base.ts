/**
 * Tool Base — Convenience re-exports for the tool layer
 *
 * Centralises the most commonly used symbols from the tool-protocol module
 * so that concrete tool implementations can import from a single location.
 */

export {
  BaseTool,
  createToolResult,
  createToolParameter,
  parameterToSchema,
  definitionToOpenAISchema,
} from '../core/tool-protocol';

export type {
  ToolResult,
  ToolDefinition,
  ToolParameter,
  ToolAlias,
  ToolPromptHints,
  ToolEventSink,
} from '../core/tool-protocol';
