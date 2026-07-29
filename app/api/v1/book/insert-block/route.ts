import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { createBookEngineWithConfig } from '@/lib/deeptutor/bootstrap';
import { BookDbService } from '@/lib/deeptutor/services/book-db-service';
import { resolveBookEngineConfigFromHeaders } from '@/lib/server/resolve-model';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { BookInsertBlockSchema } from '@/lib/server/schemas';
import type { BlockType } from '@/lib/deeptutor/services/book/models';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:book');

/**
 * POST /api/v1/book/insert-block
 * Body: { bookId, pageId, index, type, params }
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, { user }) => {
    try {
      const { bookId, pageId, index, type, params } =
        await validatedBody(BookInsertBlockSchema, req);

      // Verify ownership
      const db = new BookDbService();
      const record = await db.getBook(bookId);
      if (!record || record.userId !== user.id) {
        return apiError('Book not found', 404, 'NOT_FOUND');
      }

      const config = resolveBookEngineConfigFromHeaders(req);
      const engine = createBookEngineWithConfig(config);
      const page = await engine.insertBlock(
        bookId,
        pageId,
        index ?? 0,
        type as BlockType,
        params ?? {},
      );

      if (!page) {
        return apiError('Page not found', 404, 'NOT_FOUND');
      }

      return apiSuccess(page);
    } catch (err) {
      if (isValidationError(err) || isSyntaxError(err)) {
        return apiError(errorToMessage(err), 400);
      }
      log.error('[book] insert-block error:', err);
      return apiError('Failed to insert block', 500);
    }
  });
}
