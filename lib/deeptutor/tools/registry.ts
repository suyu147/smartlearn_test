/**
 * ToolRegistry — Central registry for all available tools
 *
 * Manages tool registration, alias resolution, and OpenAI function-schema
 * generation. The agent loop resolves tools through this registry rather
 * than importing concrete tool classes directly.
 */

import { BaseTool, definitionToOpenAISchema } from '../core/tool-protocol';
import type { ToolResult } from '../core/tool-protocol';

// ---------------------------------------------------------------------------
// Alias entry
// ---------------------------------------------------------------------------

interface AliasEntry {
  target: string;
  kwargs: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();
  private aliases: Map<string, AliasEntry> = new Map();

  // ---- registration -------------------------------------------------------

  /** Register a tool instance under its canonical name. */
  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  /** Remove a tool by name. */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  // ---- alias support ------------------------------------------------------

  /**
   * Register an alias that redirects to an existing tool.
   *
   * @param alias      — The alternative name callers may use.
   * @param targetName — The canonical tool name the alias resolves to.
   * @param kwargs     — Optional default kwargs merged into every call through this alias.
   */
  registerAlias(
    alias: string,
    targetName: string,
    kwargs: Record<string, unknown> = {},
  ): void {
    this.aliases.set(alias, { target: targetName, kwargs });
  }

  // ---- lookup -------------------------------------------------------------

  /** Look up a tool by its canonical name (does **not** resolve aliases). */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /** Check whether a tool with the given canonical name is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Return all registered tools. */
  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  // ---- schema generation --------------------------------------------------

  /**
   * Return OpenAI-compatible function schemas for every registered tool.
   * Suitable for passing directly to the `tools` parameter of an LLM request.
   */
  getDefinitions(): Record<string, unknown>[] {
    return this.getAll().map((tool) =>
      definitionToOpenAISchema(tool.getDefinition()),
    );
  }

  // ---- execution ----------------------------------------------------------

  /**
   * Resolve (including alias lookup) and execute a tool.
   *
   * When the `name` matches a registered alias, the alias's default kwargs
   * are merged under the caller-supplied params (caller wins on conflict).
   *
   * @throws Error if neither a tool nor an alias with `name` exists.
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    // Check aliases first
    const aliasEntry = this.aliases.get(name);
    let resolvedName = name;
    let resolvedParams = params;

    if (aliasEntry) {
      resolvedName = aliasEntry.target;
      // Alias defaults are overridden by caller-supplied params
      resolvedParams = { ...aliasEntry.kwargs, ...params };
    }

    const tool = this.tools.get(resolvedName);
    if (!tool) {
      throw new Error(
        `Tool not found: "${name}"` +
          (aliasEntry ? ` (alias target: "${resolvedName}")` : ''),
      );
    }

    return tool.execute(resolvedParams);
  }
}
