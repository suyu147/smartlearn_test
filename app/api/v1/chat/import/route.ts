/**
 * Chat Import API Route
 *
 * POST /api/v1/chat/import — Import conversations from external sources
 *
 * Accepts multipart/form-data with:
 * - file: The file to import (JSON, JSONL, or TXT)
 * - format: Optional format hint (chatgpt, claude, generic_json, jsonl, text)
 *
 * Returns imported conversations as JSON for preview,
 * or persists them to sessions if confirm=true.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { ChatImportService, type ImportFormat } from '@/lib/deeptutor/services/chat-import';

const log = createLogger('API:ChatImport');

const VALID_FORMATS = new Set<ImportFormat>([
  'chatgpt',
  'claude',
  'generic_json',
  'jsonl',
  'text',
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    const chatImportService = new ChatImportService();

    // Parse form data or JSON body
    let content: string;
    let format: ImportFormat | undefined;
    let filename: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const formatParam = formData.get('format') as string | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No file provided. Send a file field in multipart form data.' },
          { status: 400 },
        );
      }

      content = await file.text();
      filename = file.name;
      format = formatParam && VALID_FORMATS.has(formatParam as ImportFormat)
        ? (formatParam as ImportFormat)
        : undefined;
    } else {
      // JSON body
      const body = await request.json() as { content?: string; format?: string; filename?: string };

      if (!body.content) {
        return NextResponse.json(
          { success: false, error: 'No content provided. Send content field in JSON body or file in form data.' },
          { status: 400 },
        );
      }

      content = body.content;
      filename = body.filename ?? 'import.json';
      format = body.format && VALID_FORMATS.has(body.format as ImportFormat)
        ? (body.format as ImportFormat)
        : undefined;
    }

    // Import
    const conversations = await chatImportService.importContent(content, format ?? 'generic_json', filename);

    if (conversations.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: {
            conversationsImported: 0,
            messagesImported: 0,
            conversations: [],
            message: 'No conversations found in the imported file.',
          },
        },
      );
    }

    // Count total messages
    const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);

    return NextResponse.json({
      success: true,
      data: {
        conversationsImported: conversations.length,
        messagesImported: totalMessages,
        conversations: conversations.map((c) => ({
          id: c.id,
          title: c.title,
          messageCount: c.messages.length,
          source: c.source,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          // Include first 3 messages as preview
          preview: c.messages.slice(0, 3).map((m) => ({
            role: m.role,
            content: m.content.slice(0, 200),
          })),
        })),
      },
    });
  } catch (err) {
    log.error('Chat import failed:', err);

    const message = err instanceof SyntaxError
      ? 'Invalid file format. The file could not be parsed as JSON.'
      : err instanceof Error
        ? err.message
        : 'Unknown error during import';

    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
