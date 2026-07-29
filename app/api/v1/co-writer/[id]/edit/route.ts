import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { getEditAgent, getOperationHistory } from '@/lib/deeptutor/bootstrap';
import { CowriterDbService } from '@/lib/deeptutor/services/cowriter-db-service';
import { validatedBody, errorToMessage, isValidationError, isSyntaxError } from '@/lib/server/validate';
import { CoWriterEditSchema } from '@/lib/server/schemas';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:co-writer');

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/co-writer/:id/edit — AI-powered text editing
 * Body: { text, instruction, action, source?, kbName?, language? }
 *
 * Applies an AI edit action (rewrite/shorten/expand/summarize) to the text.
 * Records the operation in history and optionally updates the document.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id: docId } = await params;
  return withAuth(request, async (req, { user }) => {
    try {
      const { text, instruction, action, source, kbName, language } =
        await validatedBody(CoWriterEditSchema, req);

      // Verify document ownership
      const db = new CowriterDbService();
      const existingDoc = await db.getDocument(docId);
      if (!existingDoc || existingDoc.userId !== user.id) {
        return apiError('Document not found', 404, 'NOT_FOUND');
      }

      const agent = getEditAgent();
      const result = await agent.edit({
        text,
        instruction: instruction || '',
        action,
        source,
        kbName,
        language,
      });

      // Record operation in history (global, since it's anonymous edit operations)
      const history = getOperationHistory();
      await history.add({
        id: result.operationId,
        action,
        instruction: instruction || '',
        originalLength: text.length,
        editedLength: result.editedText.length,
        timestamp: new Date().toISOString(),
      });

      // Update the document with edited text
      if (docId && result.editedText && !result.editedText.startsWith('[')) {
        await db.updateDocument(docId, { content: result.editedText });
      }

      return apiSuccess({
        editedText: result.editedText,
        operationId: result.operationId,
      });
    } catch (err) {
      if (isValidationError(err) || isSyntaxError(err)) {
        return apiError(errorToMessage(err), 400);
      }
      log.error('[co-writer] POST :id/edit error:', err);
      return apiError('Edit operation failed', 500);
    }
  });
}
