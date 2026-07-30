import { NextResponse } from 'next/server';
import { generateVideo } from '@/lib/digital-human/vms-provider';
import { isVmsConfigured } from '@/lib/digital-human/auth';

export async function POST(request: Request) {
  if (!isVmsConfigured()) {
    return NextResponse.json(
      { success: false, error: 'VMS not configured' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const { prompt, wordCount, callbackUrl } = body;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: prompt' },
        { status: 400 },
      );
    }

    const result = await generateVideo({
      prompt,
      wordCount,
      callbackUrl,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      taskId: result.taskId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Generate failed: ${message}` },
      { status: 500 },
    );
  }
}
