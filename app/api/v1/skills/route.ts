/**
 * GET /api/v1/skills — List available skill packs
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getSkillService, getBuiltInSkillPacks } from '@/lib/deeptutor/bootstrap';
import type { SkillSummary } from '@/lib/deeptutor/services/skill';

const log = createLogger('SkillsRoute');

export async function GET(_req: NextRequest) {
  try {
    const skillService = getSkillService();
    const userSkills: SkillSummary[] = await skillService.listSkills();
    const builtInMap = getBuiltInSkillPacks();
    const builtIn = [...builtInMap.values()];

    const all = [
      ...userSkills.map((s) => ({ name: s.name, description: s.description, tags: s.tags, always: s.always, source: 'user' })),
      ...builtIn.map((s) => ({ name: s.name, description: s.description ?? '', tags: [], always: false, source: 'built-in' })),
    ];

    return new Response(JSON.stringify({ success: true, data: all }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('GET /api/v1/skills failed:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
