import type { ILayer, IScene } from '../_contracts';
import { calculateContentDuration } from '../_utils/time';

const PROJECT_VIEWPORT_BUFFER_SECONDS = 5;

/**
 * UI-facing snapshot of the engine state.
 * Specifically tailored for React's useSyncExternalStore.
 */
export interface EngineSnapshot {
  layers: ILayer[];
  layerOrder: string[];
  hoveredLayerId: string | null;
  /** Timeline extent derived from layer content only. */
  duration: number;
  /** Project viewport extent used for UI framing and content bounds. */
  projectDuration: number;
  pxPerSec: number;
  width: number;
  height: number;
  undoStackSize: number;
  redoStackSize: number;
}

export interface CanvasCenter {
  x: number;
  y: number;
}

function isSequenceMarker(layer?: ILayer): boolean {
  return layer?.kind === 'control';
}

function isInfiniteRuntimeLayer(layer?: Pick<ILayer, 'isInfinite'>): boolean {
  return layer?.isInfinite === true;
}

function getProjectViewportDuration(contentDuration: number): number {
  return Math.max(0, contentDuration + PROJECT_VIEWPORT_BUFFER_SECONDS);
}

/**
 * Selectors for deriving UI-specific data from the engine core.
 * Separates React-specific view concerns from the pure engine state.
 */
export const EngineSelectors = {
  DEFAULT_PX_PER_SEC: 20,

  /**
   * Returns the canvas center for a given resolution.
   */
  getCanvasCenter(width: number, height: number): CanvasCenter {
    return {
      x: Math.round(width / 2),
      y: Math.round(height / 2),
    };
  },

  /**
   * Returns the canvas center from a snapshot-like object.
   */
  getCanvasCenterFromSnapshot(snapshot: Pick<EngineSnapshot, 'width' | 'height'>): CanvasCenter {
    return EngineSelectors.getCanvasCenter(snapshot.width, snapshot.height);
  },

  /**
   * Computes a stable snapshot for the UI.
   */
  buildSnapshot(
    scene: IScene,
    hoveredLayerId: string | null,
    pxPerSec: number,
    undoStackSize: number,
    redoStackSize: number,
  ): EngineSnapshot {
    const layers = [...scene.layers];
    const layerOrder = layers.map((layer) => layer.id);
    const contentDuration = calculateContentDuration<ILayer>(layers, {
      shouldSkip: (layer) => isSequenceMarker(layer) || isInfiniteRuntimeLayer(layer),
    });
    const projectDuration = getProjectViewportDuration(contentDuration);

    return {
      layers,
      layerOrder,
      hoveredLayerId,
      duration: contentDuration,
      projectDuration,
      pxPerSec,
      width: scene.width,
      height: scene.height,
      undoStackSize,
      redoStackSize,
    };
  },
};
