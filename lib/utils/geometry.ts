import type { PPTElement } from '@/lib/types/slides';

export interface PercentageGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;

export function findElementGeometry(
  sceneData: Record<string, unknown>,
  elementId: string,
): PercentageGeometry | null {
  const content = sceneData.content as {
    canvas?: { elements?: PPTElement[] };
  } | null;

  if (!content?.canvas?.elements) return null;

  const element = content.canvas.elements.find((el) => el.id === elementId);
  if (!element) return null;

  const left = (element.left ?? 0) / CANVAS_WIDTH;
  const top = (element.top ?? 0) / CANVAS_HEIGHT;
  const width = (element.width ?? 0) / CANVAS_WIDTH;
  const height = (element.height ?? 0) / CANVAS_HEIGHT;

  return {
    left,
    top,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}
