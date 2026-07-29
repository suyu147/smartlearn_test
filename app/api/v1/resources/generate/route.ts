import { NextRequest, NextResponse } from 'next/server';
import { generateResource } from '@/lib/learning-graph/helpers/resource-generators';
import type { ResourceType } from '@/lib/types/resource';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:resources:generate');

type AIConfig = {
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
};

interface GenerateRequest {
  type: ResourceType;
  name: string;
  aiConfig?: AIConfig;
}

/**
 * Allowed resource types for the standalone generator.
 * PPT is excluded — it has its own dedicated generation pipeline.
 */
const ALLOWED_TYPES: ResourceType[] = [
  'document',
  'video',
  'quiz',
  'mindmap',
  'reading',
  'code',
];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateRequest;

    // Validate required fields
    if (!body.type || !body.name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: type, name' },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(body.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported resource type: ${body.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`,
        },
        { status: 400 },
      );
    }

    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Resource name cannot be empty' },
        { status: 400 },
      );
    }

    log.info(`Generate POST: type=${body.type}, name="${name.slice(0, 80)}"`);

    // Reuse the existing generation logic — treat the user-provided name as
    // the knowledge point / topic. Profile is omitted (standalone generation).
    const result = await generateResource(
      body.type,
      [name],
      null,
      body.aiConfig,
    );

    log.info(`Generate success: type=${body.type}, name="${name.slice(0, 60)}"`);

    return NextResponse.json({
      success: true,
      data: {
        type: body.type,
        title: result.title,
        content: result.content,
        metadata: result.metadata,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Generate POST handler error:', err);
    return NextResponse.json(
      { success: false, error: `Internal server error: ${message}` },
      { status: 500 },
    );
  }
}
