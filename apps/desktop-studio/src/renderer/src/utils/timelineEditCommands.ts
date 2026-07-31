import type { EngineIntent, ILayerManifest, IProjectManifest } from '@rendium/engine';
import { INTENT_TYPES } from '@rendium/engine';
import {
  isProjectAnchorManifest,
  isScopeEndManifest,
  isScopeStartManifest,
} from './canonicalLayer';
import { getLinkedVideoAudioLayerId, resolveLinkedVideoAudioPair } from './linkedVideoAudio';
import type { IPackedLayer } from './packStrands';

const TIMELINE_EPSILON_SECONDS = 1e-6;

export const TIMELINE_FRAME_RATE = 30;
export const TIMELINE_FRAME_STEP_SECONDS = 1 / TIMELINE_FRAME_RATE;

export type TimelineEditAction =
  | 'split'
  | 'trim-start'
  | 'trim-end'
  | 'select-above'
  | 'select-below'
  | 'step-back-frame'
  | 'step-forward-frame'
  | 'step-back-second'
  | 'step-forward-second'
  | 'jump-start'
  | 'jump-end';

export interface TimelineManifestLookup {
  layers: IProjectManifest['layers'];
  layerOrder: IProjectManifest['layerOrder'];
}

export interface TimelineEditLayer {
  id: string;
  startTime: number;
  duration: number;
  trackIndex?: number;
  isProjectAnchor?: boolean;
  isInfinite?: boolean;
  parentSequenceId?: string;
}

function isFiniteTimelineNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isTimelineTimeInsideLayer(layer: TimelineEditLayer, timeSeconds: number): boolean {
  const startTime = layer.startTime;
  const endTime = startTime + layer.duration;

  return (
    timeSeconds > startTime + TIMELINE_EPSILON_SECONDS &&
    timeSeconds < endTime - TIMELINE_EPSILON_SECONDS
  );
}

export function isTimelineTimeOnLayer(layer: TimelineEditLayer, timeSeconds: number): boolean {
  const startTime = layer.startTime;
  const endTime = startTime + layer.duration;

  return (
    timeSeconds >= startTime - TIMELINE_EPSILON_SECONDS &&
    timeSeconds <= endTime + TIMELINE_EPSILON_SECONDS
  );
}

export function isTimelineLayerEditable(
  layer: ILayerManifest | undefined,
): layer is ILayerManifest {
  return (
    layer !== undefined &&
    !isProjectAnchorManifest(layer) &&
    !isScopeStartManifest(layer) &&
    !isScopeEndManifest(layer) &&
    isFiniteTimelineNumber(layer.startTime) &&
    isFiniteTimelineNumber(layer.duration) &&
    layer.duration > TIMELINE_EPSILON_SECONDS
  );
}

export function getActiveTimelineEditLayer(
  selectedLayerId: string | null,
  layers: TimelineEditLayer[],
  currentTime: number,
): TimelineEditLayer | null {
  const layer = selectedLayerId
    ? (layers.find((candidate) => candidate.id === selectedLayerId) ?? null)
    : ([...layers]
        .sort((a, b) => (a.trackIndex ?? 0) - (b.trackIndex ?? 0))
        .find((candidate) => isTimelineTimeInsideLayer(candidate, currentTime)) ?? null);
  if (
    !layer ||
    layer.isProjectAnchor ||
    layer.isInfinite ||
    !isTimelineTimeInsideLayer(layer, currentTime)
  ) {
    return null;
  }

  return layer;
}

export function getTimelineEditTargetLayer(
  selectedLayerId: string | null,
  layers: TimelineEditLayer[],
  currentTime: number,
): TimelineEditLayer | null {
  if (selectedLayerId) {
    const selectedLayer = layers.find((candidate) => candidate.id === selectedLayerId) ?? null;
    if (
      selectedLayer &&
      !selectedLayer.isProjectAnchor &&
      !selectedLayer.isInfinite &&
      isTimelineTimeOnLayer(selectedLayer, currentTime)
    ) {
      return selectedLayer;
    }

    return null;
  }

  return (
    [...layers]
      .sort((a, b) => (a.trackIndex ?? 0) - (b.trackIndex ?? 0))
      .find(
        (layer) =>
          !layer.isProjectAnchor && !layer.isInfinite && isTimelineTimeOnLayer(layer, currentTime),
      ) ?? null
  );
}

function createSplitLayerId(layerId: string): string {
  return `${layerId}-split-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneLayerManifest(layer: ILayerManifest): ILayerManifest {
  return structuredClone(layer) as ILayerManifest;
}

function addClipOffset(layer: ILayerManifest, offsetSeconds: number): ILayerManifest {
  const nextLayer = layer as ILayerManifest & {
    source?: ILayerManifest['source'] & { clipOffset?: number };
    clipOffset?: number;
  };

  if (nextLayer.source) {
    const currentClipOffset = isFiniteTimelineNumber(nextLayer.source.clipOffset)
      ? nextLayer.source.clipOffset
      : 0;
    nextLayer.source = {
      ...nextLayer.source,
      clipOffset: currentClipOffset + offsetSeconds,
    };
  }

  if (isFiniteTimelineNumber(nextLayer.clipOffset)) {
    nextLayer.clipOffset += offsetSeconds;
  }

  return nextLayer;
}

function buildClipOffsetIntent(layer: ILayerManifest, offsetSeconds: number): EngineIntent | null {
  const nextLayer = addClipOffset(cloneLayerManifest(layer), offsetSeconds);
  if (!nextLayer.source) return null;

  return {
    type: INTENT_TYPES.UPDATE_LAYER_PROPS,
    layerId: layer.id,
    patch: {
      source: nextLayer.source,
    },
  };
}

function toTimelineEditLayer(layer: ILayerManifest): TimelineEditLayer {
  return {
    id: layer.id,
    startTime: layer.startTime,
    duration: layer.duration,
    isProjectAnchor: isProjectAnchorManifest(layer),
    isInfinite: false,
  };
}

function getLinkedVideoAudioLayer(
  manifest: TimelineManifestLookup,
  sourceLayer: ILayerManifest,
): TimelineEditLayer | null {
  const linkedLayerId = getLinkedVideoAudioLayerId(manifest, sourceLayer.id);
  const linkedLayer = linkedLayerId ? manifest.layers[linkedLayerId] : undefined;
  if (!isTimelineLayerEditable(linkedLayer)) {
    return null;
  }

  return toTimelineEditLayer(linkedLayer);
}

function getParentScopeId(manifest: TimelineManifestLookup, layerId: string): string {
  const layerIndex = manifest.layerOrder.indexOf(layerId);
  const stack: string[] = [];

  for (let index = 0; index < layerIndex; index += 1) {
    const layer = manifest.layers[manifest.layerOrder[index] ?? ''];
    if (!layer) continue;

    if (isScopeStartManifest(layer)) stack.push(layer.id);
    if (isScopeEndManifest(layer)) stack.pop();
  }

  return stack[stack.length - 1] ?? '';
}

function getTargetScopeId(
  manifest: TimelineManifestLookup,
  sourceLayer: ILayerManifest,
  layer: TimelineEditLayer,
): string {
  return layer.parentSequenceId ?? getParentScopeId(manifest, sourceLayer.id);
}

function buildSingleTrimTimelineLayerStartIntents(
  sourceLayer: ILayerManifest | undefined,
  layer: TimelineEditLayer,
  currentTime: number,
): EngineIntent[] {
  const endTime = layer.startTime + layer.duration;
  const trimOffset = Math.max(0, currentTime - layer.startTime);
  const nextDuration = Math.max(0, endTime - currentTime);
  const clipOffsetIntent =
    sourceLayer && trimOffset > TIMELINE_EPSILON_SECONDS
      ? buildClipOffsetIntent(sourceLayer, trimOffset)
      : null;

  const intents: EngineIntent[] = [
    { type: INTENT_TYPES.CHANGE_START_TIME, layerId: layer.id, startTime: currentTime },
    { type: INTENT_TYPES.CHANGE_DURATION, layerId: layer.id, duration: nextDuration },
  ];

  if (clipOffsetIntent) intents.push(clipOffsetIntent);

  return intents;
}

export function buildTrimTimelineLayerStartIntents(
  manifest: TimelineManifestLookup,
  layer: TimelineEditLayer,
  currentTime: number,
): EngineIntent[] {
  const sourceLayer = manifest.layers[layer.id];
  const intents = buildSingleTrimTimelineLayerStartIntents(sourceLayer, layer, currentTime);
  const linkedAudioLayer = sourceLayer ? getLinkedVideoAudioLayer(manifest, sourceLayer) : null;
  const linkedAudioSourceLayer = linkedAudioLayer
    ? manifest.layers[linkedAudioLayer.id]
    : undefined;

  if (linkedAudioLayer && isTimelineTimeOnLayer(linkedAudioLayer, currentTime)) {
    intents.push(
      ...buildSingleTrimTimelineLayerStartIntents(
        linkedAudioSourceLayer,
        linkedAudioLayer,
        currentTime,
      ),
    );
  }

  return intents;
}

function buildSingleTrimTimelineLayerEndIntents(
  layer: TimelineEditLayer,
  currentTime: number,
): EngineIntent[] {
  return [
    {
      type: INTENT_TYPES.CHANGE_DURATION,
      layerId: layer.id,
      duration: Math.max(0, currentTime - layer.startTime),
    },
  ];
}

export function buildTrimTimelineLayerEndIntents(
  manifest: TimelineManifestLookup,
  layer: TimelineEditLayer,
  currentTime: number,
): EngineIntent[] {
  const sourceLayer = manifest.layers[layer.id];
  const intents = buildSingleTrimTimelineLayerEndIntents(layer, currentTime);
  const linkedAudioLayer = sourceLayer ? getLinkedVideoAudioLayer(manifest, sourceLayer) : null;

  if (linkedAudioLayer && isTimelineTimeOnLayer(linkedAudioLayer, currentTime)) {
    intents.push(...buildSingleTrimTimelineLayerEndIntents(linkedAudioLayer, currentTime));
  }

  return intents;
}

export interface SplitTimelineLayerResult {
  intents: EngineIntent[];
  createdLayerId: string;
}

type MutableLayerManifest = ILayerManifest & {
  id: string;
  name?: string;
  startTime: number;
  duration: number;
};

export function buildSplitTimelineLayerIntents(
  manifest: TimelineManifestLookup,
  layer: TimelineEditLayer,
  currentTime: number,
): SplitTimelineLayerResult | null {
  const sourceLayer = manifest.layers[layer.id];
  if (!isTimelineLayerEditable(sourceLayer) || !isTimelineTimeInsideLayer(layer, currentTime)) {
    return null;
  }

  const splitOffset = currentTime - layer.startTime;
  const trailingDuration = layer.duration - splitOffset;
  if (splitOffset <= TIMELINE_EPSILON_SECONDS || trailingDuration <= TIMELINE_EPSILON_SECONDS) {
    return null;
  }

  const linkedPair = resolveLinkedVideoAudioPair(manifest, sourceLayer.id);
  const createdVideoLayerId = createSplitLayerId(linkedPair?.videoLayerId ?? layer.id);
  const createdLayerId =
    linkedPair && sourceLayer.id === linkedPair.audioLayerId
      ? `${createdVideoLayerId}-audio`
      : createdVideoLayerId;
  const trailingLayer = addClipOffset(
    cloneLayerManifest(sourceLayer),
    splitOffset,
  ) as MutableLayerManifest;
  trailingLayer.id = createdLayerId;
  trailingLayer.name = sourceLayer.name ? `${sourceLayer.name} split` : `${sourceLayer.id} split`;
  trailingLayer.startTime = currentTime;
  trailingLayer.duration = trailingDuration;

  const targetScopeId = getTargetScopeId(manifest, sourceLayer, layer);
  if (!targetScopeId) return null;

  const intents: EngineIntent[] = [
    {
      type: INTENT_TYPES.CHANGE_DURATION,
      layerId: layer.id,
      duration: splitOffset,
    },
    {
      type: INTENT_TYPES.ADD_LAYER,
      manifest: trailingLayer,
      targetScopeId,
    },
  ];

  const linkedLayer = getLinkedVideoAudioLayer(manifest, sourceLayer);
  const linkedSourceLayer = linkedLayer ? manifest.layers[linkedLayer.id] : undefined;
  if (linkedLayer && linkedSourceLayer && isTimelineTimeInsideLayer(linkedLayer, currentTime)) {
    const linkedSplitOffset = currentTime - linkedLayer.startTime;
    const linkedTrailingDuration = linkedLayer.duration - linkedSplitOffset;
    const linkedTargetScopeId = getTargetScopeId(manifest, linkedSourceLayer, linkedLayer);

    if (
      linkedSplitOffset > TIMELINE_EPSILON_SECONDS &&
      linkedTrailingDuration > TIMELINE_EPSILON_SECONDS &&
      linkedTargetScopeId
    ) {
      const linkedTrailingLayer = addClipOffset(
        cloneLayerManifest(linkedSourceLayer),
        linkedSplitOffset,
      ) as MutableLayerManifest;
      linkedTrailingLayer.id =
        linkedPair && linkedSourceLayer.id === linkedPair.audioLayerId
          ? `${createdVideoLayerId}-audio`
          : createdVideoLayerId;
      linkedTrailingLayer.name = linkedSourceLayer.name
        ? `${linkedSourceLayer.name} split`
        : `${linkedSourceLayer.id} split`;
      linkedTrailingLayer.startTime = currentTime;
      linkedTrailingLayer.duration = linkedTrailingDuration;

      intents.push(
        {
          type: INTENT_TYPES.CHANGE_DURATION,
          layerId: linkedLayer.id,
          duration: linkedSplitOffset,
        },
        {
          type: INTENT_TYPES.ADD_LAYER,
          manifest: linkedTrailingLayer,
          targetScopeId: linkedTargetScopeId,
        },
      );
    }
  }

  return {
    createdLayerId,
    intents,
  };
}

export function findTimelineLayerAtTrackOffset(
  layers: IPackedLayer[],
  selectedLayerId: string | null,
  currentTime: number,
  direction: -1 | 1,
): IPackedLayer | null {
  if (!selectedLayerId) return null;

  const currentLayer = layers.find((layer) => layer.id === selectedLayerId);
  if (!currentLayer) return null;

  const activeLayers = layers
    .filter(
      (layer) =>
        layer.id !== selectedLayerId &&
        currentTime >= layer.startTime - TIMELINE_EPSILON_SECONDS &&
        currentTime < layer.startTime + layer.duration - TIMELINE_EPSILON_SECONDS,
    )
    .sort((a, b) => a.trackIndex - b.trackIndex);

  const candidates =
    direction < 0
      ? activeLayers.filter((layer) => layer.trackIndex < currentLayer.trackIndex).reverse()
      : activeLayers.filter((layer) => layer.trackIndex > currentLayer.trackIndex);

  return candidates[0] ?? null;
}

export function clampTimelineSeekTime(timeSeconds: number): number {
  return Math.max(0, timeSeconds);
}
