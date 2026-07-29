import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { CowriterDbService } from '@/lib/deeptutor/services/cowriter-db-service';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { CoWriterUpdateSchema } from '@/lib/server/schemas';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:co-writer');

type Params = { params: Promise<{ id: string }> };

/** Verify the authenticated user owns this document */
async function verifyOwnership(docId: string, userId: string): Promise<boolean> {
  const db = new CowriterDbService();
  const doc = await db.getDocument(docId);
  return doc !== null && doc.userId === userId;
}

/**
 * GET /api/v1/co-writer/:id — Load a single document
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: docId } = await params;
  return withAuth(request, async (_req, { user }) => {
    try {
      const db = new CowriterDbService();
      const doc = await db.getDocument(docId);

      if (!doc || doc.userId !== user.id) {
        return apiError('Document not found', 404, 'NOT_FOUND');
      }

      return apiSuccess(doc);
    } catch (err) {
      log.error('[co-writer] GET :id error:', err);
      return apiError('Failed to load document', 500);
    }
  });
}

/**
 * PUT /api/v1/co-writer/:id — Update a document
 * Body: { title?: string, content?: string }
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const { id: docId } = await params;
  return withAuth(request, async (req, { user }) => {
    try {
      // Verify ownership
      if (!(await verifyOwnership(docId, user.id))) {
        return apiError('Document not found', 404, 'NOT_FOUND');
      }

      const { title, content } = await validatedBody(CoWriterUpdateSchema, req);

      const db = new CowriterDbService();
      const doc = await db.updateDocument(docId, { title, content });

      if (!doc) {
        return apiError('Document not found', 404, 'NOT_FOUND');
      }

      return apiSuccess(doc);
    } catch (err) {
      if (isValidationError(err) || isSyntaxError(err)) {
        return apiError(errorToMessage(err), 400);
      }
      log.error('[co-writer] PUT :id error:', err);
      return apiError('Failed to update document', 500);
    }
  });
}

/**
 * DELETE /api/v1/co-writer/:id — Delete a document
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: docId } = await params;
  return withAuth(request, async (_req, { user }) => {
    try {
      // Verify ownership
      if (!(await verifyOwnership(docId, user.id))) {
        return apiError('Document not found', 404, 'NOT_FOUND');
      }

      const db = new CowriterDbService();
      const deleted = await db.deleteDocument(docId);

      if (!deleted) {
        return apiError('Document not found', 404, 'NOT_FOUND');
      }

      return apiSuccess({ deleted: true });
    } catch (err) {
      log.error('[co-writer] DELETE :id error:', err);
      return apiError('Failed to delete document', 500);
    }
  });
}
