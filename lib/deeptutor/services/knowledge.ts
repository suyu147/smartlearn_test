/**
 * KnowledgeService — Knowledge base management and document indexing
 *
 * Manages the full KB lifecycle:
 * - CRUD operations on knowledge bases
 * - Document upload and processing
 * - Chunking and embedding pipeline
 * - pgvector native vector storage via $executeRaw with ::vector cast
 *
 * Embeddings are stored as vector(1024) using pgvector extension.
 * See prisma/migrations/20260708_pgvector_embeddings/migration.sql.
 */

import { prisma } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { Prisma } from '@prisma/client';
import { ParsingServiceImpl } from './parsing';
import { ChunkerService } from './chunker';
import type { EmbeddingServiceImpl } from './embedding';
import { toVectorString } from './pgvector';

const log = createLogger('KnowledgeService');

// Type-safe Prisma JSON
type JsonValue = Prisma.InputJsonValue;
const asJson = (val: unknown): JsonValue => val as JsonValue;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_KB_NAME_LENGTH = 120;
const RESERVED_NAME_CHARS = /[\/\\:*?"<>|]/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KbProgress {
  stage: string;     // 'initializing' | 'parsing' | 'chunking' | 'embedding' | 'completed' | 'error'
  message: string;
  percent: number;   // 0-100
}

export interface KnowledgeServiceConfig {
  chunkSize?: number;
  chunkOverlap?: number;
}

// ---------------------------------------------------------------------------
// KnowledgeService
// ---------------------------------------------------------------------------

export class KnowledgeServiceImpl {
  private parser: ParsingServiceImpl;
  private chunker: ChunkerService;

  constructor(config: KnowledgeServiceConfig = {}) {
    this.parser = new ParsingServiceImpl();
    this.chunker = new ChunkerService({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
    });
  }

  // -------------------------------------------------------------------------
  // KB CRUD
  // -------------------------------------------------------------------------

  async listKbs(userId: string) {
    return prisma.dtKnowledgeBase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { documents: true } } },
    });
  }

  async createKb(userId: string, name: string, description?: string) {
    this.validateKbName(name);

    const existing = await prisma.dtKnowledgeBase.findUnique({
      where: { userId_name: { userId, name } },
    });
    if (existing) {
      throw new KnowledgeError(`Knowledge base "${name}" already exists`);
    }

    return prisma.dtKnowledgeBase.create({
      data: {
        userId,
        name,
        description: description ?? '',
        status: 'initializing',
        progress: asJson({
          stage: 'initializing',
          message: 'Creating knowledge base...',
          percent: 0,
        } satisfies KbProgress),
      },
    });
  }

  async getKb(kbId: string) {
    const kb = await prisma.dtKnowledgeBase.findUnique({
      where: { id: kbId },
      include: { _count: { select: { documents: true } } },
    });
    if (!kb) {
      throw new KnowledgeError(`Knowledge base not found: ${kbId}`, 404);
    }
    return kb;
  }

  async deleteKb(kbId: string) {
    // Cascade delete is handled by Prisma schema (documents → chunks)
    await prisma.dtKnowledgeBase.delete({ where: { id: kbId } });
    log.info(`Deleted knowledge base: ${kbId}`);
  }

  async updateKbStatus(kbId: string, status: string, progress?: KbProgress) {
    const data: Record<string, unknown> = { status };
    if (progress) {
      data.progress = asJson(progress);
    }
    if (status === 'ready') {
      data.lastIndexedAt = new Date();
    }
    return prisma.dtKnowledgeBase.update({
      where: { id: kbId },
      data: data as Record<string, unknown>,
    });
  }

  // -------------------------------------------------------------------------
  // Document Management
  // -------------------------------------------------------------------------

  async addDocument(
    kbId: string,
    filePath: string,
    fileName: string,
    fileSize?: number,
    mimeType?: string,
  ) {
    // Compute file hash for dedup
    let fileHash = '';
    try {
      const buffer = await readFile(filePath);
      fileHash = createHash('sha256').update(buffer).digest('hex');
    } catch {
      log.warn(`Could not compute hash for ${filePath}`);
    }

    // Check for duplicates
    if (fileHash) {
      const dup = await prisma.dtDocument.findFirst({
        where: { kbId, fileHash, status: { not: 'error' } },
      });
      if (dup) {
        throw new KnowledgeError(`Duplicate file: "${fileName}" already exists in this KB`);
      }
    }

    return prisma.dtDocument.create({
      data: {
        kbId,
        title: fileName,
        filePath,
        fileSize: fileSize ?? 0,
        mimeType: mimeType ?? '',
        fileHash,
        status: 'pending',
      },
    });
  }

  async updateDocumentStatus(
    docId: string,
    status: string,
    chunkCount?: number,
    errorMessage?: string,
  ) {
    const data: Record<string, unknown> = { status };
    if (chunkCount !== undefined) data.chunkCount = chunkCount;
    if (errorMessage !== undefined) data.errorMessage = errorMessage;
    return prisma.dtDocument.update({
      where: { id: docId },
      data: data as Record<string, unknown>,
    });
  }

  async listDocuments(kbId: string) {
    return prisma.dtDocument.findMany({
      where: { kbId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteDocument(docId: string) {
    await prisma.dtDocument.delete({ where: { id: docId } });
    log.info(`Deleted document: ${docId}`);
  }

  async checkDuplicateFile(kbId: string, fileHash: string) {
    const existing = await prisma.dtDocument.findFirst({
      where: { kbId, fileHash, status: { not: 'error' } },
    });
    return existing !== null;
  }

  // -------------------------------------------------------------------------
  // Indexing Pipeline
  // -------------------------------------------------------------------------

  /**
   * Index a single document: parse → chunk → embed → store chunks.
   * Updates document status, chunk count, and KB totals.
   */
  async indexDocument(docId: string, embeddingService: EmbeddingServiceImpl) {
    const doc = await prisma.dtDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new KnowledgeError(`Document not found: ${docId}`);

    const kb = await prisma.dtKnowledgeBase.findUnique({ where: { id: doc.kbId } });
    if (!kb) throw new KnowledgeError(`Knowledge base not found: ${doc.kbId}`);

    try {
      // Step 1: Parse
      await this.updateDocumentStatus(docId, 'parsing');
      await this.updateKbStatus(kb.id, 'processing', {
        stage: 'parsing',
        message: `Parsing ${doc.title}...`,
        percent: 10,
      });

      const parseResult = await this.parser.parse(doc.filePath);
      log.info(`Parsed ${doc.title}: ${parseResult.metadata.charCount} chars`);

      // Step 2: Chunk
      await this.updateDocumentStatus(docId, 'chunking');
      await this.updateKbStatus(kb.id, 'processing', {
        stage: 'chunking',
        message: `Chunking ${doc.title}...`,
        percent: 30,
      });

      const chunks = this.chunker.chunk(parseResult.text, {
        source: doc.title,
        filePath: doc.filePath,
        documentId: docId,
      });
      log.info(`Chunked ${doc.title} into ${chunks.length} chunks`);

      if (chunks.length === 0) {
        await this.updateDocumentStatus(docId, 'ready', 0);
        return 0;
      }

      // Step 3: Embed
      await this.updateDocumentStatus(docId, 'embedding');
      await this.updateKbStatus(kb.id, 'processing', {
        stage: 'embedding',
        message: `Embedding ${chunks.length} chunks from ${doc.title}...`,
        percent: 50,
      });

      const texts = chunks.map((c) => c.content);
      const embedResult = await embeddingService.embed(texts);

      // Update KB embedding info
      if (embedResult.embeddings.length > 0) {
        await prisma.dtKnowledgeBase.update({
          where: { id: kb.id },
          data: {
            embeddingModel: embedResult.model,
            embeddingDim: embedResult.embeddings[0].length,
          },
        });
      }

      // Step 4: Store chunks via Prisma (embedding stored as JSON array)
      await this.updateKbStatus(kb.id, 'processing', {
        stage: 'storing',
        message: `Storing ${chunks.length} chunks...`,
        percent: 80,
      });

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = embedResult.embeddings[i];
        const chunkId = generateChunkId();

        // Create the chunk row via Prisma (embedding set to null since it's Unsupported type)
        await prisma.dtDocumentChunk.create({
          data: {
            id: chunkId,
            documentId: docId,
            content: chunk.content,
            chunkIndex: chunk.index,
            metadata: asJson(chunk.metadata),
          },
        });

        // Set the embedding via raw SQL with ::vector cast
        if (vector && vector.length > 0) {
          await prisma.$executeRawUnsafe(
            `UPDATE dt_document_chunks SET embedding = $1::vector WHERE id = $2`,
            toVectorString(vector),
            chunkId,
          );
        }
      }

      // Step 5: Update counts
      await this.updateDocumentStatus(docId, 'ready', chunks.length);
      await this.refreshKbCounts(kb.id);
      await this.updateKbStatus(kb.id, 'ready', {
        stage: 'completed',
        message: `Indexed ${doc.title} (${chunks.length} chunks)`,
        percent: 100,
      });

      log.info(
        `Indexed ${doc.title}: ${chunks.length} chunks, ${embedResult.totalTokens} tokens`,
      );
      return chunks.length;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.updateDocumentStatus(docId, 'error', undefined, errorMsg);
      await this.updateKbStatus(kb.id, 'error', {
        stage: 'error',
        message: `Failed to index ${doc.title}: ${errorMsg}`,
        percent: 0,
      });
      log.error(`Failed to index document ${docId}:`, err);
      throw err;
    }
  }

  /**
   * Re-index all documents in a KB.
   * Deletes existing chunks and re-runs the pipeline.
   */
  async reindexKb(kbId: string, embeddingService: EmbeddingServiceImpl) {
    const kb = await this.getKb(kbId);
    const docs = await this.listDocuments(kbId);

    await this.updateKbStatus(kbId, 'processing', {
      stage: 'initializing',
      message: `Re-indexing ${docs.length} documents...`,
      percent: 0,
    });

    // Delete existing chunks
    for (const doc of docs) {
      await prisma.dtDocumentChunk.deleteMany({ where: { documentId: doc.id } });
      await this.updateDocumentStatus(doc.id, 'pending', 0);
    }

    // Re-index each document
    let totalChunks = 0;
    for (let i = 0; i < docs.length; i++) {
      const chunks = await this.indexDocument(docs[i].id, embeddingService);
      totalChunks += chunks;
    }

    log.info(`Re-indexed KB ${kbId}: ${docs.length} docs, ${totalChunks} chunks`);
    return totalChunks;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private validateKbName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new KnowledgeError('Knowledge base name cannot be empty');
    }
    if (name.length > MAX_KB_NAME_LENGTH) {
      throw new KnowledgeError(
        `Name too long: ${name.length} chars (max ${MAX_KB_NAME_LENGTH})`,
      );
    }
    if (RESERVED_NAME_CHARS.test(name)) {
      throw new KnowledgeError('Name contains reserved characters: / \\ : * ? " < > |');
    }
  }

  private async refreshKbCounts(kbId: string): Promise<void> {
    const readyDocs = await prisma.dtDocument.count({
      where: { kbId, status: 'ready' },
    });

    const totalChunksResult = await prisma.dtDocument.aggregate({
      where: { kbId, status: 'ready' },
      _sum: { chunkCount: true },
    });

    await prisma.dtKnowledgeBase.update({
      where: { id: kbId },
      data: {
        documentCount: readyDocs,
        totalChunks: totalChunksResult._sum.chunkCount ?? 0,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class KnowledgeError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'KnowledgeError';
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateChunkId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${timestamp}${random}`;
}

// Re-export interface for backward compatibility
export interface KnowledgeService {
  list(userId: string): Promise<Record<string, unknown>[]>;
  create(userId: string, name: string): Promise<string>;
  addDocument(kbId: string, filePath: string): Promise<void>;
}
