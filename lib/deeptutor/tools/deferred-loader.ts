/**
 * DeferredToolLoader — Lazy tool loading mechanism
 *
 * Some tools are not registered at startup but can be loaded on demand.
 * The LLM calls load_tools to inject additional tool schemas into the
 * current turn's tool set.
 *
 * Deferred tools are registered with `deferred: true` in the ToolRegistry.
 * They are available for loading but not included in the default tool set.
 *
 * The load_tools tool itself is always available.
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
import type { ToolRegistry } from '@/lib/deeptutor/tools/registry';
import { createLogger } from '@/lib/logger';

const log = createLogger('DeferredLoader');

// ---------------------------------------------------------------------------
// Deferred tool catalog — tools that can be loaded on demand
// ---------------------------------------------------------------------------

export interface DeferredToolEntry {
  name: string;
  description: string;
  category: string;
}

const DEFERRED_TOOL_CATALOG: DeferredToolEntry[] = [
  { name: 'paper_search', description: 'Search academic papers and research publications.', category: 'research' },
  { name: 'code_execution', description: 'Execute code in a sandboxed environment for calculations and analysis.', category: 'execution' },
  { name: 'exec', description: 'Run restricted shell commands (file management, system info).', category: 'execution' },
];

// Module-level state: which deferred tools are loaded for the current turn
let _loadedDeferredTools: Set<string> = new Set();

export function getLoadedDeferredTools(): Set<string> {
  return _loadedDeferredTools;
}

export function resetLoadedDeferredTools(): void {
  _loadedDeferredTools = new Set();
}

// ---------------------------------------------------------------------------
// LoadToolsTool
// ---------------------------------------------------------------------------

export class LoadToolsTool extends BaseTool {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    super();
    this.registry = registry;
  }

  getDefinition(): ToolDefinition {
    return {
      name: 'load_tools',
      description: 'Load additional tools that are not available by default. Use this when you need specialized tools for specific tasks.',
      parameters: [
        createToolParameter({
          name: 'tool_names',
          type: 'array',
          description: 'Names of tools to load. Available: paper_search, code_execution, exec.',
          required: true,
          items: { type: 'string' },
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Load additional specialized tools.',
      whenToUse: 'When you need tools that are not in your default set — for code execution, paper search, or shell commands.',
      inputFormat: 'tool_names: array of tool names from the available catalog',
      guideline: 'Load only the tools you actually need. Each loaded tool adds to the system prompt size.',
      phase: 'setup',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const toolNames = kwargs.tool_names as string[];

    if (!Array.isArray(toolNames) || toolNames.length === 0) {
      return createToolResult({
        content: 'Error: tool_names must be a non-empty array.',
        success: false,
      });
    }

    const loaded: string[] = [];
    const notFound: string[] = [];
    const alreadyLoaded: string[] = [];

    for (const name of toolNames) {
      if (_loadedDeferredTools.has(name)) {
        alreadyLoaded.push(name);
        continue;
      }

      const catalogEntry = DEFERRED_TOOL_CATALOG.find((e) => e.name === name);
      if (!catalogEntry) {
        notFound.push(name);
        continue;
      }

      // Check if the tool is actually registered in the registry
      if (this.registry.has(name)) {
        _loadedDeferredTools.add(name);
        loaded.push(name);
      } else {
        notFound.push(name);
      }
    }

    const parts: string[] = [];

    if (loaded.length > 0) {
      parts.push(`Loaded: ${loaded.join(', ')}. These tools are now available for use.`);
    }
    if (alreadyLoaded.length > 0) {
      parts.push(`Already loaded: ${alreadyLoaded.join(', ')}.`);
    }
    if (notFound.length > 0) {
      parts.push(`Not found: ${notFound.join(', ')}. Available tools: ${DEFERRED_TOOL_CATALOG.map((e) => e.name).join(', ')}.`);
    }

    return createToolResult({
      content: parts.join('\n'),
      metadata: {
        loaded,
        already_loaded: alreadyLoaded,
        not_found: notFound,
        all_loaded: Array.from(_loadedDeferredTools),
      },
    });
  }
}
