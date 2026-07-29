/**
 * POST /api/v1/turns/[turnId]/input — Submit user input for ask_user
 *
 * Resolves a pending InputHandler.waitForInput() promise so the
 * SSE stream can continue processing with the user's reply.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getInputHandler } from '@/lib/deeptutor/core/input-handler';

const log = createLogger('TurnInputRoute');

interface InputRequestBody {
  input: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ turnId: string }> },
) {
  const { turnId } = await params;

  // Parse body
  let body: InputRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { input } = body;

  if (typeof input !== 'string') {
    return NextResponse.json(
      { error: 'input must be a string' },
      { status: 400 },
    );
  }

  // Submit input to the pending handler
  const handler = getInputHandler();
  const consumed = handler.submitInput(turnId, input);

  if (!consumed) {
    log.warn(`Input submitted for turn ${turnId} but no pending input found`);
    return NextResponse.json(
      { error: 'No pending input for this turn' },
      { status: 404 },
    );
  }

  log.info(`Input submitted for turn ${turnId}`);

  return NextResponse.json({ success: true });
}
