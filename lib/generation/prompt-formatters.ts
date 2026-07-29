import type { PdfImage } from '@/lib/types/generation';
import type { AgentInfo } from './pipeline-types';

export function buildCourseContext(_outlines: unknown, _language?: string): string {
  return '';
}

export function formatAgentsForPrompt(agents: AgentInfo[] | undefined): string {
  if (!agents) return '';
  return agents.map((a) => `- ${a.name} (${a.id}): ${a.role}`).join('\n');
}

export function formatTeacherPersonaForPrompt(_persona: string | unknown[] | undefined): string {
  return '';
}

export function formatImageDescription(image: PdfImage, _language: string): string {
  return `[Image: ${image.id}, ${image.width}x${image.height}]`;
}

export function formatImagePlaceholder(image: PdfImage, _language: string): string {
  return `[Image placeholder: ${image.id}]`;
}

export function buildVisionUserContent(
  _userPrompt: string,
  _images: Array<{ id: string; src: string }>,
): Array<Record<string, unknown>> {
  return [];
}
