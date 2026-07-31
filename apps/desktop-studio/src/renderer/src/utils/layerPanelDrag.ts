import type { ILayer, LayerId } from '@rendium/engine';
import {
  engineStore,
  getInsertionParentSequenceStartLayer,
  getParentSequenceStartLayer,
} from '@rendium/engine';
import { isScopeEndManifest, isScopeStartManifest } from './canonicalLayer';
import type { UITreeNode } from './layerTree';

export type LayerPanelDropPosition = 'before' | 'after';

export interface LayerPanelDropIndicator {
  readonly targetLayerId: LayerId;
  readonly position: LayerPanelDropPosition;
  readonly toIndex: number;
}

type LayerPanelDragTarget = Pick<UITreeNode, 'layer' | 'orderIndex'>;

function getDropPosition(
  clientY: number,
  targetTop: number,
  targetHeight: number,
): LayerPanelDropPosition {
  const midpoint = targetTop + targetHeight / 2;
  return clientY < midpoint ? 'before' : 'after';
}

function getAdjustedInsertIndex(sourceIndex: number, candidateIndex: number): number {
  return sourceIndex < candidateIndex ? candidateIndex - 1 : candidateIndex;
}

export function resolveLayerPanelDropIndicator({
  layers,
  layerOrder,
  sourceLayerId,
  targetNode,
  clientY,
  targetTop,
  targetHeight,
}: {
  readonly layers: ILayer[];
  readonly layerOrder: string[];
  readonly sourceLayerId: LayerId | null;
  readonly targetNode: LayerPanelDragTarget;
  readonly clientY: number;
  readonly targetTop: number;
  readonly targetHeight: number;
}): LayerPanelDropIndicator | null {
  if (!sourceLayerId) return null;

  void layers;
  void layerOrder;
  const manifest = engineStore.getManifest();
  const sourceLayer = manifest.layers[sourceLayerId];
  if (!sourceLayer || isScopeStartManifest(sourceLayer) || isScopeEndManifest(sourceLayer)) {
    return null;
  }

  if (targetNode.layer.id === sourceLayerId) {
    return null;
  }

  const sourceIndex = manifest.layerOrder.indexOf(sourceLayerId);
  if (sourceIndex === -1) return null;

  const position = getDropPosition(clientY, targetTop, targetHeight);
  const candidateIndex = position === 'before' ? targetNode.orderIndex : targetNode.orderIndex + 1;
  const currentParentSequence = getParentSequenceStartLayer(manifest, sourceLayerId);
  const targetParentSequence = getInsertionParentSequenceStartLayer(manifest, candidateIndex);
  if (
    !currentParentSequence ||
    !targetParentSequence ||
    currentParentSequence.id !== targetParentSequence.id
  ) {
    return null;
  }

  const toIndex = getAdjustedInsertIndex(sourceIndex, candidateIndex);
  if (toIndex === sourceIndex) {
    return null;
  }

  return {
    targetLayerId: targetNode.layer.id,
    position,
    toIndex,
  };
}
