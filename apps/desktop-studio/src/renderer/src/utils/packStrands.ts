import type { ILayer } from '@rendium/engine';
import { getStudioLayerType } from './canonicalLayer';

/**
 * Extended layer type with trackIndex for UI positioning and optional hierarchy metadata.
 */
export interface IPackedLayer extends ILayer {
  trackIndex: number;
  sourceLayer: ILayer;
  parentSequenceId?: string;
}

/**
 * Packs a list of content layers (filtering out sequences) into horizontal tracks (rows)
 * to prevent temporal overlap while preserving hierarchy metadata.
 *
 * @param layers - All project layers (including ScopeStart/End).
 * @returns Array of IPackedLayer objects with assigned trackIndex and parentSequenceId.
 */
export function packStrands(layers: ILayer[]): IPackedLayer[] {
  const contentLayers: Array<Omit<IPackedLayer, 'trackIndex'>> = [];
  const sequenceStack: string[] = [];

  for (const layer of layers) {
    const layerType = getStudioLayerType(layer);
    if (layerType === 'scope:start') {
      sequenceStack.push(layer.id);
      continue;
    }

    if (layerType === 'scope:end') {
      sequenceStack.pop();
      continue;
    }

    const parentSequenceId = sequenceStack[sequenceStack.length - 1];
    contentLayers.push({
      ...layer,
      sourceLayer: layer,
      ...(parentSequenceId ? { parentSequenceId } : {}),
    });
  }

  const validLayers = contentLayers.filter((l) => l.duration > 0);
  const sortedLayers = [...validLayers].sort((a, b) => a.startTime - b.startTime);

  const trackLastEnds: number[] = [];

  return sortedLayers.map((layer) => {
    let assignedTrackIndex = -1;
    const layerEndTime = layer.startTime + layer.duration;

    for (let i = 0; i < trackLastEnds.length; i++) {
      if (layer.startTime >= trackLastEnds[i]) {
        assignedTrackIndex = i;
        break;
      }
    }

    if (assignedTrackIndex === -1) {
      assignedTrackIndex = trackLastEnds.length;
      trackLastEnds.push(layerEndTime);
    } else {
      trackLastEnds[assignedTrackIndex] = layerEndTime;
    }

    return {
      ...layer,
      trackIndex: assignedTrackIndex,
    };
  });
}
