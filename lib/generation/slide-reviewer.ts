/**
 * Slide Layout Reviewer — Post-generation quality check & fix
 *
 * Detects common layout issues (overlaps, overflows, alignment errors)
 * and either fixes them deterministically or asks the LLM to refine.
 */

import { buildPrompt, PROMPT_IDS } from './prompts';
import { parseJsonResponse } from './json-repair';
import type { PPTElement, SlideBackground, SlideTheme } from '@/lib/types/slides';
import type { AICallFn } from './pipeline-types';
import { createLogger } from '@/lib/logger';
const log = createLogger('SlideReviewer');

// ── Canvas constants (must match scene-builder) ──
const CANVAS_W = 1000;
const CANVAS_H = 562.5;
const MARGIN = 50;

// ── Layout issue types ──

interface LayoutIssue {
  elementId: string;
  type: 'overflow' | 'overlap' | 'misalign' | 'tiny' | 'orphan';
  severity: 'error' | 'warning';
  detail: string;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getRect(el: PPTElement): Rect {
  return {
    left: el.left ?? 0,
    top: el.top ?? 0,
    width: el.width ?? 0,
    height: el.height ?? 0,
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

// ── Deterministic checks (no LLM needed) ──

function detectOverflow(elements: PPTElement[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  for (const el of elements) {
    const r = getRect(el);
    if (r.left < MARGIN) {
      issues.push({ elementId: el.id, type: 'overflow', severity: 'error', detail: `Left edge ${r.left} < margin ${MARGIN}` });
    }
    if (r.top < 25) {
      issues.push({ elementId: el.id, type: 'overflow', severity: 'error', detail: `Top edge ${r.top} < 25` });
    }
    if (r.left + r.width > CANVAS_W - MARGIN) {
      issues.push({ elementId: el.id, type: 'overflow', severity: 'error', detail: `Right edge ${r.left + r.width} > ${CANVAS_W - MARGIN}` });
    }
    if (r.top + r.height > CANVAS_H - MARGIN / 2) {
      issues.push({ elementId: el.id, type: 'overflow', severity: 'error', detail: `Bottom edge ${r.top + r.height} > ${CANVAS_H - MARGIN / 2}` });
    }
  }
  return issues;
}

function detectOverlaps(elements: PPTElement[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  // Skip line elements (they have non-standard bounds)
  const solid = elements.filter((el) => el.type !== 'line');
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = getRect(solid[i]);
      const b = getRect(solid[j]);
      if (rectsOverlap(a, b)) {
        // Check if one is a background shape for the other (intentional overlap)
        const aIsBg = solid[i].type === 'shape' && (solid[i].fill as string | undefined);
        const bIsBg = solid[j].type === 'shape' && (solid[j].fill as string | undefined);
        const textOverShape =
          (aIsBg && solid[j].type === 'text') ||
          (bIsBg && solid[i].type === 'text');
        if (!textOverShape) {
          const overlapArea = computeOverlapArea(a, b);
          const smallerArea = Math.min(a.width * a.height, b.width * b.height);
          // Only flag if overlap > 15% of the smaller element
          if (overlapArea > smallerArea * 0.15) {
            issues.push({
              elementId: `${solid[i].id} & ${solid[j].id}`,
              type: 'overlap',
              severity: 'warning',
              detail: `Elements overlap by ${Math.round(overlapArea)}px² (${Math.round((overlapArea / smallerArea) * 100)}% of smaller)`,
            });
          }
        }
      }
    }
  }
  return issues;
}

function computeOverlapArea(a: Rect, b: Rect): number {
  const xOverlap = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return xOverlap * yOverlap;
}

function detectTinyElements(elements: PPTElement[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  for (const el of elements) {
    const r = getRect(el);
    if (el.type === 'text' && (r.width < 60 || r.height < 20)) {
      issues.push({ elementId: el.id, type: 'tiny', severity: 'warning', detail: `Text element too small: ${r.width}×${r.height}` });
    }
    if (el.type === 'image' && (r.width < 80 || r.height < 60)) {
      issues.push({ elementId: el.id, type: 'tiny', severity: 'warning', detail: `Image element too small: ${r.width}×${r.height}` });
    }
  }
  return issues;
}

function detectOrphanElements(elements: PPTElement[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  // Find shapes that don't have a nearby text element (background shapes without labels)
  const shapes = elements.filter((el) => el.type === 'shape');
  const texts = elements.filter((el) => el.type === 'text');
  for (const shape of shapes) {
    const sr = getRect(shape);
    // Check if shape is a decorative line (very thin)
    if (sr.height <= 4 || sr.width <= 4) continue;
    const hasNearbyText = texts.some((t) => {
      const tr = getRect(t);
      // Text center within shape bounds (with tolerance)
      const tcx = tr.left + tr.width / 2;
      const tcy = tr.top + tr.height / 2;
      return tcx >= sr.left - 20 && tcx <= sr.left + sr.width + 20 && tcy >= sr.top - 20 && tcy <= sr.top + sr.height + 20;
    });
    if (!hasNearbyText) {
      // Check if it's a large background shape (likely intentional)
      if (sr.width > 700 && sr.height > 300) continue;
      issues.push({ elementId: shape.id, type: 'orphan', severity: 'warning', detail: `Shape without nearby text element` });
    }
  }
  return issues;
}

// ── Deterministic auto-fixes ──

function applyDeterministicFixes(elements: PPTElement[]): PPTElement[] {
  return elements.map((el) => {
    const r = getRect(el);
    let { left, top, width, height } = r;

    // Clamp to canvas
    if (left < MARGIN) left = MARGIN;
    if (top < 25) top = 25;
    if (left + width > CANVAS_W - MARGIN) {
      if (width > CANVAS_W - 2 * MARGIN) {
        width = CANVAS_W - 2 * MARGIN;
        left = MARGIN;
      } else {
        left = CANVAS_W - MARGIN - width;
      }
    }
    if (top + height > CANVAS_H - MARGIN / 2) {
      if (height > CANVAS_H - MARGIN / 2 - 25) {
        height = CANVAS_H - MARGIN / 2 - 25;
        top = 25;
      } else {
        top = CANVAS_H - MARGIN / 2 - height;
      }
    }

    return { ...el, left, top, width, height };
  });
}

// ── LLM-based review ──

interface ReviewFix {
  id: string;
  updates: Partial<PPTElement>;
}

async function llmReviewAndFix(
  elements: PPTElement[],
  issues: LayoutIssue[],
  aiCall: AICallFn,
  title: string,
): Promise<PPTElement[]> {
  if (issues.length === 0) return elements;

  const issuesText = issues.map((i) => `- [${i.severity}] ${i.type}: ${i.detail} (element: ${i.elementId})`).join('\n');

  const elementsSummary = elements.map((el) => {
    const r = getRect(el);
    let extra = '';
    if (el.type === 'text') extra = ` content="${((el.content as string) || '').substring(0, 40)}"`;
    if (el.type === 'shape') extra = ` fill=${el.fill || 'none'}`;
    return `  { id:"${el.id}", type:"${el.type}", left:${r.left}, top:${r.top}, width:${r.width}, height:${r.height}${extra} }`;
  }).join('\n');

  const systemPrompt = `You are a PPT layout reviewer. Given a list of layout issues and the current elements, output ONLY a JSON array of fixes. Each fix is: {"id":"element_id","updates":{key:value pairs to change}}. Only fix the reported issues. If no fix needed, output []. Canvas: ${CANVAS_W}×${CANVAS_H}. Margin: ${MARGIN}px.`;

  const userPrompt = `Slide title: "${title}"\n\nDetected issues:\n${issuesText}\n\nCurrent elements:\n${elementsSummary}\n\nOutput fixes as JSON array:`;

  try {
    const response = await aiCall(systemPrompt, userPrompt);
    const fixes = parseJsonResponse<ReviewFix[]>(response);
    if (!Array.isArray(fixes) || fixes.length === 0) return elements;

    const fixMap = new Map(fixes.map((f) => [f.id, f.updates]));
    return elements.map((el) => {
      const fix = fixMap.get(el.id);
      if (!fix) return el;
      return { ...el, ...fix };
    });
  } catch (error) {
    log.warn('LLM review failed, keeping deterministic fixes:', error);
    return elements;
  }
}

// ── Public API ──

export interface ReviewResult {
  elements: PPTElement[];
  issues: LayoutIssue[];
  fixed: boolean;
}

/**
 * Review and fix slide layout issues.
 * 1. Run deterministic checks (overflow, overlap, tiny, orphan)
 * 2. Apply deterministic fixes (clamping)
 * 3. If issues remain, ask LLM to refine
 */
export async function reviewSlideLayout(
  elements: PPTElement[],
  aiCall: AICallFn,
  title: string,
): Promise<ReviewResult> {
  // Step 1: Detect issues
  const issues: LayoutIssue[] = [
    ...detectOverflow(elements),
    ...detectOverlaps(elements),
    ...detectTinyElements(elements),
    ...detectOrphanElements(elements),
  ];

  if (issues.length === 0) {
    log.debug(`Slide "${title}": No layout issues detected`);
    return { elements, issues: [], fixed: false };
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  log.info(`Slide "${title}": ${issues.length} issues (${errorCount} errors, ${warnCount} warnings)`);

  // Step 2: Apply deterministic fixes
  let fixed = applyDeterministicFixes(elements);

  // Step 3: Re-check after deterministic fixes
  const remainingIssues = [
    ...detectOverlaps(fixed),
    ...detectTinyElements(fixed),
    ...detectOrphanElements(fixed),
  ];

  // Step 4: If significant issues remain, use LLM
  if (remainingIssues.length > 0) {
    log.info(`Slide "${title}": ${remainingIssues.length} issues remain after deterministic fixes, requesting LLM review`);
    fixed = await llmReviewAndFix(fixed, remainingIssues, aiCall, title);
  }

  return { elements: fixed, issues, fixed: true };
}
