/**
 * Prompt Assembler — Build the chat system prompt from the canonical
 * 13-block PROMPT_BLOCK_ORDER structure defined in types.ts.
 *
 * Based on DeepTutor's 13-block prompt structure in
 * deeptutor/services/prompt/blocks.py. Each block is an independent
 * string that is conditionally included based on the PromptContext.
 *
 * Block order:
 *   general → runtime_policy → loop → capability_blocks → persona_style →
 *   partner_turn_policy → memory → tools → skills → sources →
 *   extended_tools → notebooks → workspace
 */

import {
  PROMPT_BLOCK_ORDER,
  type PromptBlock,
  type PromptBlockId,
} from '@/lib/deeptutor/core/prompt/types';

// ---------------------------------------------------------------------------
// PromptContext — Inputs to prompt assembly
// ---------------------------------------------------------------------------

export interface PromptContext {
  /** UI / response language (e.g. "en", "zh", "ja") */
  language: string;
  /** Names of tools available to the model */
  enabledTools: string[];
  /** Knowledge base names attached for RAG */
  knowledgeBases?: string[];
  /** Memory snapshot text injected into the system prompt */
  memoryContext?: string;
  /** Active skill instructions injected into the system prompt */
  skillsContext?: string;
  /** Plain-text manifest of attached sources */
  sourceManifest?: string;
  /** Dynamic capability prompt (e.g. active module-specific instructions) */
  capabilityPrompt?: string;
  /** Persona / communication style (e.g. "friendly", "academic", "concise") */
  personaStyle?: string;
  /** Names of deferred tools loaded lazily via DeferredToolLoader */
  deferredTools?: string[];
  /** Notebook manifest text describing user's available notebooks */
  notebookManifest?: string;
  /** Workspace-level notes or context injected at the end of the prompt */
  workspaceNotes?: string;
}

// ---------------------------------------------------------------------------
// Block separator
// ---------------------------------------------------------------------------

const BLOCK_SEPARATOR = '\n\n---\n\n';

// ---------------------------------------------------------------------------
// Block content builders
// ---------------------------------------------------------------------------

/**
 * general — Product identity.
 * Establishes who the assistant is at the product level.
 */
function buildGeneralBlock(): string {
  return `You are SmartLearn AI, an intelligent multi-agent learning assistant built to help users learn, explore, and create. You combine deep knowledge across domains with practical tool usage to deliver personalized, adaptive learning experiences.`;
}

/**
 * runtime_policy — Runtime constraints and behavioral guidelines.
 * Absorbs the former BEHAVIOR_BLOCK and FORMAT_BLOCK, adds date/time awareness
 * and the language instruction.
 */
function buildRuntimePolicyBlock(context: PromptContext): string {
  const lines: string[] = [
    'Guidelines:',
    '- Be concise but thorough',
    '- Use tools when they add value, not for simple questions',
    "- If you're unsure, say so rather than guessing",
    '- Cite sources when using web_fetch or web_search results',
    '- Think step by step for complex problems',
    '',
    'Response format:',
    '- Use Markdown for formatting when helpful',
    '- Use code blocks for code examples',
    '- Keep responses focused and well-structured',
  ];

  // Language instruction
  if (context.language && context.language !== 'en') {
    lines.push('', `Please respond in ${context.language}.`);
  }

  // Date/time awareness
  const now = new Date();
  lines.push(
    '',
    `Current date and time: ${now.toISOString()}`,
  );

  return lines.join('\n');
}

/**
 * loop — AgentLoop cycle instructions.
 * Describes the think → tool → respond agentic loop.
 */
function buildLoopBlock(): string {
  return [
    'You operate in an agentic loop:',
    '1. **Think** — Analyze the user\'s request, break it into steps, and plan your approach.',
    '2. **Use Tools** — When a tool can help answer the user\'s question better, use it. Always use the exact tool name and provide all required parameters.',
    '3. **Respond** — Synthesize your findings into a clear, well-structured response.',
    '',
    'Repeat this cycle as needed for multi-step tasks. After each tool call, reflect on the result before proceeding.',
  ].join('\n');
}

/**
 * capability_blocks — Dynamic capability-specific prompts.
 * Injected when the system activates a particular capability module.
 */
function buildCapabilityBlock(capabilityPrompt: string): string {
  return capabilityPrompt;
}

/**
 * persona_style — Communication style directive.
 */
function buildPersonaStyleBlock(style: string): string {
  return `Adopt a ${style} communication style. Adjust your tone, vocabulary, and level of detail to match this style while remaining helpful and accurate.`;
}

/**
 * partner_turn_policy — Rules governing partner/turn-taking behavior.
 * Currently a placeholder; populated by higher-level orchestration when needed.
 */
function buildPartnerTurnPolicyBlock(): string {
  // Intentionally empty — activated by conversation orchestration layer
  return '';
}

/**
 * memory — User memory context from long-term memory store.
 * Includes a gentle nudge to use write_memory when appropriate.
 */
function buildMemoryBlock(memoryContext: string): string {
  const parts: string[] = [`User memory context:\n${memoryContext}`];

  // Gentle guidance for write_memory usage
  if (memoryContext.trim()) {
    parts.push(
      '[Memory hint] The above is the user\'s existing memory. If the user expresses new learning preferences, habits, or long-term goals in this conversation, use the write_memory tool to save them.',
    );
  } else {
    parts.push(
      '[Memory hint] This is the user\'s first conversation with memory. If the user shares learning preferences (preferred style, topics of interest, learning goals), use the write_memory tool to record them.',
    );
  }

  return parts.join('\n\n');
}

/**
 * tools — Tool manifest and knowledge base note.
 * Lists available tools and any attached knowledge bases.
 * When knowledge bases are attached, provides explicit instructions
 * for when and how to use the rag tool (proactive RAG guidance).
 */
function buildToolsBlock(context: PromptContext): string {
  const parts: string[] = [];

  // Knowledge base prefix note — proactive RAG guidance
  if (context.knowledgeBases && context.knowledgeBases.length > 0) {
    parts.push(
      `Knowledge bases attached: ${context.knowledgeBases.join(', ')}`,
      'IMPORTANT: You MUST use the rag tool to search knowledge bases when:',
      '- The user asks questions about topics covered in their documents',
      '- The user references specific content that might be in their knowledge bases',
      '- You need factual data, definitions, or detailed information to answer accurately',
      'Do NOT rely solely on your training data when relevant knowledge base content may exist. Always search first.',
      `To search: call the rag tool with query=<search terms> and kb_name=<one of: ${context.knowledgeBases.join(', ')}>`,
    );
  }

  // Tool list
  if (context.enabledTools.length > 0) {
    parts.push(
      `Available tools:\n${context.enabledTools.map((t) => `- ${t}`).join('\n')}`,
    );
  }

  return parts.join('\n\n');
}

/**
 * skills — Active skill instructions.
 */
function buildSkillsBlock(skillsContext: string): string {
  return `Active skills:\n${skillsContext}`;
}

/**
 * sources — Attached source manifest for RAG / document grounding.
 */
function buildSourcesBlock(sourceManifest: string): string {
  return `Attached sources:\n${sourceManifest}`;
}

/**
 * extended_tools — Deferred tool manifest.
 * Lists tools that can be loaded on-demand via DeferredToolLoader.
 */
function buildExtendedToolsBlock(deferredTools: string[]): string {
  if (deferredTools.length === 0) return '';
  return [
    'Extended tools (available on demand):',
    ...deferredTools.map((t) => `- ${t} (deferred — request to activate)`),
  ].join('\n');
}

/**
 * notebooks — Notebook manifest describing user's available notebooks.
 */
function buildNotebooksBlock(notebookManifest: string): string {
  return notebookManifest;
}

/**
 * workspace — Workspace-level notes and context.
 */
function buildWorkspaceBlock(workspaceNotes: string): string {
  return `Workspace notes:\n${workspaceNotes}`;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Build a PromptBlock entry for a given block ID.
 *
 * @param id - One of the canonical block IDs from PROMPT_BLOCK_ORDER
 * @param content - The rendered text content (empty string = inactive)
 * @returns A PromptBlock with priority derived from PROMPT_BLOCK_ORDER
 */
function makeBlock(id: PromptBlockId, content: string): PromptBlock {
  const priority = PROMPT_BLOCK_ORDER.indexOf(id);
  return {
    id,
    content,
    priority: priority === -1 ? 999 : priority,
    active: content.length > 0,
  };
}

/**
 * Assemble the complete system prompt from context using the canonical
 * 13-block structure.
 *
 * 1. Build a PromptBlock[] with one entry per block ID
 * 2. Each block has: id, content, priority (index in PROMPT_BLOCK_ORDER),
 *    active (true if content is non-empty)
 * 3. Filter to active blocks only, sort by priority, join with separator
 */
export function assembleSystemPrompt(context: PromptContext): string {
  const blocks: PromptBlock[] = [
    makeBlock('general', buildGeneralBlock()),
    makeBlock('runtime_policy', buildRuntimePolicyBlock(context)),
    makeBlock('loop', buildLoopBlock()),
    makeBlock(
      'capability_blocks',
      context.capabilityPrompt
        ? buildCapabilityBlock(context.capabilityPrompt)
        : '',
    ),
    makeBlock(
      'persona_style',
      context.personaStyle
        ? buildPersonaStyleBlock(context.personaStyle)
        : '',
    ),
    makeBlock('partner_turn_policy', buildPartnerTurnPolicyBlock()),
    makeBlock(
      'memory',
      context.memoryContext
        ? buildMemoryBlock(context.memoryContext)
        : '',
    ),
    makeBlock('tools', buildToolsBlock(context)),
    makeBlock(
      'skills',
      context.skillsContext
        ? buildSkillsBlock(context.skillsContext)
        : '',
    ),
    makeBlock(
      'sources',
      context.sourceManifest
        ? buildSourcesBlock(context.sourceManifest)
        : '',
    ),
    makeBlock(
      'extended_tools',
      context.deferredTools && context.deferredTools.length > 0
        ? buildExtendedToolsBlock(context.deferredTools)
        : '',
    ),
    makeBlock(
      'notebooks',
      context.notebookManifest
        ? buildNotebooksBlock(context.notebookManifest)
        : '',
    ),
    makeBlock(
      'workspace',
      context.workspaceNotes
        ? buildWorkspaceBlock(context.workspaceNotes)
        : '',
    ),
  ];

  // Filter to active blocks, sort by priority, join with separator
  return blocks
    .filter((b) => b.active)
    .sort((a, b) => a.priority - b.priority)
    .map((b) => b.content)
    .join(BLOCK_SEPARATOR);
}
