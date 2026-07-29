export type TurningMode = 'click' | 'auto' | 'swipe' | 'no' | 'random' | 'slideX' | 'slideY' | 'slideX3D' | 'slideY3D' | 'fade' | 'rotate' | 'scaleY' | 'scaleX' | 'scale' | 'scaleReverse';

export interface SlideConfig {
  id: string;
  title?: string;
  layout?: string;
  animation?: {
    type: string;
    duration?: number;
    trigger?: 'click' | 'auto';
  };
  elements?: SlideElement[];
}

export interface SlideElement {
  id: string;
  type: 'text' | 'image' | 'code' | 'chart' | 'latex' | 'shape';
  content?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  style?: Record<string, unknown>;
}

export interface SceneData {
  id: string;
  title: string;
  slides: SlideConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface ChartData {
  type?: string;
  labels?: string[];
  legends?: string[];
  series?: number[][];
  datasets?: Array<{
    label?: string;
    data: number[];
    backgroundColor?: string | string[];
  }>;
  [key: string]: unknown;
}

export type LinePoint = { x: number; y: number } | string;

export type LineStyleType = 'solid' | 'dashed' | 'dotted' | 'none';

export type ShapePathFormulasKeys = string;

export interface PPTElementOutline {
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted' | 'none';
}

export interface PPTElementShadow {
  h: number;
  v: number;
  blur: number;
  color: string;
}

export interface PPTElementFill {
  type: 'solid' | 'gradient' | 'image' | 'pattern';
  color?: string;
  gradient?: { colors: string[]; direction: number };
  src?: string;
}

export interface PPTBaseElement {
  id: string;
  type: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
  lock?: boolean;
  outline?: PPTElementOutline;
  shadow?: PPTElementShadow;
  fill?: PPTElementFill;
  opacity?: number;
  link?: string;
  hotspots?: ConceptHotspot[];
}

/** 概念热区：PPT 元素中可点击展开讲解的关键词标注 */
export interface ConceptHotspot {
  keyword: string;        // 匹配的概念词
  snippet: string;        // 50-200字的概念讲解
  relatedResourceId?: string; // 关联的扩展资源（document/reading）
}

export type PPTElement = PPTBaseElement & Record<string, unknown>;

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'radar' | 'area';

export interface ChartOptions {
  type: ChartType;
  title?: string;
  legend?: boolean;
  [key: string]: unknown;
}

export interface PPTChartElement extends PPTBaseElement {
  type: 'chart';
  chartType: ChartType;
  chartData: ChartData;
  chartOptions?: ChartOptions;
  data?: ChartData;
  themeColors?: string[];
  textColor?: string;
  lineColor?: string;
  options?: ChartOptions;
}

export interface PPTImageElement extends PPTBaseElement {
  type: 'image';
  src: string;
  alt?: string;
  filters?: Record<string, unknown>;
  clipShape?: string;
}

export interface PPTShapeElement extends PPTBaseElement {
  type: 'shape';
  path?: string;
  pathFormula?: string;
  viewBox?: number[];
  fill?: PPTElementFill;
  text?: {
    content: string;
    [key: string]: unknown;
  };
}

export interface PPTVideoElement extends PPTBaseElement {
  type: 'video';
  src: string;
  poster?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

export interface PPTLatexElement extends PPTBaseElement {
  type: 'latex';
  latex: string;
  color?: string;
}

export interface PPTTableElement extends PPTBaseElement {
  type: 'table';
  data: {
    rows: number;
    cols: number;
    cells: PPTTableCell[][];
    [key: string]: unknown;
  };
  style?: Record<string, unknown>;
}

export interface PPTTableCell {
  id?: string;
  text: string;
  style?: Record<string, unknown>;
  colspan?: number;
  rowspan?: number;
}

export interface PPTLineElement {
  id: string;
  type: 'line';
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
  lock?: boolean;
  shadow?: PPTElementShadow;
  fill?: PPTElementFill;
  opacity?: number;
  link?: string;
  points: LinePoint[];
  lineStyle?: LineStyleType;
  color?: string;
  lineWidth?: number;
  [key: string]: unknown;
}

export interface PPTTextElement extends PPTBaseElement {
  type: 'text';
  content: string;
  style?: Record<string, unknown>;
}

export interface SlideBackground {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  gradient?: {
    type: 'linear' | 'radial';
    colors: Array<{ pos: number; color: string }>;
    rotate: number;
  };
  src?: string;
  [key: string]: unknown;
}

export interface SlideTheme {
  backgroundColor: string;
  themeColors: string[];
  fontColor: string;
  fontName: string;
  outline: PPTElementOutline;
  shadow: PPTElementShadow;
}

export interface Slide {
  id: string;
  viewportSize: number;
  viewportRatio: number;
  theme: SlideTheme;
  elements: PPTElement[];
  background?: SlideBackground;
}

export const ShapePathFormulasKeys = {
  ROUND_RECT: 'ROUND_RECT',
  CUT_RECT_DIAGONAL: 'CUT_RECT_DIAGONAL',
  CUT_RECT_SINGLE: 'CUT_RECT_SINGLE',
  CUT_RECT_SAMESIDE: 'CUT_RECT_SAMESIDE',
  ROUND_RECT_DIAGONAL: 'ROUND_RECT_DIAGONAL',
  ROUND_RECT_SINGLE: 'ROUND_RECT_SINGLE',
  ROUND_RECT_SAMESIDE: 'ROUND_RECT_SAMESIDE',
  CUT_ROUND_RECT: 'CUT_ROUND_RECT',
  MESSAGE: 'MESSAGE',
  ROUND_MESSAGE: 'ROUND_MESSAGE',
  L: 'L',
  RING_RECT: 'RING_RECT',
  DONUT: 'DONUT',
  DIAGSTRIPE: 'DIAGSTRIPE',
  PLUS: 'PLUS',
  TRIANGLE: 'TRIANGLE',
  PARALLELOGRAM_LEFT: 'PARALLELOGRAM_LEFT',
  PARALLELOGRAM_RIGHT: 'PARALLELOGRAM_RIGHT',
  TRAPEZOID: 'TRAPEZOID',
  BULLET: 'BULLET',
  INDICATOR: 'INDICATOR',
  ELLIPSE: 'ELLIPSE',
  DIAMOND: 'DIAMOND',
  PENTAGON: 'PENTAGON',
  HEXAGON: 'HEXAGON',
  ARROW: 'ARROW',
  ARROW_DOUBLE: 'ARROW_DOUBLE',
  STAR: 'STAR',
  HEART: 'HEART',
  PARALLELOGRAM: 'PARALLELOGRAM',
  CLOUD: 'CLOUD',
  CROSS: 'CROSS',
  RING: 'RING',
} as const;
