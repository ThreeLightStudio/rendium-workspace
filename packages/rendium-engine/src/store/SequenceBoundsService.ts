import type { ILayerManifest, IProjectManifest, LayerId, ScopeRuleType } from '../_contracts';
import { calculateContentDuration } from '../_utils/time';

type SequenceManifest = Pick<IProjectManifest, 'layers' | 'layerOrder'>;

function isSequenceStart(layer?: Pick<ILayerManifest, 'kind' | 'control'>): boolean {
  return layer?.kind === 'control' && layer.control?.role === 'scopeStart';
}

function isSequenceEnd(layer?: Pick<ILayerManifest, 'kind' | 'control'>): boolean {
  return layer?.kind === 'control' && layer.control?.role === 'scopeEnd';
}

function isSequenceMarker(layer?: Pick<ILayerManifest, 'kind' | 'control'>): boolean {
  return isSequenceStart(layer) || isSequenceEnd(layer);
}

function getLayerById(manifest: SequenceManifest, layerId: LayerId): ILayerManifest | undefined {
  return manifest.layers[layerId];
}

function getLayerIndex(manifest: SequenceManifest, layerId: LayerId): number {
  return manifest.layerOrder.indexOf(layerId);
}

function getProjectedEndTime(layer: Pick<ILayerManifest, 'startTime' | 'duration'>): number {
  const startTime = layer.startTime ?? 0;
  const duration = layer.duration ?? 0;
  return startTime + duration;
}

function isInfiniteManifestLayer(layer?: ILayerManifest): boolean {
  void layer;
  return false;
}

export function getProjectContentDuration(manifest: SequenceManifest): number {
  return calculateContentDuration<ILayerManifest>(
    manifest.layerOrder.map((layerId) => manifest.layers[layerId]),
    {
      shouldSkip: (layer) => isSequenceMarker(layer) || isInfiniteManifestLayer(layer),
    },
  );
}

export interface SequenceBounds {
  readonly sequenceStartId: LayerId;
  readonly sequenceEndId: LayerId | undefined;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly parentSequenceStartId?: LayerId;
}

export interface GetSequenceBoundsInput {
  readonly manifest: SequenceManifest;
  readonly sequenceStartId: LayerId;
}

export interface GetSequenceDurationInput {
  readonly manifest: SequenceManifest;
  readonly sequenceStartId: LayerId;
}

function findSequenceStartIndex(
  manifest: SequenceManifest,
  sequenceStartId: LayerId,
): number | undefined {
  const index = getLayerIndex(manifest, sequenceStartId);
  return index === -1 ? undefined : index;
}

function findSequenceEndIndex(
  manifest: SequenceManifest,
  sequenceStartIndex: number,
): number | undefined {
  let depth = 0;

  for (let i = sequenceStartIndex; i < manifest.layerOrder.length; i++) {
    const layerId = manifest.layerOrder[i];
    const layer = layerId ? manifest.layers[layerId] : undefined;
    if (!layer) continue;

    if (isSequenceStart(layer)) {
      depth++;
      continue;
    }

    if (isSequenceEnd(layer)) {
      depth--;
      if (depth === 0) return i;
    }
  }

  return undefined;
}

function findParentSequenceStartIndex(
  manifest: SequenceManifest,
  layerIndex: number,
): number | undefined {
  if (layerIndex <= 0) return undefined;

  let depth = 0;
  for (let i = layerIndex - 1; i >= 0; i--) {
    const layerId = manifest.layerOrder[i];
    const layer = layerId ? manifest.layers[layerId] : undefined;
    if (!layer) continue;

    if (isSequenceEnd(layer)) {
      depth++;
      continue;
    }

    if (isSequenceStart(layer)) {
      if (depth === 0) return i;
      depth--;
    }
  }

  return undefined;
}

export function getSequenceBounds(input: GetSequenceBoundsInput): SequenceBounds | undefined {
  const { manifest, sequenceStartId } = input;
  const sequenceStartIndex = findSequenceStartIndex(manifest, sequenceStartId);
  if (sequenceStartIndex === undefined) return undefined;

  const sequenceStartLayer = manifest.layers[sequenceStartId];
  if (!sequenceStartLayer || !isSequenceStart(sequenceStartLayer)) return undefined;

  const sequenceEndIndex = findSequenceEndIndex(manifest, sequenceStartIndex);
  if (sequenceEndIndex === undefined) return undefined;

  const sequenceEndId = manifest.layerOrder[sequenceEndIndex];
  const startTime = sequenceStartLayer.startTime ?? 0;
  let duration = 0;

  for (let i = sequenceStartIndex + 1; i < sequenceEndIndex; i++) {
    const layerId = manifest.layerOrder[i];
    const layer = layerId ? manifest.layers[layerId] : undefined;
    if (!layer || isSequenceMarker(layer)) continue;

    duration = Math.max(duration, getProjectedEndTime(layer) - startTime);
  }

  duration = Math.max(0, duration);

  const parentSequenceStartIndex = findParentSequenceStartIndex(manifest, sequenceStartIndex);

  return {
    sequenceStartId,
    sequenceEndId: typeof sequenceEndId === 'string' ? sequenceEndId : undefined,
    startIndex: sequenceStartIndex,
    endIndex: sequenceEndIndex,
    startTime,
    endTime: startTime + duration,
    duration,
    ...(parentSequenceStartIndex !== undefined
      ? { parentSequenceStartId: manifest.layerOrder[parentSequenceStartIndex] }
      : {}),
  };
}

export function getSequenceDuration(input: GetSequenceDurationInput): number {
  return getSequenceBounds(input)?.duration ?? 0;
}

export function getParentSequenceStartLayer(
  manifest: SequenceManifest,
  layerId: LayerId,
): ILayerManifest | undefined {
  const layer = getLayerById(manifest, layerId);
  if (!layer || isSequenceMarker(layer)) return undefined;

  const index = getLayerIndex(manifest, layerId);
  if (index === -1) return undefined;

  const sequenceStartIndex = findParentSequenceStartIndex(manifest, index);
  if (sequenceStartIndex === undefined) return undefined;

  const sequenceStartId = manifest.layerOrder[sequenceStartIndex];
  return sequenceStartId ? manifest.layers[sequenceStartId] : undefined;
}

export function getParentSequenceRuleType(
  manifest: SequenceManifest,
  layerId: LayerId,
): ScopeRuleType {
  const sequenceStart = getParentSequenceStartLayer(manifest, layerId);
  const ruleType = sequenceStart?.control?.params?.ruleType;
  return ruleType === 'mutex' || ruleType === 'magnetic' ? ruleType : 'freeform';
}

export function getInsertionParentSequenceStartLayer(
  manifest: SequenceManifest,
  insertAtIndex?: number,
): ILayerManifest | undefined {
  const safeIndex = Math.min(
    Math.max(insertAtIndex ?? manifest.layerOrder.length, 0),
    manifest.layerOrder.length,
  );

  const openSequences: ILayerManifest[] = [];
  for (let i = 0; i < safeIndex; i++) {
    const layerId = manifest.layerOrder[i];
    const layer = layerId ? manifest.layers[layerId] : undefined;
    if (!layer) continue;

    if (isSequenceStart(layer)) {
      openSequences.push(layer);
      continue;
    }

    if (isSequenceEnd(layer) && openSequences.length > 0) {
      openSequences.pop();
    }
  }

  return openSequences.at(-1);
}

export function getInsertionParentSequenceRuleType(
  manifest: SequenceManifest,
  insertAtIndex?: number,
): ScopeRuleType {
  const sequenceStart = getInsertionParentSequenceStartLayer(manifest, insertAtIndex);
  const ruleType = sequenceStart?.control?.params?.ruleType;
  return ruleType === 'mutex' || ruleType === 'magnetic' ? ruleType : 'freeform';
}

export function getDefaultLayerInsertionIndex(manifest: SequenceManifest): number {
  const rootStartId = manifest.layerOrder.find((id) => {
    const layer = manifest.layers[id];
    return (
      layer?.control?.params?.isProjectAnchor === true &&
      layer.kind === 'control' &&
      layer.control.role === 'scopeStart'
    );
  });

  if (!rootStartId) {
    return manifest.layerOrder.length;
  }

  const rootStartIndex = manifest.layerOrder.indexOf(rootStartId);
  const rootEndIndex =
    rootStartIndex === -1 ? undefined : findSequenceEndIndex(manifest, rootStartIndex);

  return rootEndIndex ?? manifest.layerOrder.length;
}

export function getSequenceEndIndexByStartId(
  manifest: SequenceManifest,
  sequenceStartId: LayerId,
): number | undefined {
  const sequenceStartIndex = findSequenceStartIndex(manifest, sequenceStartId);
  if (sequenceStartIndex === undefined) return undefined;
  return findSequenceEndIndex(manifest, sequenceStartIndex);
}
