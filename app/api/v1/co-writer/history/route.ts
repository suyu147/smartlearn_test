import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { getOperationHistory } from '@/lib/deeptutor/bootstrap';
import { withAuth } from '@/lib/deeptutor/services/auth-middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:co-writer');

/**
 * GET /api/v1/co-writer/history — List operation history
 * Query params: ?limit=20 (default 50, max 100)
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, _ctx) => {
    try {
      const limitParam = req.nextUrl.searchParams.get('limit');
      const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

      const history = getOperationHistory();
      const records = await history.list();

      return apiSuccess(records.slice(0, limit));
    } catch (err) {
      log.error('[co-writer] GET history error:', err);
      return apiError('Failed to load history', 500);
    }
  });
}
