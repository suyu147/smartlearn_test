/**
 * SectionArchitect — Stage 3: Plan which blocks to generate for a page
 *
 * Ported from DeepTutor Python deeptutor/book/agents/page_planner.py.
 * LLM-first planner with static template fallback.
 */

import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
import type { Chapter, ContentType, BlockType } from '../models';
import { resolveApiKey, resolveProviderId, resolveModelId, resolveBaseUrl } from '@/lib/server/resolve-model';

const log = createLogger('SectionArchitect');

// ---------------------------------------------------------------------------
// Block plan entry
// ---------------------------------------------------------------------------

export interface BlockPlan {
  type: BlockType;
  focus: string;
  transitionIn?: string;
  params: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Static templates by ContentType (fallback when LLM unavailable)
// ---------------------------------------------------------------------------

const TEMPLATES: Record<ContentType, BlockPlan[]> = {
  overview: [
    { type: 'text', focus: 'Chapter overview and learning goals', params: {} },
    { type: 'concept_graph', focus: 'Key concept relationships', params: {} },
    { type: 'section', focus: 'Core concepts', params: { depth: 'introductory' } },
    { type: 'callout', focus: 'Key takeaway', params: { calloutType: 'summary' } },
    { type: 'quiz', focus: 'Comprehension check', params: { difficulty: 'easy' } },
  ],
  theory: [
    { type: 'section', focus: 'Theoretical foundations', params: { depth: 'detailed' } },
    { type: 'callout', focus: 'Key definition', params: { calloutType: 'key_idea' } },
    { type: 'code', focus: 'Implementation example', params: {} },
    { type: 'text', focus: 'Implications and applications', params: {} },
    { type: 'quiz', focus: 'Understanding check', params: { difficulty: 'medium' } },
  ],
  derivation: [
    { type: 'section', focus: 'Derivation steps', params: { depth: 'step-by-step' } },
    { type: 'callout', focus: 'Key assumption', params: { calloutType: 'pitfall' } },
    { type: 'code', focus: 'Verification code', params: {} },
    { type: 'text', focus: 'Geometric interpretation', params: {} },
    { type: 'quiz', focus: 'Application problem', params: { difficulty: 'hard' } },
  ],
  history: [
    { type: 'timeline', focus: 'Historical timeline', params: {} },
    { type: 'section', focus: 'Key developments', params: { depth: 'narrative' } },
    { type: 'text', focus: 'Modern relevance', params: {} },
    { type: 'callout', focus: 'Interesting fact', params: { calloutType: 'tip' } },
    { type: 'quiz', focus: 'Knowledge check', params: { difficulty: 'easy' } },
  ],
  practice: [
    { type: 'text', focus: 'Problem-solving strategy', params: {} },
    { type: 'code', focus: 'Worked example', params: {} },
    { type: 'section', focus: 'Practice problems', params: { depth: 'hands-on' } },
    { type: 'callout', focus: 'Common mistake', params: { calloutType: 'pitfall' } },
    { type: 'quiz', focus: 'Challenge problem', params: { difficulty: 'hard' } },
    { type: 'flash_cards', focus: 'Key formulas', params: {} },
  ],
  concept: [
    { type: 'section', focus: 'Core concept explanation', params: { depth: 'balanced' } },
    { type: 'callout', focus: 'Key idea', params: { calloutType: 'key_idea' } },
    { type: 'code', focus: 'Code illustration', params: {} },
    { type: 'text', focus: 'Connections and applications', params: {} },
    { type: 'quiz', focus: 'Concept check', params: { difficulty: 'medium' } },
  ],
};

// ---------------------------------------------------------------------------
// LLM system prompt
// ---------------------------------------------------------------------------

const ARCHITECT_SYSTEM = `You are a Section Architect who designs the block structure of an educational page.

Given a chapter title, content type, and learning objectives, plan the blocks that will make up this page.

Output ONLY a JSON array of block plans:
[
  {
    "type": "text" | "section" | "callout" | "quiz" | "code" | "concept_graph" | "timeline" | "flash_cards" | "figure" | "deep_dive" | "user_note",
    "focus": "What this block should cover",
    "transitionIn": "Optional bridge text from previous block",
    "params": { ... block-specific parameters }
  }
]

Rules:
- Start with a "section" or "text" block for context
- Include at least one "quiz" or "flash_cards" for assessment
- Use "callout" for key ideas, pitfalls, or summaries
- 4-8 blocks per page is ideal
- Each block should have a clear, specific focus
- "params" should contain relevant generator hints (e.g. calloutType, difficulty, depth)`;

// ---------------------------------------------------------------------------
// SectionArchitect class
// ---------------------------------------------------------------------------

export class SectionArchitect {
  private providerId: ProviderId;
  private modelId: string;
  private apiKey: string;
  private baseUrl?: string;

  constructor(config?: {
    providerId?: string;
    modelId?: string;
    apiKey?: string;
    baseUrl?: string;
  }) {
    const pid = resolveProviderId(config?.providerId);
    this.providerId = pid as ProviderId;
    this.modelId = resolveModelId(config?.modelId);
    this.apiKey = resolveApiKey(pid, config?.apiKey);
    this.baseUrl = config?.baseUrl || resolveBaseUrl();
  }

  /**
   * Plan blocks for a page. Tries LLM first, falls back to static template.
   */
  async planBlocks(
    chapter: Chapter,
    language: string = 'zh',
  ): Promise<BlockPlan[]> {
    if (!this.apiKey) {
      return this.staticPlan(chapter.contentType);
    }

    try {
      const plan = await this.llmPlan(chapter, language);
      // Coverage guarantee: ensure at least one section block at front
      if (!plan.some((b) => b.type === 'section')) {
        plan.unshift({
          type: 'section',
          focus: 'Core content',
          params: { depth: 'balanced' },
        });
      }
      return plan;
    } catch (err) {
      log.warn('LLM plan failed, using static template:', err);
      return this.staticPlan(chapter.contentType);
    }
  }

  // -----------------------------------------------------------------------
  // LLM plan
  // -----------------------------------------------------------------------

  private async llmPlan(
    chapter: Chapter,
    language: string,
  ): Promise<BlockPlan[]> {
    const langLabel = language === 'zh' ? 'Chinese' : 'English';
    const prompt = [
      `Language: ${langLabel}`,
      `\nChapter: ${chapter.title}`,
      `Content Type: ${chapter.contentType}`,
      `Learning Objectives:`,
      ...chapter.learningObjectives.map((o) => `- ${o}`),
      chapter.summary ? `\nSummary: ${chapter.summary}` : '',
      '\nPlan the block structure for this page:',
    ]
      .filter(Boolean)
      .join('\n');

    const { model } = getModel({
      providerId: this.providerId,
      modelId: this.modelId,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
    });

    const result = await callLLM(
      {
        model,
        system: ARCHITECT_SYSTEM,
        prompt,
        temperature: 0.5,
        maxOutputTokens: 2048,
      },
      'section-architect',
    );

    return this.parseResponse(result.text, chapter.contentType);
  }

  // -----------------------------------------------------------------------
  // Static fallback
  // -----------------------------------------------------------------------

  private staticPlan(contentType: ContentType): BlockPlan[] {
    return TEMPLATES[contentType] ?? TEMPLATES.concept;
  }

  // -----------------------------------------------------------------------
  // Parse
  // -----------------------------------------------------------------------

  private parseResponse(text: string, contentType: ContentType): BlockPlan[] {
    let str = text.trim();
    if (str.startsWith('```')) {
      const lines = str.split('\n');
      lines.shift();
      if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
        lines.pop();
      }
      str = lines.join('\n').trim();
    }

    const parsed = JSON.parse(str);
    if (!Array.isArray(parsed)) {
      return this.staticPlan(contentType);
    }

    const validTypes: BlockType[] = [
      'text', 'section', 'callout', 'quiz', 'code', 'concept_graph',
      'timeline', 'flash_cards', 'figure', 'deep_dive', 'user_note',
      'interactive', 'animation',
    ];

    return parsed
      .filter((b: Record<string, unknown>) => b.type && validTypes.includes(b.type as BlockType))
      .map((b: Record<string, unknown>) => ({
        type: b.type as BlockType,
        focus: (b.focus as string) || '',
        transitionIn: (b.transitionIn as string) || undefined,
        params: (b.params as Record<string, unknown>) || {},
      }));
  }
}
