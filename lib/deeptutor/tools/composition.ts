/**
 * ToolComposition — Four-layer tool mounting strategy
 *
 * Layer 1: User-toggled tools (brainstorm, web_search, paper_search, reason, code_execution)
 * Layer 2: Context-auto tools (rag, read_source, read_memory, write_memory, etc.)
 * Layer 3: Capability-specific tools (solve_*, mastery_*, obsidian_*)
 * Layer 4: Partner-specific tools (partner_read, partner_memorize, partner_search) — deferred
 */

import { ToolRegistry } from './registry';
import { definitionToOpenAISchema } from '../core/tool-protocol';
import type { BaseTool } from '../core/tool-protocol';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ToolCompositionOptions {
  /** Tool names the user has explicitly toggled on */
  userEnabledTools?: string[];
  /** Tool names the user has explicitly toggled off */
  userDisabledTools?: string[];
  /** Capability name for layer 3 tools */
  activeCapability?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tools that are always available regardless of user preferences. */
const CONTEXT_AUTO_TOOLS: readonly string[] = [
  'rag',
  'read_source',
  'read_memory',
  'write_memory',
  'list_notebook',
  'write_note',
  'web_fetch',
  'ask_user',
];

/** Tools the user may toggle on or off via the UI. */
const DEFAULT_TOGGLEABLE_TOOLS: readonly string[] = [
  'brainstorm',
  'web_search',
  'paper_search',
  'reason',
  'code_execution',
];

// ---------------------------------------------------------------------------
// ToolComposition
// ---------------------------------------------------------------------------

export class ToolComposition {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Build the final set of tool definitions for a turn.
   * Applies the four-layer mounting strategy.
   */
  buildToolSet(options: ToolCompositionOptions = {}): BaseTool[] {
    const tools: BaseTool[] = [];
    const seen = new Set<string>();

    const addTool = (name: string): void => {
      if (seen.has(name)) return;
      const tool = this.registry.get(name);
      if (tool) {
        tools.push(tool);
        seen.add(name);
      }
    };

    // Layer 2: Context-auto tools (always available)
    for (const name of CONTEXT_AUTO_TOOLS) {
      addTool(name);
    }

    // Layer 1: User-toggled tools
    const enabledSet = options.userEnabledTools
      ? new Set(options.userEnabledTools)
      : new Set(DEFAULT_TOGGLEABLE_TOOLS);
    const disabledSet = new Set(options.userDisabledTools ?? []);

    for (const name of DEFAULT_TOGGLEABLE_TOOLS) {
      if (enabledSet.has(name) && !disabledSet.has(name)) {
        addTool(name);
      }
    }

    // Layer 3: Capability-specific tools (resolved by registry)
    // These are registered with the capability and mounted when active.
    // (Implementation depends on CapabilityRegistry integration — deferred to Phase 2a)

    // Layer 4: Partner-specific tools (deferred to Phase 5+)

    return tools;
  }

  /** Get OpenAI function schemas for the composed tool set. */
  buildSchemas(options: ToolCompositionOptions = {}): Record<string, unknown>[] {
    return this.buildToolSet(options).map((tool) =>
      definitionToOpenAISchema(tool.getDefinition()),
    );
  }
}
