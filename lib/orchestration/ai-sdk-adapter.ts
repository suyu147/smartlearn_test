import type { LanguageModel } from 'ai';
import type { ThinkingConfig } from '@/lib/types/provider';

export interface GenerateResult {
  generations: Array<{ text: string }>;
}

export class AISdkLangGraphAdapter {
  private model: LanguageModel;
  private thinkingConfig?: ThinkingConfig;

  constructor(model: LanguageModel, thinkingConfig?: ThinkingConfig) {
    this.model = model;
    this.thinkingConfig = thinkingConfig;
  }

  async invoke(
    _messages: unknown[],
    _config?: unknown,
  ): Promise<string> {
    return '';
  }

  async _generate(
    _messages: unknown[],
    _options?: Record<string, unknown>,
  ): Promise<GenerateResult> {
    return { generations: [{ text: '' }] };
  }

  async *streamGenerate(
    _messages: unknown[],
    _config?: unknown,
  ): AsyncGenerator<{ type: string; content: string }> {
    yield { type: '', content: '' };
  }
}
