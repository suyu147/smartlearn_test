/**
 * Capability Protocol — Level 2 base classes
 *
 * Capabilities are multi-step agent pipelines invoked when the user
 * selects a deep mode (e.g. Deep Solve, Deep Question).
 * Migrated from DeepTutor Python: deeptutor/core/capability_protocol.py
 */

import type { UnifiedContext, StreamEvent } from './types';
import type { BaseTool } from './tool-protocol';

// ---------------------------------------------------------------------------
// CapabilityManifest — Static metadata for a capability
// ---------------------------------------------------------------------------

export interface CapabilityManifest {
  /** Canonical name (e.g. "chat", "deep_solve", "smartlearn") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Pipeline stages in order (e.g. ["planning", "reasoning", "writing"]) */
  stages: string[];
  /** Tool names this capability may use */
  toolsUsed: string[];
  /** CLI aliases for this capability */
  cliAliases: string[];
  /** JSON Schema for the capability's request payload */
  requestSchema: Record<string, unknown>;
  /** Default config values that can be overridden per-request */
  configDefaults: Record<string, unknown>;
}

export function createCapabilityManifest(
  partial: Partial<CapabilityManifest> & { name: string; description: string },
): CapabilityManifest {
  return {
    stages: [],
    toolsUsed: [],
    cliAliases: [],
    requestSchema: {},
    configDefaults: {},
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// StreamBus — Async event bus for capabilities to emit events
// (Forward declaration; full implementation in stream-bus.ts)
// ---------------------------------------------------------------------------

export interface StreamBus {
  /** Emit a stream event */
  emit(event: StreamEvent): void;
  /** Enter a named stage (returns a disposer to end the stage) */
  enterStage(stage: string, source?: string): () => void;
}

// ---------------------------------------------------------------------------
// BaseCapability — Abstract base for all capabilities
// ---------------------------------------------------------------------------

export abstract class BaseCapability {
  abstract readonly manifest: CapabilityManifest;

  /** Execute the full capability pipeline, emitting events to stream */
  abstract run(context: UnifiedContext, stream: StreamBus): Promise<void>;

  /** The capability's canonical name */
  get name(): string {
    return this.manifest.name;
  }

  /** Pipeline stages */
  get stages(): string[] {
    return this.manifest.stages;
  }
}

// ---------------------------------------------------------------------------
// LoopCapability — Agentic loop capability (LLM → Tool → LLM cycle)
// Enhanced tool surface: adds tools on top of the base set
// ---------------------------------------------------------------------------

export interface LoopCapabilityConfig {
  /** Maximum iterations in the agent loop (default: 40) */
  maxIterations: number;
  /** Context window token budget (default: 65536) */
  contextWindowTokens: number;
  /** Temperature for LLM calls (default: 0.1) */
  temperature: number;
}

export const DEFAULT_LOOP_CONFIG: LoopCapabilityConfig = {
  maxIterations: 40,
  contextWindowTokens: 65536,
  temperature: 0.1,
};

export abstract class LoopCapability extends BaseCapability {
  /** Check if this capability is active given the current context */
  isActive(context: UnifiedContext): boolean {
    return context.activeCapability === this.name;
  }

  /** Tools owned exclusively by this capability */
  get ownedTools(): string[] {
    return [];
  }

  /** Tools that replace the entire tool surface (KnowledgeCapability only) */
  get exclusiveTools(): string[] | null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// KnowledgeCapability — Exclusive tool surface capability
// When selected, replaces the entire tool set (not enhances)
// Used by Obsidian, Subagent
// ---------------------------------------------------------------------------

export abstract class KnowledgeCapability extends LoopCapability {
  override get exclusiveTools(): string[] {
    return this.ownedTools;
  }
}

// ---------------------------------------------------------------------------
// PipelineCapability (AgentCapability) — Linear multi-stage pipeline
// Stages execute in order: A → B → C
// ---------------------------------------------------------------------------

export abstract class PipelineCapability extends BaseCapability {
  /** Execute stages in sequence */
  abstract executeStages(
    context: UnifiedContext,
    stream: StreamBus,
  ): Promise<void>;

  override async run(context: UnifiedContext, stream: StreamBus): Promise<void> {
    await this.executeStages(context, stream);
  }
}

// ---------------------------------------------------------------------------
// GraphCapability — Custom state machine with conditional edges
// Used by SmartLearn (learning-graph has cycles: evaluate → plan → generate)
// ---------------------------------------------------------------------------

export abstract class GraphCapability extends BaseCapability {
  /** Compile and return the LangGraph state graph */
  abstract compileGraph(): unknown;

  /** Invoke the compiled graph with initial state */
  abstract invoke(
    initialState: Record<string, unknown>,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}
