import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      version: '2.0.0',
      capabilities: ['chat', 'smartlearn', 'knowledge', 'memory', 'book', 'co-writer'],
    },
  });
}
