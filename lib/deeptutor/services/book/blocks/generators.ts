/**
 * Block Generators — Core generators for Book Engine pages
 *
 * Registry-based generator pattern. Each generator produces a
 * block payload given params and context.
 *
 * Implemented generators: TEXT, SECTION, CALLOUT, CODE, QUIZ, CONCEPT_GRAPH, USER_NOTE,
 *   FIGURE, INTERACTIVE, ANIMATION, TIMELINE, FLASH_CARDS, DEEP_DIVE
 */

import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
import type { BlockType, Block, Chapter, ConceptGraph } from '../models';
import { createBlock } from '../models';
import { generateId } from '../storage';
import { resolveApiKey, resolveProviderId, resolveModelId, resolveBaseUrl } from '@/lib/server/resolve-model';

const log = createLogger('BlockGenerators');

// ---------------------------------------------------------------------------
// Generator context
// ---------------------------------------------------------------------------

export interface BlockGeneratorContext {
  chapter: Chapter;
  pageIndex: number;
  language: string;
  /** All blocks on the page (for cross-referencing) */
  siblingBlocks: Block[];
}

// ---------------------------------------------------------------------------
// Base generator interface
// ---------------------------------------------------------------------------

export interface BlockGenerator {
  readonly type: BlockType;
  generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }>;
}

// ---------------------------------------------------------------------------
// Shared LLM helper
// ---------------------------------------------------------------------------

class LLMHelper {
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

  async text(
    system: string,
    prompt: string,
    label: string = 'block-gen',
  ): Promise<string> {
    if (!this.apiKey) return '[LLM not configured]';

    const { model } = getModel({
      providerId: this.providerId,
      modelId: this.modelId,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
    });

    const result = await callLLM(
      { model, system, prompt, temperature: 0.7, maxOutputTokens: 4096 },
      label,
    );

    let text = result.text.trim();
    // Strip markdown fences
    if (text.startsWith('```')) {
      const lines = text.split('\n');
      lines.shift();
      if (lines.length > 0 && lines[lines.length - 1].trim() === '```') lines.pop();
      text = lines.join('\n').trim();
    }
    return text;
  }

  async json(
    system: string,
    prompt: string,
    label: string = 'block-gen-json',
  ): Promise<Record<string, unknown>> {
    const text = await this.text(system, prompt, label);
    try {
      return JSON.parse(text);
    } catch {
      log.warn(`Failed to parse JSON from ${label}`);
      return { content: text };
    }
  }
}

// ---------------------------------------------------------------------------
// TextGenerator
// ---------------------------------------------------------------------------

class TextGenerator implements BlockGenerator {
  readonly type: BlockType = 'text';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const focus = (params.focus as string) || 'General explanation';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are an educational content writer. Write clear, engaging text about the given topic.
Output ONLY the text. No markdown fences, no preamble. Language: ${langLabel}.`;

    const prompt = `Chapter: ${ctx.chapter.title}\nFocus: ${focus}\n\nWrite the text block:`;
    const content = await this.llm.text(system, prompt, 'text-block');

    return {
      payload: { content },
      metadata: { wordCount: content.length },
    };
  }
}

// ---------------------------------------------------------------------------
// SectionGenerator — Two-pass: outline + fill
// ---------------------------------------------------------------------------

class SectionGenerator implements BlockGenerator {
  readonly type: BlockType = 'section';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const focus = (params.focus as string) || 'Core concepts';
    const depth = (params.depth as string) || 'balanced';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    // Pass 1: Outline
    const outlineSystem = `You are an educational content writer. Create a structured outline for a section.
Output ONLY a JSON object: { "sections": [{ "heading": "...", "points": ["...", "..."] }] }
Language: ${langLabel}.`;

    const outlinePrompt = `Chapter: ${ctx.chapter.title}\nFocus: ${focus}\nDepth: ${depth}\n\nCreate an outline:`;
    const outline = await this.llm.json(outlineSystem, outlinePrompt, 'section-outline');

    // Pass 2: Fill sections
    const fillSystem = `You are an educational content writer. Expand the given outline into full section text.
Use markdown headings (##, ###) for each section. Include clear explanations.
Output ONLY the text. No markdown fences. Language: ${langLabel}.`;

    const fillPrompt = `Chapter: ${ctx.chapter.title}\nFocus: ${focus}\n\nOutline:\n${JSON.stringify(outline)}\n\nExpand into full text:`;
    const content = await this.llm.text(fillSystem, fillPrompt, 'section-fill');

    return {
      payload: { content, outline },
      metadata: { wordCount: content.length, sectionCount: (outline.sections as unknown[])?.length ?? 1 },
    };
  }
}

// ---------------------------------------------------------------------------
// CalloutGenerator
// ---------------------------------------------------------------------------

class CalloutGenerator implements BlockGenerator {
  readonly type: BlockType = 'callout';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const calloutType = (params.calloutType as string) || 'key_idea';
    const focus = (params.focus as string) || 'Important concept';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are an educational content writer. Write a ${calloutType} callout box.
A callout is a short, visually distinct box highlighting important information.
Types: key_idea (important concept), pitfall (common mistake), summary (chapter recap), tip (helpful trick).
Output ONLY the callout text (2-4 sentences). No preamble. Language: ${langLabel}.`;

    const prompt = `Chapter: ${ctx.chapter.title}\nCallout type: ${calloutType}\nFocus: ${focus}\n\nWrite the callout:`;
    const content = await this.llm.text(system, prompt, 'callout-block');

    return {
      payload: { content, calloutType },
      metadata: {},
    };
  }
}

// ---------------------------------------------------------------------------
// CodeGenerator
// ---------------------------------------------------------------------------

class CodeGenerator implements BlockGenerator {
  readonly type: BlockType = 'code';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const focus = (params.focus as string) || 'Implementation example';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are an educational code writer. Write a clear, well-commented code example.
Output ONLY a JSON object: { "language": "python", "code": "...", "explanation": "..." }
Code should be correct and educational. Comments in ${langLabel}.`;

    const prompt = `Chapter: ${ctx.chapter.title}\nFocus: ${focus}\n\nWrite the code example:`;
    const result = await this.llm.json(system, prompt, 'code-block');

    return {
      payload: {
        language: (result.language as string) || 'python',
        code: (result.code as string) || '# Code not generated',
        explanation: (result.explanation as string) || '',
      },
      metadata: {},
    };
  }
}

// ---------------------------------------------------------------------------
// ConceptGraphGenerator — Deterministic, no LLM
// ---------------------------------------------------------------------------

class ConceptGraphGenerator implements BlockGenerator {
  readonly type: BlockType = 'concept_graph';

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    // Build Mermaid diagram from chapter concept graph
    const graph = (params.conceptGraph as ConceptGraph) ?? { nodes: [], edges: [] };

    let mermaid = 'graph TD\n';
    for (const node of graph.nodes) {
      mermaid += `  ${node.id}["${node.label}"]\n`;
    }
    for (const edge of graph.edges) {
      const arrow =
        edge.relation === 'depends_on'
          ? '-->'
          : edge.relation === 'extends'
            ? '-.->'
            : '---';
      mermaid += `  ${edge.source} ${arrow} ${edge.target}\n`;
    }

    if (graph.nodes.length === 0) {
      mermaid += '  A["No concepts defined"]\n';
    }

    return {
      payload: { mermaid, nodeCount: graph.nodes.length, edgeCount: graph.edges.length },
      metadata: {},
    };
  }
}

// ---------------------------------------------------------------------------
// UserNoteGenerator — Passthrough, no LLM
// ---------------------------------------------------------------------------

class UserNoteGenerator implements BlockGenerator {
  readonly type: BlockType = 'user_note';

  async generate(
    params: Record<string, unknown>,
    _ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    return {
      payload: { content: (params.content as string) || '', editable: true },
      metadata: {},
    };
  }
}

// ---------------------------------------------------------------------------
// QuizGenerator — JSON-based
// ---------------------------------------------------------------------------

class QuizGenerator implements BlockGenerator {
  readonly type: BlockType = 'quiz';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const difficulty = (params.difficulty as string) || 'medium';
    const focus = (params.focus as string) || 'Comprehension check';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are a quiz designer. Create a multiple-choice question.
Output ONLY a JSON object:
{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctIndex": <0-3>,
  "explanation": "Why the correct answer is right"
}
Language: ${langLabel}. Difficulty: ${difficulty}.`;

    const prompt = `Chapter: ${ctx.chapter.title}\nFocus: ${focus}\n\nCreate the quiz question:`;
    const result = await this.llm.json(system, prompt, 'quiz-block');

    return {
      payload: result,
      metadata: { difficulty },
    };
  }
}

// ---------------------------------------------------------------------------
// FigureGenerator — LLM-powered diagram/figure generation
// ---------------------------------------------------------------------------

class FigureGenerator implements BlockGenerator {
  readonly type: BlockType = 'figure';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const focus = (params.focus as string) || 'Conceptual diagram';
    const variant = (params.variant as string) || 'diagram';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are an educational diagram designer. Generate a visual figure for a textbook chapter.
Supported render types: "mermaid" (flowcharts, sequence, state diagrams), "svg" (custom illustrations), "chartjs" (data charts).
Output ONLY a JSON object:
{
  "render_type": "mermaid" | "svg" | "chartjs",
  "code": "...",
  "description": "Brief description of what the figure shows"
}
For mermaid: output valid Mermaid syntax (graph TD, sequenceDiagram, etc.).
For svg: output valid SVG markup with viewBox, text labels, and clean styling.
For chartjs: output a Chart.js config object { type, data, options }.
Choose the render_type best suited for the content. Language: ${langLabel}.`;

    const prompt = `Chapter: ${ctx.chapter.title}\nVariant: ${variant}\nFocus: ${focus}\n\nGenerate the figure:`;
    const result = await this.llm.json(system, prompt, 'figure-block');

    const renderType = (result.render_type as string) || 'mermaid';
    const code = (result.code as string) || '';
    const description = (result.description as string) || focus;

    return {
      payload: { render_type: renderType, code, description },
      metadata: { variant },
    };
  }
}

// ---------------------------------------------------------------------------
// InteractiveGenerator — LLM-powered interactive HTML widget
// ---------------------------------------------------------------------------

class InteractiveGenerator implements BlockGenerator {
  readonly type: BlockType = 'interactive';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const focus = (params.focus as string) || 'Interactive demonstration';
    const interaction = (params.interaction as string) || 'interactive';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are an educational interactive designer. Create a self-contained HTML widget for a textbook.
The HTML must be a single, complete document with inline CSS and JS (no external dependencies).
It should be educational, interactive, and visually clean.
Output ONLY a JSON object:
{
  "code": "<full HTML document string>",
  "description": "Brief description of the interaction"
}
The HTML should include: responsive layout, user interaction (buttons, sliders, inputs, drag-drop, etc.),
visual feedback, and educational value. All text in ${langLabel}.`;

    const prompt = `Chapter: ${ctx.chapter.title}\nInteraction type: ${interaction}\nFocus: ${focus}\n\nGenerate the interactive widget:`;
    const result = await this.llm.json(system, prompt, 'interactive-block');

    const code = (result.code as string) || '';
    const description = (result.description as string) || focus;

    return {
      payload: { render_type: 'html', code, description },
      metadata: { interaction },
    };
  }
}

// ---------------------------------------------------------------------------
// AnimationGenerator — LLM-powered CSS/JS animation
// ---------------------------------------------------------------------------

class AnimationGenerator implements BlockGenerator {
  readonly type: BlockType = 'animation';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const focus = (params.focus as string) || 'Concept animation';
    const styleHint = (params.styleHint as string) || '';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are an educational animation designer. Create a self-contained HTML+CSS+JS animation for a textbook concept.
The output must be a single HTML document with inline CSS animations and/or JS animations (no external libraries).
Output ONLY a JSON object:
{
  "code": "<full HTML document string with animations>",
  "description": "Brief description of what the animation shows",
  "key_points": ["point 1", "point 2"]
}
Use CSS @keyframes, transitions, or requestAnimationFrame for smooth animations.
The animation should clearly illustrate the educational concept. All text in ${langLabel}.${styleHint ? `\nStyle hint: ${styleHint}` : ''}`;

    const prompt = `Chapter: ${ctx.chapter.title}\nFocus: ${focus}\n\nGenerate the animation:`;
    const result = await this.llm.json(system, prompt, 'animation-block');

    const code = (result.code as string) || '';
    const description = (result.description as string) || focus;
    const keyPoints = (result.key_points as string[]) || [];

    return {
      payload: { render_type: 'html', code, description, key_points: keyPoints },
      metadata: { focus },
    };
  }
}

// ---------------------------------------------------------------------------
// TimelineGenerator — JSON-based timeline events
// ---------------------------------------------------------------------------

class TimelineGenerator implements BlockGenerator {
  readonly type: BlockType = 'timeline';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const focus = (params.focus as string) || '';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are a timeline designer for educational content. Create a chronological timeline of key events.
Output ONLY a JSON object:
{
  "events": [
    { "date": "year or date string", "title": "event title", "description": "brief description" }
  ]
}
Include 4-8 events in chronological order. Keep date strings short (max 80 chars),
titles concise (max 160 chars), descriptions brief (max 300 chars).
Language: ${langLabel}.`;

    const prompt = `Chapter: ${ctx.chapter.title}${focus ? `\nFocus: ${focus}` : ''}\n\nGenerate the timeline:`;
    const result = await this.llm.json(system, prompt, 'timeline-block');

    let events = (result.events as Array<Record<string, unknown>>) || [];
    events = events.slice(0, 8).map((e) => ({
      date: String(e.date ?? '').slice(0, 80),
      title: String(e.title ?? '').slice(0, 160),
      description: String(e.description ?? '').slice(0, 600),
    }));

    if (events.length === 0) {
      events = [{ date: '—', title: 'No timeline events generated', description: '' }];
    }

    return {
      payload: { events },
      metadata: { eventCount: events.length },
    };
  }
}

// ---------------------------------------------------------------------------
// FlashCardsGenerator — JSON-based flashcard set
// ---------------------------------------------------------------------------

class FlashCardsGenerator implements BlockGenerator {
  readonly type: BlockType = 'flash_cards';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const count = Math.min(Math.max(Number(params.count ?? 5), 3), 8);
    const focus = (params.focus as string) || '';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are an educational flashcard designer. Create a set of study flashcards.
Output ONLY a JSON object:
{
  "cards": [
    { "front": "question or term (concise)", "back": "answer or explanation (detailed)", "hint": "optional hint" }
  ]
}
Create exactly ${count} cards. Front should be a question or term (max 300 chars).
Back should be the answer (max 600 chars). Hint is optional (max 200 chars).
Cards should cover different aspects of the topic and test understanding, not just memorization.
Language: ${langLabel}.`;

    const prompt = `Chapter: ${ctx.chapter.title}${focus ? `\nFocus: ${focus}` : ''}\n\nGenerate ${count} flashcards:`;
    const result = await this.llm.json(system, prompt, 'flashcards-block');

    let cards = (result.cards as Array<Record<string, unknown>>) || [];
    cards = cards
      .filter((c) => c.front && c.back)
      .slice(0, count)
      .map((c) => ({
        front: String(c.front ?? '').slice(0, 300),
        back: String(c.back ?? '').slice(0, 600),
        hint: String(c.hint ?? '').slice(0, 200),
      }));

    if (cards.length === 0) {
      cards = [{ front: 'No flashcards generated', back: 'Try regenerating', hint: '' }];
    }

    return {
      payload: { cards },
      metadata: { cardCount: cards.length },
    };
  }
}

// ---------------------------------------------------------------------------
// DeepDiveGenerator — Suggests further exploration topics
// ---------------------------------------------------------------------------

class DeepDiveGenerator implements BlockGenerator {
  readonly type: BlockType = 'deep_dive';
  private llm: LLMHelper;

  constructor(config?: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string }) {
    this.llm = new LLMHelper(config);
  }

  async generate(
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const focus = (params.focus as string) || '';
    const langLabel = ctx.language === 'zh' ? 'Chinese' : 'English';

    const system = `You are an educational content curator. Suggest topics for deeper exploration beyond the current chapter.
Output ONLY a JSON object:
{
  "suggestions": [
    { "topic": "suggested topic title", "rationale": "why this topic is worth exploring" }
  ]
}
Suggest 3-5 topics that build on the current chapter content. Each topic should be
a natural next step for a curious learner. Keep topics concise (max 160 chars) and
rationale brief (max 300 chars). Language: ${langLabel}.`;

    const prompt = `Chapter: ${ctx.chapter.title}${focus ? `\nFocus: ${focus}` : ''}\n\nSuggest deep-dive topics:`;
    const result = await this.llm.json(system, prompt, 'deepdive-block');

    let suggestions = (result.suggestions as Array<Record<string, unknown>>) || [];
    suggestions = suggestions.slice(0, 5).map((s) => ({
      topic: String(s.topic ?? '').slice(0, 160),
      rationale: String(s.rationale ?? '').slice(0, 300),
    }));

    if (suggestions.length === 0) {
      suggestions = [{ topic: 'No suggestions generated', rationale: 'Try regenerating' }];
    }

    return {
      payload: { suggestions },
      metadata: { suggestionCount: suggestions.length },
    };
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface BlockGeneratorRegistryConfig {
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
}

export class BlockGeneratorRegistry {
  private generators = new Map<BlockType, BlockGenerator>();

  constructor(config?: BlockGeneratorRegistryConfig) {
    // Core generators (LLM-powered)
    this.register(new TextGenerator(config));
    this.register(new SectionGenerator(config));
    this.register(new CalloutGenerator(config));
    this.register(new CodeGenerator(config));
    this.register(new QuizGenerator(config));

    // Deterministic generators
    this.register(new ConceptGraphGenerator());
    this.register(new UserNoteGenerator());

    // LLM-powered generators for complex types
    this.register(new FigureGenerator(config));
    this.register(new InteractiveGenerator(config));
    this.register(new AnimationGenerator(config));
    this.register(new TimelineGenerator(config));
    this.register(new FlashCardsGenerator(config));
    this.register(new DeepDiveGenerator(config));
  }

  register(gen: BlockGenerator): void {
    this.generators.set(gen.type, gen);
  }

  get(type: BlockType): BlockGenerator | undefined {
    return this.generators.get(type);
  }

  /** Generate a single block */
  async generateBlock(
    type: BlockType,
    params: Record<string, unknown>,
    ctx: BlockGeneratorContext,
  ): Promise<Block> {
    const id = generateId();
    const generator = this.get(type);

    if (!generator) {
      log.warn(`No generator for block type: ${type}`);
      return createBlock({
        id,
        type,
        status: 'error',
        params,
        payload: { content: `No generator for ${type}` },
      });
    }

    try {
      const { payload, metadata } = await generator.generate(params, ctx);
      return createBlock({
        id,
        type,
        status: 'ready',
        params,
        payload,
        metadata,
      });
    } catch (err) {
      log.error(`Block generator failed for ${type}:`, err);
      return createBlock({
        id,
        type,
        status: 'error',
        params,
        payload: { content: `Generation failed: ${err instanceof Error ? err.message : String(err)}` },
        metadata: { error: true },
      });
    }
  }
}
