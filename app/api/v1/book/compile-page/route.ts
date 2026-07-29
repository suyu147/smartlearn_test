import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { createBookEngineWithConfig } from '@/lib/deeptutor/bootstrap';
import { BookDbService } from '@/lib/deeptutor/services/book-db-service';
import { resolveBookEngineConfigFromHeaders } from '@/lib/server/resolve-model';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { BookCompilePageSchema } from '@/lib/server/schemas';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:book');

/**
 * POST /api/v1/book/compile-page
 * Body: { bookId, pageId }
 * Stage 3-4: Compile a single page (plan blocks → generate)
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, { user }) => {
    try {
      const { bookId, pageId } = await validatedBody(BookCompilePageSchema, req);

      // Verify ownership
      const db = new BookDbService();
      const record = await db.getBook(bookId);
      if (!record || record.userId !== user.id) {
        return apiError('Book not found', 404, 'NOT_FOUND');
      }

      const config = resolveBookEngineConfigFromHeaders(req);
      const engine = createBookEngineWithConfig(config);
      const page = await engine.compilePage(bookId, pageId);

      if (!page) {
        return apiError('Page or chapter not found', 404, 'NOT_FOUND');
      }

      return apiSuccess(page);
    } catch (err) {
      if (isValidationError(err) || isSyntaxError(err)) {
        return apiError(errorToMessage(err), 400);
      }
      log.error('[book] compile-page error:', err);
      return apiError('Failed to compile page', 500);
    }
  });
}
