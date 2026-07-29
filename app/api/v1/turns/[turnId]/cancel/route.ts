/**
 * POST /api/v1/turns/[turnId]/cancel — Cancel a running turn
 *
 * Cancels the turn via SessionService and aborts any pending
 * ask_user input wait via InputHandler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { cancelTurn, getTurn } from '@/lib/deeptutor/services/session';
import { getInputHandler } from '@/lib/deeptutor/core/input-handler';

const log = createLogger('TurnCancelRoute');

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ turnId: string }> },
) {
  const { turnId } = await params;

  // Verify the turn exists
  const turn = await getTurn(turnId);
  if (!turn) {
    log.warn(`Cancel requested for unknown turn: ${turnId}`);
    return NextResponse.json(
      { error: 'Turn not found' },
      { status: 404 },
    );
  }

  // Cancel the turn in the database
  const cancelled = await cancelTurn(turnId);

  // Abort any pending ask_user wait
  getInputHandler().cancelPending(turnId);

  log.info(`Turn ${turnId} cancel requested (success: ${cancelled})`);

  return NextResponse.json({ success: true });
}
