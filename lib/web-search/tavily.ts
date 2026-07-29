export interface TavilySearchResult {
  answer: string;
  sources: Array<{ title: string; url: string; content?: string }>;
  context: string;
  query: string;
  responseTime?: number;
}

export async function searchWithTavily(options: {
  query: string;
  apiKey: string;
}): Promise<TavilySearchResult> {
  const startTime = Date.now();

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: options.query,
      api_key: options.apiKey,
      search_depth: 'advanced',
      include_answer: true,
      include_raw_content: false,
      max_results: 5,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Tavily API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  const sources = (data.results ?? []).map(
    (r: { title: string; url: string; content?: string }) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    }),
  );

  const context = sources
    .map((s: { title: string; url: string; content?: string }, i: number) =>
      s.content
        ? `[${i + 1}] ${s.title} (${s.url}): ${s.content}`
        : `[${i + 1}] ${s.title} (${s.url})`,
    )
    .join('\n');

  return {
    answer: data.answer ?? '',
    sources,
    context,
    query: data.query ?? options.query,
    responseTime: Date.now() - startTime,
  };
}

export function formatSearchResultsAsContext(
  result: TavilySearchResult,
): string {
  if (!result.sources.length) return '';
  return result.sources
    .map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`)
    .join('\n');
}
