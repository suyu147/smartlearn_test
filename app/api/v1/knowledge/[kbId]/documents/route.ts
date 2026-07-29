/**
 * POST /api/v1/knowledge/[kbId]/documents — Upload and index a document
 *
 * Expects multipart/form-data with:
 * - file: The document file to upload
 *
 * Or JSON with:
 * - filePath: Path to an already-uploaded file
 * - fileName: Display name
 * - fileSize: File size in bytes (optional)
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getDataDir } from '@/lib/paths';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { KnowledgeServiceImpl, KnowledgeError } from '@/lib/deeptutor/services/knowledge';
import { createEmbeddingService } from '@/lib/deeptutor/services/embedding';

const log = createLogger('KnowledgeDocRoute');

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') ?? 'anonymous';
}

function errorResponse(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const status = err instanceof KnowledgeError ? err.statusCode : fallbackStatus;
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    const { kbId } = await params;
    const userId = getUserId(req);
    const kbService = new KnowledgeServiceImpl();

    // Verify KB exists and belongs to user
    const kb = await kbService.getKb(kbId);

    let filePath: string;
    let fileName: string;
    let fileSize: number;
    let mimeType: string;

    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return new Response(JSON.stringify({ error: 'file is required in form data' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Save file to disk
      const uploadDir = getDataDir('knowledge_bases', kbId, 'raw');
      await mkdir(uploadDir, { recursive: true });

      fileName = file.name;
      filePath = join(uploadDir, `${Date.now()}_${fileName}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);
      fileSize = buffer.length;
      mimeType = file.type || 'application/octet-stream';
    } else {
      // Handle JSON body (file already on disk)
      const body = await req.json();
      filePath = body.filePath;
      fileName = body.fileName;
      fileSize = body.fileSize;
      mimeType = body.mimeType ?? '';

      if (!filePath || !fileName) {
        return new Response(JSON.stringify({ error: 'filePath and fileName are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Add document record
    const doc = await kbService.addDocument(kbId, filePath, fileName, fileSize, mimeType);

    // Start indexing asynchronously (don't block the response)
    // The progress can be polled via the KB status
    const embeddingService = createEmbeddingService();

    // Fire-and-forget indexing (progress tracked via KB status)
    kbService.indexDocument(doc.id, embeddingService).catch((err) => {
      log.error(`Background indexing failed for doc ${doc.id}:`, err);
    });

    return new Response(JSON.stringify({
      document: doc,
      message: 'Document uploaded. Indexing started in background.',
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('POST /api/v1/knowledge/[kbId]/documents failed:', err);
    return errorResponse(err);
  }
}
