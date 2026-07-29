/**
 * Prompt System Types
 *
 * Defines the types for YAML-based prompt templates with i18n support.
 * Migrated from DeepTutor Python: deeptutor/services/prompt/
 *
 * DeepTutor uses YAML + Jinja2 templates. We migrate to YAML + Handlebars.
 * The {{variable}} syntax is compatible between Jinja2 and Handlebars.
 */

/** A single prompt block (section of a system prompt) */
export interface PromptBlock {
  /** Block identifier (e.g. "general", "runtime_policy", "loop", "tools") */
  id: string;
  /** The rendered text content of this block */
  content: string;
  /** Priority for ordering (lower = earlier in prompt) */
  priority: number;
  /** Whether this block is currently active */
  active: boolean;
}

/** A prompt template loaded from YAML */
export interface PromptTemplate {
  /** Template identifier (e.g. "chat_agent", "deep_solve.system") */
  id: string;
  /** The raw Handlebars template string */
  template: string;
  /** Language this template is written in */
  language: string;
  /** Metadata from the YAML frontmatter */
  metadata: Record<string, unknown>;
}

/** Prompt block ordering as defined in ChatPromptAssembler */
export const PROMPT_BLOCK_ORDER = [
  'general',           // Product identity / Partner identity
  'runtime_policy',    // Runtime policies
  'loop',              // AgentLoop cycle instructions
  'capability_blocks', // Active capability prompts (can be multiple)
  'persona_style',     // Persona/style
  'partner_turn_policy', // Partner turn policy
  'memory',            // Memory context
  'tools',             // Tool manifest (with kb_note prefix)
  'skills',            // Skill manifest
  'sources',           // Attached source manifest
  'extended_tools',    // Deferred tool manifest (DeferredToolLoader)
  'notebooks',         // Notebook manifest
  'workspace',         // Workspace notes
] as const;

export type PromptBlockId = typeof PROMPT_BLOCK_ORDER[number];

/** Options for rendering a prompt template */
export interface RenderOptions {
  /** Variables to inject into the template */
  variables?: Record<string, unknown>;
  /** Language for i18n fallback (default: "en") */
  language?: string;
}
