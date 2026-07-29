import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { createBookEngineWithConfig } from '@/lib/deeptutor/bootstrap';
import { BookDbService } from '@/lib/deeptutor/services/book-db-service';
import { resolveBookEngineConfigFromHeaders } from '@/lib/server/resolve-model';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { BookIdBodySchema } from '@/lib/server/schemas';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:book');

/**
 * POST /api/v1/book/confirm-proposal
 * Body: { bookId }
 * Stage 2: Confirm proposal → generate spine via SpineSynthesizer
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, { user }) => {
    try {
      const { bookId } = await validatedBody(BookIdBodySchema, req);

      // Verify ownership
      const db = new BookDbService();
      const record = await db.getBook(bookId);
      if (!record || record.userId !== user.id) {
        return apiError('Book not found', 404, 'NOT_FOUND');
      }

      const config = resolveBookEngineConfigFromHeaders(req);
      const engine = createBookEngineWithConfig(config);
      const result = await engine.confirmProposal(bookId);

      return apiSuccess({
        book: result.book,
        chapterCount: result.spine.chapters.length,
      });
    } catch (err) {
      if (isValidationError(err) || isSyntaxError(err)) {
        return apiError(errorToMessage(err), 400);
      }
      log.error('[book] confirm-proposal error:', err);
      return apiError(err instanceof Error ? err.message : 'Failed to confirm proposal', 500);
    }
  });
}
