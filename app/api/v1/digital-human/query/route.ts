import { NextResponse } from 'next/server';
import { queryVideoTask } from '@/lib/digital-human/vms-provider';
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
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: taskId' },
        { status: 400 },
      );
    }

    const result = await queryVideoTask({ taskId });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      taskId: result.taskId,
      taskStatus: result.taskStatus,
      text: result.text,
      imageUrl: result.imageUrl,
      audioUrl: result.audioUrl,
      bgmUrl: result.bgmUrl,
      videoUrl: result.videoUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Query failed: ${message}` },
      { status: 500 },
    );
  }
}
