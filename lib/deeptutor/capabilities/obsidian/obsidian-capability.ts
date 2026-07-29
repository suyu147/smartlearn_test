/**
 * ObsidianCapability — Knowledge vault exploration via Obsidian.
 *
 * KnowledgeCapability: when selected, replaces the ENTIRE tool surface
 * with the 9 obsidian_* tools (not an augmentation).
 *
 * Uses the agent loop with obsidian-only tools for vault exploration.
 *
 * Migrated from: planned feature (not in DeepTutor Python source)
 */

import {
  KnowledgeCapability,
  createCapabilityManifest,
  DEFAULT_LOOP_CONFIG,
} from '@/lib/deeptutor/core/capability-protocol';
import type { StreamBus } from '@/lib/deeptutor/core/capability-protocol';
import type { UnifiedContext } from '@/lib/deeptutor/core/types';
import { runAgentLoop, toAISDKTools } from '@/lib/deeptutor/core/agent-loop';
import type { AgentLoopConfig, AgentLoopResult } from '@/lib/deeptutor/core/agent-loop';
import { ToolRegistry } from '@/lib/deeptutor/tools/registry';
import { StreamBusImpl } from '@/lib/deeptutor/core/stream-bus';
import { guardContextWindow } from '../chat/context-guard';
import { cleanThinkingTags } from '../chat/think-filter';
import { resolveModel } from '@/lib/server/resolve-model';
import { getModel } from '@/lib/ai/providers';
import { createLogger } from '@/lib/logger';

import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from '@langchain/core/messages';

import type { ProviderId } from '@/lib/types/provider';

const log = createLogger('ObsidianCapability');

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const OBSIDIAN_SYSTEM_PROMPT = `You are a knowledge exploration assistant with access to the user's Obsidian vault.

Your vault is a personal knowledge base containing interconnected notes. You can:
- Search across all notes for specific information
- Read individual notes in full
- List notes by folder or across the vault
- Find backlinks (which notes reference a given note)
- Extract outgoing links from notes
- Browse and search tags
- Create new notes with structured content
- Append content to existing notes
- Manage note properties (YAML frontmatter)

Guidelines:
1. Start broad: use obsidian_search or obsidian_tags to understand what's in the vault
2. Follow links: when you find a relevant note, check its links and backlinks
3. Be thorough: explore related notes to build a comprehensive answer
4. Cite sources: always mention which notes your information comes from
5. Suggest connections: if you notice related notes that aren't linked, mention this`;

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

export class ObsidianCapability extends KnowledgeCapability {
  readonly manifest = createCapabilityManifest({
    name: 'obsidian',
    description: 'Obsidian 知识库探索 — 9 个专属工具',
    stages: ['exploring'],
    toolsUsed: [
      'obsidian_search',
      'obsidian_read',
      'obsidian_list',
      'obsidian_backlinks',
      'obsidian_links',
      'obsidian_tags',
      'obsidian_create_note',
      'obsidian_append',
      'obsidian_set_property',
    ],
    cliAliases: ['obsidian', 'vault', 'notes'],
  });

  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    super();
    this.toolRegistry = toolRegistry;
  }

  override get ownedTools(): string[] {
    return this.manifest.toolsUsed;
  }

  async run(context: UnifiedContext, stream: StreamBus): Promise<void> {
    const bus = stream as StreamBusImpl;
    const config = { ...DEFAULT_LOOP_CONFIG, ...context.configOverrides };

    log.info(`Obsidian capability started: query="${context.userMessage.slice(0, 50)}..."`);

    const endStage = bus.enterStage('exploring', 'obsidian');

    try {
      // Build messages
      const messages: BaseMessage[] = [
        new SystemMessage(OBSIDIAN_SYSTEM_PROMPT),
      ];

      // Add conversation history (truncated to fit context window)
      if (context.conversationHistory && context.conversationHistory.length > 0) {
        for (const msg of context.conversationHistory) {
          const role = msg.role as string;
          const content = msg.content as string;
          if (role === 'user') {
            messages.push(new HumanMessage(content));
          } else if (role === 'assistant') {
            messages.push(new AIMessage(content));
          }
        }
      }

      // Add current query
      messages.push(new HumanMessage(context.userMessage));

      // Apply context window guard
      const guarded = guardContextWindow(messages, config.contextWindowTokens);

      // Get obsidian tools from registry
      const toolDefinitions = this.manifest.toolsUsed
        .map((name) => {
          const tool = this.toolRegistry.get(name);
          return tool ? tool.getDefinition() : null;
        })
        .filter((d): d is NonNullable<typeof d> => d != null);

      const tools = toAISDKTools(toolDefinitions);

      // Resolve model
      const overrides = context.configOverrides ?? {};
      const meta = context.metadata ?? {};
      const providerId = (overrides.providerId as ProviderId) || (meta.providerId as ProviderId) || (process.env.DT_DEFAULT_PROVIDER as ProviderId) || (process.env.AI_PROVIDER as ProviderId);
      const modelId = (overrides.modelId as string) || (meta.modelId as string) || process.env.DT_DEFAULT_MODEL || process.env.AI_MODEL || '';
      const apiKey = (overrides.apiKey as string) || (meta.apiKey as string) || process.env.DT_DEFAULT_API_KEY || process.env.AI_API_KEY || undefined;
      const { model } = getModel({ providerId, modelId, apiKey });

      // Run agent loop
      const loopConfig: AgentLoopConfig = {
        model,
        tools,
        toolRegistry: this.toolRegistry,
        maxIterations: config.maxIterations,
        temperature: config.temperature,
        streamCallback: (event) => bus.emit(event),
        sessionId: context.sessionId,
      };

      const result: AgentLoopResult = await runAgentLoop(loopConfig, guarded);

      // Emit final content
      const finalContent = cleanThinkingTags(result.text);

      bus.emitContent(finalContent, 'obsidian');

      endStage();
      log.info('Obsidian capability completed successfully');
    } catch (err) {
      endStage();
      log.error('Obsidian capability failed:', err);
      bus.emitError(`Obsidian 探索失败: ${err instanceof Error ? err.message : String(err)}`, 'obsidian');
    }
  }
}
