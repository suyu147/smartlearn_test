import type { StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';
import type { ThinkingConfig } from '@/lib/types/provider';

export async function* statelessGenerate(
  _request: StatelessChatRequest & { apiKey: string },
  _signal: AbortSignal,
  _model: unknown,
  _thinking?: ThinkingConfig,
): AsyncGenerator<StatelessEvent> {
  yield {
    type: 'error',
    data: { message: 'Not implemented - use SmartLearn agents instead' },
  };
}

export interface ParserState {
  buffer: string;
  chunks: string[];
  done: boolean;
}

export interface ParseResult {
  ordered: Array<{ type: string; index: number }>;
  textChunks: string[];
  actions: StatelessEvent[];
  isDone: boolean;
}

export function createParserState(): ParserState {
  return { buffer: '', chunks: [], done: false };
}

export function parseStructuredChunk(
  _chunk: string,
  _state: ParserState,
): ParseResult {
  return { ordered: [], textChunks: [], actions: [], isDone: false };
}

export function finalizeParser(_state: ParserState): ParseResult {
  return { ordered: [], textChunks: [], actions: [], isDone: true };
}
