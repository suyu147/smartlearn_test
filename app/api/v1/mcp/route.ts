/**
 * GET  /api/v1/mcp — List MCP servers and their status
 * POST /api/v1/mcp — Register a new MCP server
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getMCPService } from '@/lib/deeptutor/bootstrap';

const log = createLogger('MCPRoute');

function apiError(err: unknown, fallbackStatus: number = 500) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error('error', err);
  return new Response(JSON.stringify({ error: message }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(_req: NextRequest) {
  try {
    const svc = getMCPService();
    const servers = svc.listServers();
    const status = svc.getStatus();
    return new Response(JSON.stringify({ success: true, data: { servers, status } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log.error('GET /api/v1/mcp failed:', err);
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { validatedBody } = await import('@/lib/server/validate');
    const { MCPServerCreateSchema } = await import('@/lib/server/schemas');
    const config = await validatedBody(MCPServerCreateSchema, req);

    const svc = getMCPService();
    svc.addServer({
      name: config.name,
      transport: 'stdio',
      command: config.command,
      args: config.args,
      env: config.env,
    });
    return new Response(JSON.stringify({ success: true, data: { name: config.name } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('POST /api/v1/mcp failed:', err);
    return apiError(err);
  }
}
