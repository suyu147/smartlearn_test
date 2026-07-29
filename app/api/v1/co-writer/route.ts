import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { CowriterDbService } from '@/lib/deeptutor/services/cowriter-db-service';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { CoWriterCreateSchema } from '@/lib/server/schemas';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:co-writer');

/**
 * GET /api/v1/co-writer — List all documents for the authenticated user
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, { user }) => {
    try {
      const db = new CowriterDbService();
      const docs = await db.listDocuments(user.id);
      return apiSuccess(docs);
    } catch (err) {
      log.error('[co-writer] GET error:', err);
      return apiError('Failed to list documents', 500);
    }
  });
}

/**
 * POST /api/v1/co-writer — Create a new document
 * Body: { title?: string, content?: string }
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, { user }) => {
    try {
      const { title, content } = await validatedBody(CoWriterCreateSchema, req);

      const db = new CowriterDbService();
      const doc = await db.createDocument(user.id, { title: title ?? '', content: content ?? '' });
      return apiSuccess(doc, 201);
    } catch (err) {
      if (isValidationError(err) || isSyntaxError(err)) {
        return apiError(errorToMessage(err), 400);
      }
      log.error('[co-writer] POST error:', err);
      return apiError('Failed to create document', 500);
    }
  });
}
