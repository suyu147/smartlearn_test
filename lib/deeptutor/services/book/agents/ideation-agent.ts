/**
 * IdeationAgent — Stage 1: Generate BookProposal from user input
 *
 * Ported from DeepTutor Python deeptutor/book/agents/ideation_agent.py.
 * Single LLM call → JSON response → BookProposal.
 */

import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
import type { BookProposal, BookInputs } from '../models';
import { createBookProposal } from '../models';
import { resolveApiKey, resolveProviderId, resolveModelId, resolveBaseUrl } from '@/lib/server/resolve-model';

const log = createLogger('IdeationAgent');

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert educational content designer. Given a user's learning intent and available resources, design a book proposal that will serve as the blueprint for an AI-generated interactive textbook.

Output ONLY a valid JSON object with these fields:
{
  "title": "Book title (concise, engaging)",
  "description": "1-2 sentence description of what the book covers",
  "scope": "Detailed scope: what topics are included and excluded",
  "targetLevel": "beginner | intermediate | advanced",
  "estimatedChapters": <number 3-12>,
  "rationale": "Why this structure serves the learner's goals"
}

Rules:
- Be specific about scope — avoid vague "comprehensive coverage"
- Target level should match the user's apparent expertise
- Chapter count should be proportional to scope breadth
- Title should be clear and informative, not clickbait`;

// ---------------------------------------------------------------------------
// IdeationAgent class
// ---------------------------------------------------------------------------

export class IdeationAgent {
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

  async generate(
    userIntent: string,
    inputs: BookInputs,
    language: string = 'zh',
  ): Promise<BookProposal> {
    if (!this.apiKey) {
      log.warn('No API key configured, returning default proposal');
      return createBookProposal({
        title: userIntent.slice(0, 60) || 'Untitled Book',
        description: 'Auto-generated proposal (LLM not configured)',
        scope: userIntent,
        targetLevel: 'intermediate',
        estimatedChapters: 5,
        rationale: 'Default proposal — configure API key for AI-generated proposals',
      });
    }

    const langLabel =
      language === 'zh'
        ? 'Chinese'
        : language === 'ja'
          ? 'Japanese'
          : language === 'ru'
            ? 'Russian'
            : 'English';

    const userPrompt = this.buildPrompt(userIntent, inputs, langLabel);

    try {
      const { model } = getModel({
        providerId: this.providerId,
        modelId: this.modelId,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
      });

      const result = await callLLM(
        {
          model,
          system: SYSTEM_PROMPT,
          prompt: userPrompt,
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
        'ideation-agent',
      );

      return this.parseResponse(result.text, userIntent);
    } catch (err) {
      log.error('IdeationAgent failed:', err);
      return createBookProposal({
        title: userIntent.slice(0, 60) || 'Untitled Book',
        description: `Failed to generate proposal: ${err instanceof Error ? err.message : String(err)}`,
        scope: userIntent,
        targetLevel: 'intermediate',
        estimatedChapters: 5,
        rationale: 'Fallback proposal due to LLM error',
      });
    }
  }

  private buildPrompt(
    userIntent: string,
    inputs: BookInputs,
    langLabel: string,
  ): string {
    const parts: string[] = [];

    parts.push(`Language: ${langLabel}`);
    parts.push(`\nUser Intent:\n${userIntent}`);

    if (inputs.chatSelections.length > 0) {
      parts.push(`\nChat Context (${inputs.chatSelections.length} selections):`);
      for (const sel of inputs.chatSelections.slice(0, 5)) {
        parts.push(`- ${sel}`);
      }
    }

    if (inputs.knowledgeBases.length > 0) {
      parts.push(`\nKnowledge Bases: ${inputs.knowledgeBases.join(', ')}`);
    }

    if (inputs.notebookRefs.length > 0) {
      parts.push(`\nNotebook References: ${inputs.notebookRefs.join(', ')}`);
    }

    if (inputs.questionCategories.length > 0) {
      parts.push(`\nWeak Areas: ${inputs.questionCategories.join(', ')}`);
    }

    parts.push('\nOutput the JSON book proposal:');
    return parts.join('\n');
  }

  private parseResponse(text: string, userIntent: string): BookProposal {
    // Try to extract JSON from the response
    let jsonStr = text.trim();

    // Strip markdown fences if present
    if (jsonStr.startsWith('```')) {
      const lines = jsonStr.split('\n');
      lines.shift(); // remove ```json or ```
      if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
        lines.pop();
      }
      jsonStr = lines.join('\n').trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return createBookProposal({
        title: parsed.title || userIntent.slice(0, 60),
        description: parsed.description || '',
        scope: parsed.scope || '',
        targetLevel: parsed.targetLevel || 'intermediate',
        estimatedChapters: parsed.estimatedChapters || 5,
        rationale: parsed.rationale || '',
      });
    } catch {
      log.warn('Failed to parse IdeationAgent response as JSON');
      return createBookProposal({
        title: userIntent.slice(0, 60) || 'Untitled Book',
        description: text.slice(0, 200),
        scope: userIntent,
        targetLevel: 'intermediate',
        estimatedChapters: 5,
        rationale: 'Could not parse LLM response',
      });
    }
  }
}
