/**
 * KB Seed — Pre-inject knowledge base context into system prompts
 *
 * When a session has knowledge bases selected, the seed mechanism:
 * 1. Takes the last user message as an implicit query
 * 2. Retrieves top-K chunks from each selected KB
 * 3. Clips each KB's contribution to ~4000 chars
 * 4. Builds a "[Knowledge Base Context]" block for the system prompt
 *
 * This is complementary to the rag tool:
 * - KB Seed: pre-injects context before the conversation starts
 * - rag tool: LLM calls on-demand to query specific KBs
 *
 * Phase 2b: 3 KBs × 4000 chars max each.
 */

import { createLogger } from '@/lib/logger';
import type { RAGServiceImpl, RAGSource } from './rag';
import { prisma } from '@/lib/db/client';

const log = createLogger('KBSeed');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum characters per KB in the seed block */
const MAX_CHARS_PER_KB = 4000;

/** Maximum number of KBs to seed */
const MAX_KB_SEEDS = 3;

/** Top-K chunks to retrieve per KB for seeding */
const SEED_TOP_K = 5;

/** Minimum score threshold for seed chunks */
const SEED_MIN_SCORE = 0.25;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KBSeedResult {
  /** The formatted seed block text (ready for system prompt injection) */
  seedBlock: string;
  /** Individual KB seeds with their sources */
  kbSeeds: KBSeedEntry[];
  /** Whether any seeds were found */
  hasSeeds: boolean;
}

export interface KBSeedEntry {
  kbId: string;
  kbName: string;
  context: string;
  sourceCount: number;
}

// ---------------------------------------------------------------------------
// KBSeed
// ---------------------------------------------------------------------------

export class KBSeedService {
  private ragService: RAGServiceImpl;

  constructor(ragService: RAGServiceImpl) {
    this.ragService = ragService;
  }

  /**
   * Build a seed block from selected knowledge bases.
   *
   * @param kbIds    — Knowledge base IDs to seed from
   * @param query    — The user's message (used as search query)
   * @param userId   — User ID for access control
   */
  async buildSeed(
    kbIds: string[],
    query: string,
    userId: string,
  ): Promise<KBSeedResult> {
    // Limit to max KBs
    const selectedKbIds = kbIds.slice(0, MAX_KB_SEEDS);

    if (selectedKbIds.length === 0) {
      return { seedBlock: '', kbSeeds: [], hasSeeds: false };
    }

    // Resolve KB names
    const kbs = await prisma.dtKnowledgeBase.findMany({
      where: { id: { in: selectedKbIds }, userId, status: 'ready' },
      select: { id: true, name: true },
    });

    if (kbs.length === 0) {
      return { seedBlock: '', kbSeeds: [], hasSeeds: false };
    }

    const kbSeeds: KBSeedEntry[] = [];

    for (const kb of kbs) {
      try {
        const result = await this.ragService.search(query, [kb.id], {
          topK: SEED_TOP_K,
          minScore: SEED_MIN_SCORE,
          maxContextLength: MAX_CHARS_PER_KB,
        });

        if (result.sources.length > 0) {
          kbSeeds.push({
            kbId: kb.id,
            kbName: kb.name,
            context: result.context,
            sourceCount: result.sources.length,
          });
        }
      } catch (err) {
        log.warn(`Failed to seed KB "${kb.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (kbSeeds.length === 0) {
      return { seedBlock: '', kbSeeds: [], hasSeeds: false };
    }

    // Build the seed block
    const seedBlock = this.formatSeedBlock(kbSeeds);

    return {
      seedBlock,
      kbSeeds,
      hasSeeds: true,
    };
  }

  // -------------------------------------------------------------------------
  // Formatting
  // -------------------------------------------------------------------------

  /**
   * Format the seed block for injection into system prompt.
   */
  private formatSeedBlock(seeds: KBSeedEntry[]): string {
    const parts: string[] = [
      '[Knowledge Base Context]',
      'The following context has been retrieved from the user\'s selected knowledge bases.',
      'Use this information to provide accurate, grounded answers. Cite sources when referencing specific content.',
      '',
    ];

    for (const seed of seeds) {
      parts.push(`## Knowledge Base: ${seed.kbName}`);
      parts.push(`(${seed.sourceCount} relevant passages found)`);
      parts.push('');
      parts.push(seed.context);
      parts.push('');
    }

    parts.push('[End Knowledge Base Context]');
    return parts.join('\n');
  }
}
