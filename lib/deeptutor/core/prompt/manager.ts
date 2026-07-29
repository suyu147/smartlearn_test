/**
 * PromptManager — Load, cache, and render prompt templates with i18n fallback
 *
 * Migrated from DeepTutor Python: deeptutor/services/prompt/manager.py
 *
 * Features:
 * - Load YAML templates from disk (Phase 0: in-memory registration)
 * - Render with Handlebars-compatible syntax
 * - i18n fallback: requested language → en → default
 * - Template caching
 */

import type { PromptTemplate, PromptBlock, RenderOptions, PromptBlockId } from './types';
import { PROMPT_BLOCK_ORDER } from './types';
import { renderTemplate } from './renderer';

export class PromptManager {
  /** Template storage: Map<language, Map<templateId, PromptTemplate>> */
  private templates = new Map<string, Map<string, PromptTemplate>>();

  /** Rendered template cache: Map<cacheKey, string> */
  private cache = new Map<string, string>();

  /**
   * Register a prompt template.
   * In Phase 0, templates are registered in-memory.
   * Later phases will load from YAML files on disk.
   */
  register(template: PromptTemplate): void {
    const lang = template.language || 'en';
    if (!this.templates.has(lang)) {
      this.templates.set(lang, new Map());
    }
    this.templates.get(lang)!.set(template.id, template);
    // Invalidate cache for this template
    this.invalidateCache(template.id);
  }

  /**
   * Render a template by ID with i18n fallback.
   * Fallback chain: requested language → "en" → first available.
   */
  render(templateId: string, options: RenderOptions = {}): string {
    const language = options.language || 'en';
    const variables = options.variables || {};
    const cacheKey = `${templateId}:${language}:${JSON.stringify(variables)}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    // Find template with i18n fallback
    const template = this.resolveTemplate(templateId, language);
    if (!template) {
      return '';
    }

    // Render
    const rendered = renderTemplate(template.template, variables);

    // Cache and return
    this.cache.set(cacheKey, rendered);
    return rendered;
  }

  /**
   * Check if a template exists for the given language (with fallback).
   */
  has(templateId: string, language: string = 'en'): boolean {
    return this.resolveTemplate(templateId, language) !== null;
  }

  /**
   * Build prompt blocks in the correct order.
   * Used by ChatPromptAssembler to construct the system prompt.
   */
  buildBlocks(
    blockIds: PromptBlockId[],
    variables: Record<string, unknown> = {},
    language: string = 'en',
  ): PromptBlock[] {
    const blocks: PromptBlock[] = [];
    const orderMap = new Map(PROMPT_BLOCK_ORDER.map((id, idx) => [id, idx]));

    for (const blockId of blockIds) {
      const content = this.render(blockId, { variables, language });
      if (content) {
        blocks.push({
          id: blockId,
          content,
          priority: orderMap.get(blockId) ?? 999,
          active: true,
        });
      }
    }

    // Sort by priority
    blocks.sort((a, b) => a.priority - b.priority);
    return blocks;
  }

  /**
   * Assemble blocks into a single system prompt string.
   * Blocks are joined with "\n\n---\n\n" separator.
   */
  assembleSystemPrompt(blocks: PromptBlock[]): string {
    return blocks
      .filter((b) => b.active)
      .map((b) => b.content)
      .join('\n\n---\n\n');
  }

  /** Clear the render cache */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get all registered template IDs for a given language */
  listTemplates(language: string = 'en'): string[] {
    const langTemplates = this.templates.get(language);
    return langTemplates ? Array.from(langTemplates.keys()) : [];
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private resolveTemplate(
    templateId: string,
    language: string,
  ): PromptTemplate | null {
    // Try requested language
    const langTemplates = this.templates.get(language);
    if (langTemplates?.has(templateId)) {
      return langTemplates.get(templateId)!;
    }

    // Fallback to "en"
    if (language !== 'en') {
      const enTemplates = this.templates.get('en');
      if (enTemplates?.has(templateId)) {
        return enTemplates.get(templateId)!;
      }
    }

    // Fallback to first available language
    for (const [, langMap] of this.templates) {
      if (langMap.has(templateId)) {
        return langMap.get(templateId)!;
      }
    }

    return null;
  }

  private invalidateCache(templateId: string): void {
    for (const [key] of this.cache) {
      if (key.startsWith(`${templateId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}

// Module-level singleton
let globalPromptManager: PromptManager | null = null;

export function getPromptManager(): PromptManager {
  if (!globalPromptManager) {
    globalPromptManager = new PromptManager();
  }
  return globalPromptManager;
}
