import { create } from 'zustand';
import { createSelectors } from '@/lib/utils/create-selectors';

interface SpotlightEffect {
  elementId: string;
  dimness: number;
}

interface ZoomTarget {
  elementId: string;
  scale: number;
}

interface CanvasState {
  canvasScale: number;
  selectedElementId: string | null;
  zoom: number;
  panX: number;
  panY: number;
  whiteboardOpen: boolean;
  whiteboardClearing: boolean;
  spotlightEffect: SpotlightEffect | null;
  laserElementId: string | null;
  laserOptions: { color: string; duration?: number } | null;
  zoomTarget: ZoomTarget | null;
  playingVideoElementId: string | null;
  setCanvasScale: (scale: number) => void;
  setSelectedElementId: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setWhiteboardOpen: (open: boolean) => void;
  setWhiteboardClearing: (clearing: boolean) => void;
  setSpotlight: (elementId: string, options: { dimness: number }) => void;
  setLaser: (elementId: string, options: { color: string; duration?: number }) => void;
  setZoomTarget: (target: ZoomTarget | null) => void;
  clearAllEffects: () => void;
  playVideo: (elementId: string) => void;
  clearCanvas: () => void;
}

const useCanvasStoreBase = create<CanvasState>()((set) => ({
  canvasScale: 1,
  selectedElementId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  whiteboardOpen: false,
  whiteboardClearing: false,
  spotlightEffect: null,
  laserElementId: null,
  laserOptions: null,
  zoomTarget: null,
  playingVideoElementId: null,
  setCanvasScale: (canvasScale) => set({ canvasScale }),
  setSelectedElementId: (selectedElementId) => set({ selectedElementId }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (panX, panY) => set({ panX, panY }),
  setWhiteboardOpen: (whiteboardOpen) => set({ whiteboardOpen }),
  setWhiteboardClearing: (whiteboardClearing) => set({ whiteboardClearing }),
  setSpotlight: (elementId, options) =>
    set({ spotlightEffect: { elementId, dimness: options.dimness } }),
  setLaser: (elementId, options) =>
    set({ laserElementId: elementId, laserOptions: options }),
  setZoomTarget: (zoomTarget) => set({ zoomTarget }),
  clearAllEffects: () =>
    set({ spotlightEffect: null, laserElementId: null, laserOptions: null, zoomTarget: null }),
  playVideo: (elementId) => set({ playingVideoElementId: elementId }),
  clearCanvas: () =>
    set({
      canvasScale: 1,
      selectedElementId: null,
      zoom: 1,
      panX: 0,
      panY: 0,
      spotlightEffect: null,
      laserElementId: null,
      laserOptions: null,
      zoomTarget: null,
    }),
}));

export const useCanvasStore = createSelectors(useCanvasStoreBase);
