/**
 * SpineSynthesizer — Stage 2: Draft → Critique → Revise → Spine
 *
 * Ported from DeepTutor Python deeptutor/book/agents/spine_synthesizer.py.
 * Multi-round LLM reasoning to produce a chapter tree with ConceptGraph.
 */

import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
import type {
  Spine,
  Chapter,
  ConceptGraph,
  BookProposal,
  ContentType,
} from '../models';
import { createSpine, createChapter, createConceptGraph } from '../models';
import { resolveApiKey, resolveProviderId, resolveModelId, resolveBaseUrl } from '@/lib/server/resolve-model';

const log = createLogger('SpineSynthesizer');

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const DRAFT_SYSTEM = `You are an expert curriculum designer. Given a book proposal, design the chapter structure (spine) for the book.

Output ONLY a valid JSON object:
{
  "chapters": [
    {
      "order": <number starting from 0>,
      "title": "Chapter title",
      "learningObjectives": ["objective 1", "objective 2"],
      "contentType": "theory" | "derivation" | "history" | "practice" | "concept" | "overview",
      "prerequisites": ["prereq concept id or title"],
      "summary": "2-3 sentence chapter summary"
    }
  ],
  "conceptGraph": {
    "nodes": [
      { "id": "concept_id", "label": "Concept Name", "chapter": 0 }
    ],
    "edges": [
      { "source": "concept_a", "target": "concept_b", "relation": "depends_on" | "extends" | "related" }
    ]
  }
}

Rules:
- Number of chapters should match estimatedChapters from the proposal (±2)
- Each chapter should have 2-4 learning objectives
- contentType should reflect the primary pedagogical purpose
- ConceptGraph should capture dependencies between concepts across chapters
- Prerequisites reference concepts that should be understood before this chapter`;

const CRITIQUE_SYSTEM = `You are a critical curriculum reviewer. Evaluate the proposed book spine and identify issues.

Output ONLY a valid JSON object:
{
  "issues": [
    { "type": "gap" | "order" | "scope" | "depth", "description": "...", "chapter": <number> }
  ],
  "verdict": "approved" | "needs_revision"
}

Rules:
- Check for missing prerequisite chains
- Check for uneven depth across chapters
- Check if scope matches the original proposal
- If fewer than 2 issues, verdict is "approved"`;

const REVISE_SYSTEM = `You are an expert curriculum designer revising a book spine based on reviewer feedback.

Given the original spine and the critique issues, output the REVISED complete spine in the same JSON format as the original draft.

Fix only the identified issues. Do not change chapters that are already good.
Output ONLY the revised JSON.`;

// ---------------------------------------------------------------------------
// SpineSynthesizer class
// ---------------------------------------------------------------------------

export class SpineSynthesizer {
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

  async synthesize(
    proposal: BookProposal,
    explorationSummary?: string,
    language: string = 'zh',
    onRound?: (round: number, verdict?: string) => void,
  ): Promise<Spine> {
    if (!this.apiKey) {
      log.warn('No API key — returning default spine');
      return this.defaultSpine(proposal);
    }

    try {
      // Round 1: Draft
      const draft = await this.draft(proposal, explorationSummary, language);
      onRound?.(1);

      // Round 2: Critique
      const critique = await this.critique(proposal, draft, language);
      onRound?.(2, critique.verdict);

      if (critique.verdict === 'approved' || critique.issues.length === 0) {
        return draft;
      }

      // Round 3: Revise (only if critique found issues)
      const revised = await this.revise(proposal, draft, critique, language);
      onRound?.(3, 'revised');

      // Post-processing: topological sort + cycle removal
      return this.postProcess(revised, proposal);
    } catch (err) {
      log.error('SpineSynthesizer failed:', err);
      return this.defaultSpine(proposal);
    }
  }

  // -----------------------------------------------------------------------
  // LLM rounds
  // -----------------------------------------------------------------------

  private async draft(
    proposal: BookProposal,
    explorationSummary?: string,
    language?: string,
  ): Promise<Spine> {
    const prompt = [
      `Language: ${language === 'zh' ? 'Chinese' : 'English'}`,
      `\nBook Proposal:`,
      `Title: ${proposal.title}`,
      `Description: ${proposal.description}`,
      `Scope: ${proposal.scope}`,
      `Target Level: ${proposal.targetLevel}`,
      `Estimated Chapters: ${proposal.estimatedChapters}`,
      explorationSummary ? `\nExploration Summary:\n${explorationSummary}` : '',
      '\nDesign the chapter spine:',
    ]
      .filter(Boolean)
      .join('\n');

    const text = await this.callLLM(DRAFT_SYSTEM, prompt);
    return this.parseSpineResponse(text, proposal);
  }

  private async critique(
    proposal: BookProposal,
    spine: Spine,
    language?: string,
  ): Promise<{ issues: Array<{ type: string; description: string; chapter?: number }>; verdict: string }> {
    const prompt = [
      `Language: ${language === 'zh' ? 'Chinese' : 'English'}`,
      `\nOriginal Proposal: ${proposal.title} — ${proposal.description}`,
      `\nProposed Spine:`,
      JSON.stringify(spine.chapters, null, 2),
      '\nReview the spine and identify issues:',
    ].join('\n');

    const text = await this.callLLM(CRITIQUE_SYSTEM, prompt);
    try {
      const parsed = this.parseJSON(text);
      return {
        issues: (parsed.issues as Array<{ type: string; description: string; chapter?: number }>) ?? [],
        verdict: (parsed.verdict as string) ?? 'approved',
      };
    } catch {
      return { issues: [], verdict: 'approved' };
    }
  }

  private async revise(
    proposal: BookProposal,
    spine: Spine,
    critique: { issues: Array<{ type: string; description: string; chapter?: number }>; verdict: string },
    language?: string,
  ): Promise<Spine> {
    const prompt = [
      `Language: ${language === 'zh' ? 'Chinese' : 'English'}`,
      `\nOriginal Spine:`,
      JSON.stringify(spine.chapters, null, 2),
      `\nCritique Issues:`,
      JSON.stringify(critique.issues, null, 2),
      '\nOutput the revised complete spine:',
    ].join('\n');

    const text = await this.callLLM(REVISE_SYSTEM, prompt);
    return this.parseSpineResponse(text, proposal);
  }

  // -----------------------------------------------------------------------
  // Post-processing
  // -----------------------------------------------------------------------

  private postProcess(spine: Spine, proposal: BookProposal): Spine {
    // Ensure chapters are sorted by order
    spine.chapters.sort((a, b) => a.order - b.order);

    // Renumber orders sequentially
    spine.chapters.forEach((ch, i) => {
      ch.order = i;
    });

    // Ensure we have at least 2 chapters
    while (spine.chapters.length < 2) {
      spine.chapters.push(
        createChapter({
          order: spine.chapters.length,
          title: `Chapter ${spine.chapters.length + 1}`,
          learningObjectives: ['Understand core concepts'],
          contentType: 'concept',
          summary: 'Additional chapter',
        }),
      );
    }

    return spine;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private defaultSpine(proposal: BookProposal): Spine {
    const count = Math.max(3, Math.min(proposal.estimatedChapters, 8));
    const chapters: Chapter[] = [];

    for (let i = 0; i < count; i++) {
      chapters.push(
        createChapter({
          order: i,
          title: `Chapter ${i + 1}`,
          learningObjectives: [`Understand ${proposal.title} concept ${i + 1}`],
          contentType: i === 0 ? 'overview' : 'concept',
          summary: `Chapter ${i + 1} of ${proposal.title}`,
        }),
      );
    }

    return createSpine({
      title: proposal.title,
      chapters,
      conceptGraph: createConceptGraph(),
      explorationSummary: '',
    });
  }

  private parseSpineResponse(text: string, proposal: BookProposal): Spine {
    const parsed = this.parseJSON(text);

    const chapters: Chapter[] = [];
    if (Array.isArray(parsed.chapters)) {
      for (let i = 0; i < parsed.chapters.length; i++) {
        const ch = parsed.chapters[i];
        chapters.push(
          createChapter({
            order: ch.order ?? i,
            title: ch.title || `Chapter ${i + 1}`,
            learningObjectives: ch.learningObjectives ?? [],
            contentType: (ch.contentType as ContentType) ?? 'concept',
            prerequisites: ch.prerequisites ?? [],
            summary: ch.summary ?? '',
          }),
        );
      }
    }

    let conceptGraph = createConceptGraph();
    if (parsed.conceptGraph) {
      const cg = parsed.conceptGraph as Record<string, unknown>;
      conceptGraph = createConceptGraph({
        nodes: ((cg.nodes ?? []) as Array<{ id: string; label: string; description?: string; chapter?: number }>).map(
          (n) => ({
            id: n.id || `node_${Math.random().toString(36).slice(2, 6)}`,
            label: n.label || 'Unknown',
            description: n.description,
            chapter: n.chapter,
          }),
        ),
        edges: ((cg.edges ?? []) as Array<{ source: string; target: string; relation: string }>).map(
          (e) => ({
            source: e.source,
            target: e.target,
            relation: (e.relation as 'depends_on' | 'extends' | 'related') ?? 'related',
          }),
        ),
      });
    }

    return createSpine({
      title: proposal.title,
      chapters: chapters.length > 0 ? chapters : [createChapter({ order: 0, title: 'Chapter 1' })],
      conceptGraph,
      explorationSummary: '',
    });
  }

  private parseJSON(text: string): Record<string, unknown> {
    let str = text.trim();
    if (str.startsWith('```')) {
      const lines = str.split('\n');
      lines.shift();
      if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
        lines.pop();
      }
      str = lines.join('\n').trim();
    }
    return JSON.parse(str);
  }

  private async callLLM(system: string, prompt: string): Promise<string> {
    const { model } = getModel({
      providerId: this.providerId,
      modelId: this.modelId,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
    });

    const result = await callLLM(
      {
        model,
        system,
        prompt,
        temperature: 0.6,
        maxOutputTokens: 4096,
      },
      'spine-synthesizer',
    );

    return result.text;
  }
}
