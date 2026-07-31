import type { EngineIntent, ILayer, LayerId } from '@rendium/engine';
import type { DragEvent } from 'react';
import { useCallback, useState } from 'react';
import {
  type LayerPanelDropIndicator,
  resolveLayerPanelDropIndicator,
} from '../utils/layerPanelDrag';
import type { UITreeNode } from '../utils/layerTree';

interface UseLayerPanelDragProps {
  dispatchIntent: (intent: EngineIntent) => void;
  layers: ILayer[];
  layerOrder: string[];
}

/**
 * Headless Hook for Layer Panel Drag & Drop.
 * Uses Intent-Driven API to reorder layers.
 */
export function useLayerPanelDrag({ dispatchIntent, layers, layerOrder }: UseLayerPanelDragProps) {
  const [draggingId, setDraggingId] = useState<LayerId | null>(null);
  const [dropIndicator, setDropIndicator] = useState<LayerPanelDropIndicator | null>(null);

  const clearDropState = useCallback(() => {
    setDraggingId(null);
    setDropIndicator(null);
  }, []);

  const onDragStart = useCallback((e: DragEvent, id: LayerId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  }, []);

  const onDragOver = useCallback(
    (e: DragEvent, targetNode: UITreeNode) => {
      if (draggingId === null) return;

      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const indicator = resolveLayerPanelDropIndicator({
        layers,
        layerOrder,
        sourceLayerId: draggingId,
        targetNode,
        clientY: e.clientY,
        targetTop: rect.top,
        targetHeight: rect.height,
      });

      setDropIndicator(indicator);
    },
    [draggingId, layerOrder, layers],
  );

  const onDrop = useCallback(() => {
    if (draggingId === null || dropIndicator === null) {
      clearDropState();
      return;
    }

    // Dispatch reorder intent — Intent Router handles the layerOrder splice logic.
    dispatchIntent({
      type: 'REORDER_LAYER',
      layerId: draggingId,
      toIndex: dropIndicator.toIndex,
    });

    clearDropState();
  }, [clearDropState, dispatchIntent, draggingId, dropIndicator]);

  const onDragEnd = useCallback(() => {
    clearDropState();
  }, [clearDropState]);

  const onDragLeave = useCallback((event: DragEvent) => {
    if (
      event.currentTarget !== event.target &&
      event.currentTarget.contains(event.relatedTarget as Node | null)
    ) {
      return;
    }
    setDropIndicator(null);
  }, []);

  return {
    draggingId,
    dropIndicator,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onDragLeave,
    clearDropState,
  };
}
