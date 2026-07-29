/**
 * GET /api/v1/agents — List available agents/capabilities
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getCapabilityRegistry } from '@/lib/deeptutor/bootstrap';

const log = createLogger('AgentsRoute');

export async function GET(_req: NextRequest) {
  try {
    const registry = getCapabilityRegistry();
    const capabilities = registry.getAll();

    const agents = capabilities.map((cap) => ({
      id: cap.manifest.name,
      name: cap.manifest.name,
      description: cap.manifest.description,
      stages: cap.manifest.stages,
      toolsUsed: cap.manifest.toolsUsed,
    }));

    return new Response(JSON.stringify({ success: true, data: agents }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('GET /api/v1/agents failed:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
