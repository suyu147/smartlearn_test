export type ActionType =
  | 'spotlight'
  | 'laser'
  | 'speech'
  | 'play-video'
  | 'play_video'
  | 'wb-open'
  | 'wb_open'
  | 'wb-draw-text'
  | 'wb_draw_text'
  | 'wb-draw-shape'
  | 'wb_draw_shape'
  | 'wb-draw-chart'
  | 'wb_draw_chart'
  | 'wb-draw-latex'
  | 'wb_draw_latex'
  | 'wb-draw-table'
  | 'wb_draw_table'
  | 'wb-draw-line'
  | 'wb_draw_line'
  | 'wb-clear'
  | 'wb_clear'
  | 'wb-delete'
  | 'wb_delete'
  | 'wb-close'
  | 'wb_close'
  | 'discussion'
  | 'open-concept'
  | 'open_concept'
  | 'run-code'
  | 'run_code';

export const SLIDE_ONLY_ACTIONS: ActionType[] = [
  'spotlight',
  'laser',
  'play-video',
  'play_video',
  'wb-draw-text',
  'wb_draw_text',
  'wb-draw-shape',
  'wb_draw_shape',
  'wb-draw-chart',
  'wb_draw_chart',
  'wb-draw-latex',
  'wb_draw_latex',
  'wb-draw-table',
  'wb_draw_table',
  'wb-draw-line',
  'wb_draw_line',
];

export interface ActionBase {
  id?: string;
  actionId?: string;
  actionName?: string;
  params?: Record<string, unknown>;
  agentId?: string;
  text?: string;
  content?: string;
  target?: string;
  url?: string;
  elementId?: string;
  dimOpacity?: number;
  shape?: string;
  chartType?: string;
  data?: unknown;
  latex?: string;
  rows?: unknown[][];
  points?: Array<{ x: number; y: number } | string>;
  topic?: string;
  participants?: Array<{ id: string; name: string; role: string }>;
  x?: number;
  y?: number;
  title?: string;
  color?: string;
  fontSize?: number;
  width?: number;
  height?: number;
  fillColor?: string;
  themeColors?: string[];
  audioId?: string;
  audioUrl?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  style?: string;
  outline?: {
    width: number;
    style: string;
    color: string;
  };
  theme?: {
    color: string;
  };
}

export interface SpotlightAction extends ActionBase {
  type: 'spotlight';
  target?: string;
  elementId: string;
}

export interface LaserAction extends ActionBase {
  type: 'laser';
  target?: string;
  elementId: string;
}

export interface SpeechAction extends ActionBase {
  type: 'speech';
  text: string;
}

export interface PlayVideoAction extends ActionBase {
  type: 'play-video' | 'play_video';
  url: string;
  elementId: string;
}

export interface WbOpenAction extends ActionBase {
  type: 'wb-open' | 'wb_open';
}

export interface WbDrawTextAction extends ActionBase {
  type: 'wb-draw-text' | 'wb_draw_text';
  x: number;
  y: number;
}

export interface WbDrawShapeAction extends ActionBase {
  type: 'wb-draw-shape' | 'wb_draw_shape';
  shape: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WbDrawChartAction extends ActionBase {
  type: 'wb-draw-chart' | 'wb_draw_chart';
  chartType: string;
  data: unknown;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WbDrawLatexAction extends ActionBase {
  type: 'wb-draw-latex' | 'wb_draw_latex';
  latex: string;
  x: number;
  y: number;
}

export interface WbDrawTableAction extends ActionBase {
  type: 'wb-draw-table' | 'wb_draw_table';
  data: string[][];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WbDeleteAction extends ActionBase {
  type: 'wb-delete' | 'wb_delete';
  elementId: string;
}

export interface WbDrawLineAction extends ActionBase {
  type: 'wb-draw-line' | 'wb_draw_line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface WbClearAction extends ActionBase {
  type: 'wb-clear' | 'wb_clear';
}

export interface WbCloseAction extends ActionBase {
  type: 'wb-close' | 'wb_close';
}

export interface DiscussionAction extends ActionBase {
  type: 'discussion';
  topic: string;
  prompt?: string;
  participants: Array<{ id: string; name: string; role: string }>;
}

export interface OpenConceptAction extends ActionBase {
  type: 'open-concept' | 'open_concept';
  keyword: string;
  snippet: string;
  relatedResourceId?: string;
}

export interface RunCodeAction extends ActionBase {
  type: 'run-code' | 'run_code';
  language: string;
  code: string;
  stdin?: string;
}

export type Action =
  | SpotlightAction
  | LaserAction
  | SpeechAction
  | PlayVideoAction
  | WbOpenAction
  | WbDrawTextAction
  | WbDrawShapeAction
  | WbDrawChartAction
  | WbDrawLatexAction
  | WbDrawTableAction
  | WbDeleteAction
  | WbDrawLineAction
  | WbClearAction
  | WbCloseAction
  | DiscussionAction
  | OpenConceptAction
  | RunCodeAction;

/**
 * Normalize action type from hyphen form (wb-draw-text) to underscore form (wb_draw_text).
 * LLM outputs may use either form; the engine's switch only handles underscore.
 * Non-wb and non-play actions (spotlight, laser, speech, discussion, open-concept, run-code) pass through unchanged.
 */
export function normalizeActionType(type: string): ActionType {
  // play-video → play_video
  if (type === 'play-video') return 'play_video';
  // open-concept → open_concept
  if (type === 'open-concept') return 'open_concept';
  // run-code → run_code
  if (type === 'run-code') return 'run_code';
  // wb-* → wb_* (e.g. wb-draw-text → wb_draw_text)
  if (type.startsWith('wb-')) return type.replace(/^wb-/, 'wb_') as ActionType;
  return type as ActionType;
}
