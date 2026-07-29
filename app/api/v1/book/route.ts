import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { getBookEngine, createBookEngineWithConfig } from '@/lib/deeptutor/bootstrap';
import { BookDbService } from '@/lib/deeptutor/services/book-db-service';
import { resolveBookEngineConfigFromHeaders } from '@/lib/server/resolve-model';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { BookCreateSchema } from '@/lib/server/schemas';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:book');

/**
 * GET /api/v1/book — List all books for the authenticated user
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, { user }) => {
    try {
      const db = new BookDbService();
      const books = await db.listBooks(user.id);
      return apiSuccess(books);
    } catch (err) {
      log.error('[book] GET error:', err);
      return apiError('Failed to list books', 500);
    }
  });
}

/**
 * POST /api/v1/book — Stage 1: Create a new book
 * Body: { userIntent, chatSelections?, notebookRefs?, knowledgeBases? }
 * Headers: x-api-key, x-provider, x-model, x-base-url (for LLM config)
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, { user }) => {
    try {
      const { userIntent, chatSelections, notebookRefs, knowledgeBases } =
        await validatedBody(BookCreateSchema, req);

      const config = resolveBookEngineConfigFromHeaders(req);
      const engine = createBookEngineWithConfig(config);
      const book = await engine.createBook(
        userIntent,
        { chatSelections, notebookRefs, knowledgeBases },
        (_event) => { /* SSE events handled by client */ },
      );

      // Store ownership record in DB
      const db = new BookDbService();
      await db.createBook(user.id, {
        id: book.id,
        title: book.proposal?.title ?? 'Untitled',
      });

      return apiSuccess(book, 201);
    } catch (err) {
      if (isValidationError(err) || isSyntaxError(err)) {
        return apiError(errorToMessage(err), 400);
      }
      log.error('[book] POST error:', err);
      return apiError('Failed to create book', 500);
    }
  });
}
