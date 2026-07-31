import { type EngineIntent, type ILayerManifest, INTENT_TYPES } from '@rendium/engine';
import {
  isProjectAnchorManifest,
  isScopeEndManifest,
  isScopeStartManifest,
} from './canonicalLayer';
import { getLinkedVideoAudioLayerId } from './linkedVideoAudio';

export type Point = {
  x: number;
  y: number;
};

type ManifestLookup = {
  layers: Record<string, ILayerManifest>;
};

type MutableLayerManifest = Omit<ILayerManifest, 'id'> & {
  id: string;
};

function uniqueLayerIds(ids: string[]): string[] {
  return Array.from(new Set(ids)).filter((id) => id.length > 0);
}

function canDeleteLayer(layer: ILayerManifest): boolean {
  return !isProjectAnchorManifest(layer);
}

function canDuplicateLayer(layer: ILayerManifest): boolean {
  return canDeleteLayer(layer) && !isScopeStartManifest(layer) && !isScopeEndManifest(layer);
}

function canNudgeLayer(layer: ILayerManifest): boolean {
  return (
    !isProjectAnchorManifest(layer) &&
    !isScopeStartManifest(layer) &&
    !isScopeEndManifest(layer) &&
    layer.transform !== undefined
  );
}

function cloneManifest(layer: ILayerManifest): ILayerManifest {
  return structuredClone(layer) as ILayerManifest;
}

function createDuplicateLayerId(layerId: string): string {
  return `${layerId}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendCopySuffix(name: string, index: number): string {
  return index === 0 ? `${name} copy` : `${name} copy ${index + 1}`;
}

export function buildDeleteSelectionIntents(
  selectedLayerIds: string[],
  manifest: ManifestLookup,
): EngineIntent[] {
  const intents: EngineIntent[] = [];
  const removedLayerIds = new Set<string>();

  for (const layerId of uniqueLayerIds(selectedLayerIds)) {
    const layer = manifest.layers[layerId];
    if (!layer || !canDeleteLayer(layer)) {
      continue;
    }

    const idsToRemove = [layerId, getLinkedVideoAudioLayerId(manifest, layerId)].filter(
      (id): id is string => Boolean(id),
    );

    for (const id of idsToRemove) {
      if (removedLayerIds.has(id)) continue;

      const layerToRemove = manifest.layers[id];
      if (!layerToRemove || !canDeleteLayer(layerToRemove)) continue;

      removedLayerIds.add(id);
      intents.push({
        type: INTENT_TYPES.REMOVE_LAYER,
        layerId: id,
      });
    }
  }

  return intents;
}

export function buildDuplicateSelectionBatch(
  selectedLayerIds: string[],
  manifest: ManifestLookup,
  offsetStep = 16,
): {
  intents: EngineIntent[];
  createdLayerIds: string[];
} {
  const intents: EngineIntent[] = [];
  const createdLayerIds: string[] = [];

  uniqueLayerIds(selectedLayerIds).forEach((layerId, index) => {
    const layer = manifest.layers[layerId];
    if (!layer || !canDuplicateLayer(layer)) {
      return;
    }

    const duplicateLayer = cloneManifest(layer) as MutableLayerManifest;
    const nextLayerId = createDuplicateLayerId(layerId);

    duplicateLayer.id = nextLayerId;
    if (duplicateLayer.transform) {
      const offset = offsetStep * (index + 1);
      duplicateLayer.transform = {
        ...duplicateLayer.transform,
        position: {
          x: duplicateLayer.transform.position.x + offset,
          y: duplicateLayer.transform.position.y + offset,
        },
      };
    }
    if (duplicateLayer.name) {
      duplicateLayer.name = appendCopySuffix(duplicateLayer.name, index);
    }

    intents.push({
      type: INTENT_TYPES.ADD_LAYER,
      manifest: duplicateLayer,
      targetScopeId: findParentScopeId(manifest, layerId),
    });
    createdLayerIds.push(nextLayerId);
  });

  return {
    intents,
    createdLayerIds,
  };
}

function findParentScopeId(manifest: ManifestLookup, layerId: string): string {
  const order = 'layerOrder' in manifest ? (manifest as { layerOrder?: string[] }).layerOrder : [];
  if (!order) return '';
  const index = order.indexOf(layerId);
  if (index < 0) return '';
  const stack: string[] = [];
  for (let i = 0; i < index; i++) {
    const layer = manifest.layers[order[i] ?? ''];
    if (!layer) continue;
    if (isScopeStartManifest(layer)) stack.push(layer.id);
    if (isScopeEndManifest(layer)) stack.pop();
  }
  return stack[stack.length - 1] ?? '';
}

export function buildNudgeSelectionIntents(
  selectedLayerIds: string[],
  manifest: ManifestLookup,
  delta: Point,
): EngineIntent[] {
  const intents: EngineIntent[] = [];

  for (const layerId of uniqueLayerIds(selectedLayerIds)) {
    const layer = manifest.layers[layerId];
    if (!layer || !canNudgeLayer(layer) || !layer.transform) {
      continue;
    }

    const { position } = layer.transform;
    intents.push({
      type: INTENT_TYPES.UPDATE_TRANSFORM,
      layerId,
      position: {
        x: position.x + delta.x,
        y: position.y + delta.y,
      },
    });
  }

  return intents;
}
