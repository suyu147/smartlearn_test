import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:smartlearn:ppt');

interface PPTGenerationRequest {
  topic: string;
  style?: 'default' | 'minimal' | 'colorful' | 'academic';
  sceneCount?: number;
  language?: string;
  knowledgePoints?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PPTGenerationRequest;

    if (!body.topic) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: topic' },
        { status: 400 },
      );
    }

    const style = body.style ?? 'default';
    const sceneCount = body.sceneCount ?? 5;
    const language = body.language ?? 'zh';

    log.info(`PPT POST: topic="${body.topic}", style=${style}, scenes=${sceneCount}`);

    // PPT generation is handled by the learning graph's generate_resources node
    // which calls the PPT generator helper internally. This route provides a
    // structured response that the frontend can use to initiate generation
    // through the main /api/v1/smartlearn route.
    const placeholderScenes = Array.from({ length: sceneCount }, (_, i) => ({
      id: `scene_${i + 1}`,
      stageId: `ppt_${Date.now()}`,
      type: 'slide' as const,
      title: i === 0
        ? body.topic
        : i === sceneCount - 1
          ? '总结与回顾'
          : `第 ${i} 节 — ${body.knowledgePoints?.[i - 1] ?? `知识点 ${i}`}`,
      order: i,
      content: {
        type: 'slide' as const,
        canvas: {
          elements: [],
          background: '#ffffff',
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    log.info(`PPT response: topic="${body.topic}", scenes=${sceneCount}`);

    return NextResponse.json({
      success: true,
      data: {
        topic: body.topic,
        style,
        language,
        scenes: placeholderScenes,
        sceneCount: placeholderScenes.length,
        message: 'Use /api/v1/smartlearn with action=start for full PPT generation through the learning graph.',
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('PPT POST handler error:', err);
    return NextResponse.json(
      { success: false, error: `Internal server error: ${message}` },
      { status: 500 },
    );
  }
}
