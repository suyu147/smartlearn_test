/**
 * RAGTool — Search knowledge bases for relevant information
 *
 * The LLM calls this tool when it needs grounded information from
 * the user's knowledge bases. It queries the RAG service and returns
 * relevant passages with source citations.
 *
 * After each search, the query metadata is automatically recorded
 * as an L1 trace event on the 'kb' surface, creating a bidirectional
 * link between RAG and the memory system (mirrors DeepTutor Python's
 * rag/service.py pattern).
 *
 * Parameters:
 * - query: The search query
 * - kb_name: The knowledge base to search
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolResult,
  type ToolPromptHints,
  createToolResult,
  createToolParameter,
  createToolPromptHints,
} from '@/lib/deeptutor/core/tool-protocol';
import type { RAGServiceImpl } from '@/lib/deeptutor/services/rag';
import { getMemoryService } from '@/lib/deeptutor/services/memory';
import { prisma } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('RAGTool');

// ---------------------------------------------------------------------------
// Tool-level context (set per turn via setContext)
// ---------------------------------------------------------------------------

let _ragService: RAGServiceImpl | null = null;
let _userId: string = 'anonymous';
let _sessionId: string | undefined;

export function setRAGToolContext(ragService: RAGServiceImpl, userId: string, sessionId?: string): void {
  _ragService = ragService;
  _userId = userId;
  _sessionId = sessionId;
}

// ---------------------------------------------------------------------------
// RAGTool
// ---------------------------------------------------------------------------

export class RAGTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'rag',
      description: 'Search a knowledge base for relevant information. Use this tool when you need grounded information from the user\'s uploaded documents.',
      parameters: [
        createToolParameter({
          name: 'query',
          type: 'string',
          description: 'The search query to find relevant passages.',
          required: true,
        }),
        createToolParameter({
          name: 'kb_name',
          type: 'string',
          description: 'The name of the knowledge base to search.',
          required: true,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Search knowledge bases for relevant document passages.',
      whenToUse: 'Use when the user asks questions that may be answered by their uploaded documents, or when you need specific facts, data, or quotes from their knowledge bases.',
      inputFormat: 'query: a focused search query; kb_name: the knowledge base name',
      guideline: 'Formulate specific queries rather than broad ones. If the first search doesn\'t find relevant results, try rephrasing the query or searching a different KB.',
      note: 'Results include source citations with document title and chunk location.',
      phase: 'retrieval',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const query = kwargs.query as string;
    const kbName = kwargs.kb_name as string;

    if (!query || query.trim().length === 0) {
      return createToolResult({
        content: 'Error: query parameter is required.',
        success: false,
      });
    }

    if (!kbName || kbName.trim().length === 0) {
      return createToolResult({
        content: 'Error: kb_name parameter is required.',
        success: false,
      });
    }

    if (!_ragService) {
      return createToolResult({
        content: 'RAG service is not available. Knowledge base search requires the RAG service to be initialized.',
        success: false,
      });
    }

    try {
      const result = await _ragService.searchByName(query, kbName, _userId);

      // Emit L1 trace to 'kb' surface — creates RAG↔memory linkage
      // so the consolidator can extract "user queried X knowledge base for Y" facts.
      try {
        const memoryService = getMemoryService();
        if (memoryService) {
          await memoryService.emitTrace(_userId, {
            surface: 'kb',
            kind: 'query',
            payload: {
              query,
              kb_name: kbName,
              result_count: result.sources.length,
              answer_chars: result.context.length,
              top_sources: result.sources.slice(0, 3).map((s) => ({
                document: s.documentTitle,
                score: s.score,
              })),
            },
            sessionId: _sessionId,
          });
        }
      } catch (traceErr) {
        // Trace failure must not block the RAG response
        log.debug('Failed to emit RAG trace event:', traceErr);
      }

      if (result.sources.length === 0) {
        return createToolResult({
          content: `No relevant passages found in knowledge base "${kbName}" for query: "${query}". Try a different query or knowledge base.`,
          sources: [{ type: 'rag', query, kb_name: kbName, result_count: 0 }],
          metadata: { query, kb_name: kbName, result_count: 0 },
        });
      }

      // Format the result
      const passages = result.sources.map((source, i) => {
        const score = (source.score * 100).toFixed(1);
        return `[${i + 1}] From: ${source.documentTitle} (chunk ${source.chunkIndex + 1}, relevance: ${score}%)\n${source.content}`;
      });

      const content = `Found ${result.sources.length} relevant passage(s) in "${kbName}":\n\n${passages.join('\n\n---\n\n')}\n\nUse the information above to answer the user's question. Cite the source document when referencing specific content.`;

      return createToolResult({
        content,
        sources: [{
          type: 'rag',
          query,
          kb_name: kbName,
          result_count: result.sources.length,
        }],
        metadata: {
          query,
          kb_name: kbName,
          result_count: result.sources.length,
          sources: result.sources.map((s) => ({
            document: s.documentTitle,
            chunk: s.chunkIndex,
            score: s.score,
          })),
        },
      });
    } catch (err) {
      log.error(`RAG search failed for kb="${kbName}", query="${query}":`, err);
      return createToolResult({
        content: `Error searching knowledge base "${kbName}": ${err instanceof Error ? err.message : String(err)}`,
        success: false,
        metadata: { query, kb_name: kbName },
      });
    }
  }
}
