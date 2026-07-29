import type { AICallFn } from '@/lib/generation/pipeline-types';

export const SEARCH_QUERY_REWRITE_EXCERPT_LENGTH = 4000;

export interface SearchQueryResult {
  query: string;
  hasPdfContext: boolean;
  rawRequirementLength: number;
  rewriteAttempted: boolean;
  finalQueryLength: number;
}

export async function buildSearchQuery(
  requirement: string,
  pdfText: string | undefined,
  aiCall: AICallFn | undefined,
): Promise<SearchQueryResult> {
  const rawLength = requirement.length;
  let query = requirement;

  if (aiCall && pdfText) {
    try {
      const rewritten = await aiCall(
        'Rewrite the following search requirement into an effective web search query. Output only the search query, nothing else.',
        `Requirement: ${requirement}\n\nPDF context (excerpt): ${pdfText}`,
      );
      if (rewritten?.trim()) {
        query = rewritten.trim();
      }
    } catch {
      query = requirement;
    }
  }

  return {
    query,
    hasPdfContext: !!pdfText,
    rawRequirementLength: rawLength,
    rewriteAttempted: !!aiCall && !!pdfText,
    finalQueryLength: query.length,
  };
}
