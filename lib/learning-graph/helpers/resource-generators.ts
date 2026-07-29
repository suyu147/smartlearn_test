import { streamLLM } from '@/lib/ai/llm';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { resolveModel } from '@/lib/server/resolve-model';
import type { ProviderId } from '@/lib/types/provider';
import type {
  DocumentSectionOutline,
  Resource,
  ResourceType,
  StructuredDocument,
  StructuredDocumentSection,
  StructuredReading,
} from '@/lib/types/resource';
import type { ProfileDimensions } from '@/lib/types/profile';
import resourcePrompts from '@/lib/prompts/resource-prompts.json';

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  document: 'document',
  mindmap: 'mindmap',
  quiz: 'quiz',
  video: 'video',
  code: 'code',
  reading: 'reading',
  ppt: 'ppt',
};

type AIConfig = { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string };

function buildPersonalizedContext(knowledgePoints: string[], profile?: ProfileDimensions | null) {
  let prompt = `Knowledge points: ${knowledgePoints.join(', ')}`;
  if (profile) prompt += `\n\nStudent profile for personalization:\n${JSON.stringify(profile, null, 2)}`;
  return prompt;
}

async function runTextGeneration(system: string, prompt: string, aiConfig?: AIConfig, source = 'resource-generate', maxOutputTokens = 4096) {
  const { model } = resolveModel({
    providerId: aiConfig?.providerId as ProviderId | undefined,
    modelId: aiConfig?.modelId,
    apiKey: aiConfig?.apiKey,
    baseUrl: aiConfig?.baseUrl,
  });
  const result = await streamLLM({ model, system, prompt, maxOutputTokens }, source);
  return await result.text;
}

async function generateDefaultResource(type: ResourceType, knowledgePoints: string[], profile?: ProfileDimensions | null, aiConfig?: AIConfig) {
  const metadata: Resource['metadata'] = { knowledgePoints, profileUsed: !!profile };
  if (type === 'video') {
    const { searchVideos } = await import('@/lib/video/search-aggregator');
    const videoSearchResult = await searchVideos(knowledgePoints);
    metadata.videoData = videoSearchResult;
    return { content: JSON.stringify(videoSearchResult), title: `${knowledgePoints.join(', ')} - 推荐视频`, metadata };
  }
  const prompt = resourcePrompts[type as keyof typeof resourcePrompts];
  // quiz and ppt require structured JSON output with 5+ items — 4096 tokens is
  // often not enough and the LLM output gets truncated mid-string, producing
  // unparseable JSON. Give them more room.
  const maxTokens = type === 'quiz' || type === 'ppt' ? 8192 : 4096;
  const content = await runTextGeneration(prompt, `Generate ${RESOURCE_TYPE_LABELS[type]} for:\n${buildPersonalizedContext(knowledgePoints, profile)}`, aiConfig, `resource-${type}`, maxTokens);
  return { content, title: `${knowledgePoints.join(', ')} - ${RESOURCE_TYPE_LABELS[type]}`, metadata };
}

async function generateDocumentResource(knowledgePoints: string[], profile?: ProfileDimensions | null, aiConfig?: AIConfig) {
  const outlineRaw = await runTextGeneration('你是教学文档大纲规划器。请只输出 JSON。', ['请先为讲解文档生成结构化大纲 JSON。', '{"introduction":"开场导语","outline":[{"id":"section-1","title":"章节标题","estimatedLength":"short|medium|long","elements":["text","code","callout","table"],"summary":"这一节应包含什么"}],"summary":"全文总结"}', buildPersonalizedContext(knowledgePoints, profile)].join('\n'), aiConfig, 'resource-document-outline', 2400);
  const parsedOutline = parseJsonResponse<{ introduction?: string; outline?: DocumentSectionOutline[]; summary?: string }>(outlineRaw);
  const outline: DocumentSectionOutline[] = parsedOutline?.outline?.length ? parsedOutline.outline.map((section) => ({ ...section, elements: section.elements.filter((element): element is 'text' | 'code' | 'callout' | 'table' => ['text', 'code', 'callout', 'table'].includes(element)) })) : [{ id: 'section-1', title: '核心概念', estimatedLength: 'medium', elements: ['text', 'callout'], summary: '解释基础概念与关键术语' }];
  const sections: StructuredDocumentSection[] = [];
  for (const section of outline) {
    const sectionRaw = await runTextGeneration('你是教学文档段落生成器。请只输出 JSON。', ['请为下面这个章节生成结构化 blocks。', '{"id":"章节id","title":"章节标题","blocks":[{"type":"text","content":"段落正文"},{"type":"code","language":"python","content":"print(123)"},{"type":"callout","tone":"info|warning|success","content":"提醒内容"},{"type":"table","headers":["列1","列2"],"rows":[["值1","值2"]]}]}', `章节标题: ${section.title}`, `预计长度: ${section.estimatedLength}`, `应包含元素: ${section.elements.join(', ')}`, `章节要求: ${section.summary}`, buildPersonalizedContext(knowledgePoints, profile)].join('\n'), aiConfig, `resource-document-section-${section.id}`, 2600);
    const parsedSection = parseJsonResponse<StructuredDocumentSection>(sectionRaw);
    sections.push({ id: parsedSection?.id || section.id, title: parsedSection?.title || section.title, blocks: Array.isArray(parsedSection?.blocks) && parsedSection.blocks.length > 0 ? parsedSection.blocks : [{ type: 'text', content: `${section.title}：${section.summary}` }] });
  }
  const structuredDocument: StructuredDocument = { format: 'structured_document_v1', introduction: parsedOutline?.introduction, outline, sections, summary: parsedOutline?.summary };
  return { content: JSON.stringify(structuredDocument), title: `${knowledgePoints.join(', ')} - document`, metadata: { knowledgePoints, profileUsed: !!profile, structuredDocument } };
}

async function generateReadingResource(knowledgePoints: string[], profile?: ProfileDimensions | null, aiConfig?: AIConfig) {
  const readingRaw = await runTextGeneration('你是拓展阅读策展助手。请只输出 JSON。', ['请生成卡片/清单式拓展阅读 JSON。', '{"intro":"开场说明","cards":[{"id":"card-1","title":"主题","description":"材料说明","reason":"推荐理由","coverPlaceholder":"封面图占位描述","suggestedUse":"适合怎么读"}],"externalLinks":[{"title":"链接标题","url":"https://example.com","note":"为什么值得看"}]}', buildPersonalizedContext(knowledgePoints, profile)].join('\n'), aiConfig, 'resource-reading-structured', 2400);
  const parsedReading = parseJsonResponse<StructuredReading>(readingRaw);
  const structuredReading: StructuredReading = { format: 'structured_reading_v1', intro: parsedReading?.intro, cards: parsedReading?.cards?.length ? parsedReading.cards : [{ id: 'card-1', title: `${knowledgePoints[0] ?? '主题'} 入门资料`, description: '从基础概念、典型场景和常见误区入手的阅读材料。', reason: '先建立整体理解，再深入具体实践。', coverPlaceholder: '封面图占位', suggestedUse: '先通读，再结合笔记整理重点。' }], externalLinks: parsedReading?.externalLinks ?? [] };
  return { content: JSON.stringify(structuredReading), title: `${knowledgePoints.join(', ')} - reading`, metadata: { knowledgePoints, profileUsed: !!profile, structuredReading } };
}

export async function generateResource(type: ResourceType, knowledgePoints: string[], profile?: ProfileDimensions | null, aiConfig?: AIConfig) {
  if (type === 'document') return generateDocumentResource(knowledgePoints, profile, aiConfig);
  if (type === 'reading') return generateReadingResource(knowledgePoints, profile, aiConfig);
  return generateDefaultResource(type, knowledgePoints, profile, aiConfig);
}
