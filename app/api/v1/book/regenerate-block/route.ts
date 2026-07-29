import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { createBookEngineWithConfig } from '@/lib/deeptutor/bootstrap';
import { BookDbService } from '@/lib/deeptutor/services/book-db-service';
import { resolveBookEngineConfigFromHeaders } from '@/lib/server/resolve-model';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { BookRegenerateBlockSchema } from '@/lib/server/schemas';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:book');

/**
 * POST /api/v1/book/regenerate-block
 * Body: { bookId, pageId, blockIndex }
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, { user }) => {
    try {
      const { bookId, pageId, blockIndex } =
        await validatedBody(BookRegenerateBlockSchema, req);

      // Verify ownership
      const db = new BookDbService();
      const record = await db.getBook(bookId);
      if (!record || record.userId !== user.id) {
        return apiError('Book not found', 404, 'NOT_FOUND');
      }

      const config = resolveBookEngineConfigFromHeaders(req);
      const engine = createBookEngineWithConfig(config);
      const page = await engine.regenerateBlock(bookId, pageId, blockIndex);

      if (!page) {
        return apiError('Page or block not found', 404, 'NOT_FOUND');
      }

      return apiSuccess(page);
    } catch (err) {
      if (isValidationError(err) || isSyntaxError(err)) {
        return apiError(errorToMessage(err), 400);
      }
      log.error('[book] regenerate-block error:', err);
      return apiError('Failed to regenerate block', 500);
    }
  });
}
