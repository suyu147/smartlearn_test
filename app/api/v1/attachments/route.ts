/**
 * POST /api/v1/attachments — Upload file attachment for chat
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getDataDir } from '@/lib/paths';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const log = createLogger('AttachmentsRoute');

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') ?? 'anonymous';
}

function apiError(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error('error', err);
  return new Response(JSON.stringify({ error: message }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const contentType = req.headers.get('content-type') ?? '';

    if (!contentType.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: 'multipart/form-data with file is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: 'file field is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save to local disk
    const uploadDir = getDataDir('attachments', userId);
    await mkdir(uploadDir, { recursive: true });

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = join(uploadDir, `${timestamp}_${safeName}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const attachment = {
      id: `att_${timestamp}`,
      fileName: file.name,
      filePath,
      fileSize: buffer.length,
      mimeType: file.type || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify({ success: true, data: attachment }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('POST /api/v1/attachments failed:', err);
    return apiError(err);
  }
}
