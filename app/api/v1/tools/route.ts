/**
 * GET /api/v1/tools — List all registered tools
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getToolRegistry } from '@/lib/deeptutor/bootstrap';
import type { BaseTool } from '@/lib/deeptutor/core/tool-protocol';

const log = createLogger('ToolsRoute');

export async function GET(_req: NextRequest) {
  try {
    const registry = getToolRegistry();
    const tools: BaseTool[] = registry.getAll();
    const summaries = tools.map((t) => {
      const def = t.getDefinition();
      return {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      };
    });
    return new Response(JSON.stringify({ success: true, data: summaries }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('GET /api/v1/tools failed:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
