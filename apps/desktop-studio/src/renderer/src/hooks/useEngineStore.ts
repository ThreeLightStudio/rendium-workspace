import { engineStore } from '@rendium/engine';
import { useSyncExternalStore } from 'react';

/**
 * Hook to consume the engine state and dispatch actions.
 *
 * Phase 6 (Intent-Driven) API:
 *  - `dispatchIntent`    → engineStore.dispatchIntent  — **recommended** for all mutations
 *  - `dispatchTransient` → engineStore.dispatchTransient — 60 FPS drag preview (no Undo)
 *  - `undo` / `redo`     → history navigation
 *
 * Intent-Driven Draft-Commit pattern for sliders:
 *   onChange  → dispatchTransient({ type: 'TRANSIENT_LAYER_UPDATE', layerId, partial })
 *   onMouseUp → dispatchIntent({ type: 'CHANGE_OPACITY', layerId, opacity })
 */
export function useEngineStore() {
  const { layers, layerOrder, hoveredLayerId, duration, projectDuration, pxPerSec, width, height } =
    useSyncExternalStore(engineStore.subscribe, engineStore.getSnapshot);

  return {
    layers,
    layerOrder,
    hoveredLayerId,
    duration,
    projectDuration,
    pxPerSec,
    width,
    height,
    /** Phase 6: Intent-Driven dispatch — the recommended entry point. */
    dispatchIntent: engineStore.dispatchIntent,
    /** Phase 6: Transient intent for Draft-Commit 60 FPS preview. */
    dispatchTransient: engineStore.dispatchTransient,
    /** Phase 2+: Undo last committed manifest mutation. */
    undo: engineStore.undo,
    /** Phase 2+: Redo previously undone mutation. */
    redo: engineStore.redo,
    setPxPerSec: engineStore.setPxPerSec,
    getLayerById: engineStore.getLayerById,
  };
}
