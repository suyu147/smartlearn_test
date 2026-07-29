import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { getBookEngine } from '@/lib/deeptutor/bootstrap';
import { BookDbService } from '@/lib/deeptutor/services/book-db-service';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:book');

type Params = { params: Promise<{ id: string }> };

/** Verify the authenticated user owns this book */
async function verifyOwnership(bookId: string, userId: string): Promise<boolean> {
  const db = new BookDbService();
  const book = await db.getBook(bookId);
  return book !== null && book.userId === userId;
}

/**
 * GET /api/v1/book/:id — Load a full book (manifest + spine + pages + progress)
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: bookId } = await params;
  return withAuth(request, async (_req, { user }) => {
    try {
      // Verify ownership
      if (!(await verifyOwnership(bookId, user.id))) {
        return apiError('Book not found', 404, 'NOT_FOUND');
      }

      const engine = getBookEngine();
      const result = await engine.getStorage().loadFullBook(bookId);

      if (!result) {
        return apiError('Book not found', 404, 'NOT_FOUND');
      }

      return apiSuccess(result);
    } catch (err) {
      log.error('[book] GET :id error:', err);
      return apiError('Failed to load book', 500);
    }
  });
}

/**
 * DELETE /api/v1/book/:id — Delete a book
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: bookId } = await params;
  return withAuth(request, async (_req, { user }) => {
    try {
      // Verify ownership
      if (!(await verifyOwnership(bookId, user.id))) {
        return apiError('Book not found', 404, 'NOT_FOUND');
      }

      const engine = getBookEngine();
      const deleted = await engine.getStorage().deleteBook(bookId);

      if (!deleted) {
        return apiError('Book not found', 404, 'NOT_FOUND');
      }

      // Also delete DB record
      const db = new BookDbService();
      await db.deleteBook(bookId);

      return apiSuccess({ deleted: true });
    } catch (err) {
      log.error('[book] DELETE :id error:', err);
      return apiError('Failed to delete book', 500);
    }
  });
}
