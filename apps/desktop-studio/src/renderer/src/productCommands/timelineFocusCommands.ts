import {
  type EngineIntent,
  type ILayerManifest,
  type engineStore,
  getParentSequenceStartLayer,
} from '@rendium/engine';
import { hasTimelineSeekHandler, seekTimeline } from '../services/timelinePlaybackController';

type EngineManifest = ReturnType<typeof engineStore.getManifest>;

export interface FirstChangedTimelineCommandOptions {
  intents: EngineIntent[];
  manifest: EngineManifest;
}

export function seekToFirstChangedTimelineTime(
  options: FirstChangedTimelineCommandOptions,
): boolean {
  const timeSeconds = resolveFirstChangedTimelineTime(options);
  if (timeSeconds === null || !hasTimelineSeekHandler()) {
    return false;
  }

  return seekTimeline(timeSeconds);
}

export function resolveFirstChangedTimelineTime({
  intents,
  manifest,
}: FirstChangedTimelineCommandOptions): number | null {
  const changedTimes = intents
    .map((intent) => resolveIntentChangedTime(intent, manifest))
    .filter((time): time is number => time !== null);

  if (changedTimes.length === 0) {
    return null;
  }

  return Math.min(...changedTimes);
}

function resolveIntentChangedTime(intent: EngineIntent, manifest: EngineManifest): number | null {
  switch (intent.type) {
    case 'ADD_LAYER':
      return resolveLayerStartTime(manifest, intent.manifest, intent.targetScopeId);

    case 'REMOVE_LAYER':
    case 'CHANGE_OPACITY':
    case 'CHANGE_DURATION':
    case 'TOGGLE_VISIBILITY':
    case 'UPDATE_TRANSFORM':
      return resolveExistingLayerStartTime(manifest, intent.layerId);

    case 'CHANGE_START_TIME':
      return resolveStartTimeChange(manifest, intent.layerId, intent.startTime);

    case 'UPDATE_LAYER_PROPS':
      return resolveLayerPropsChangedTime(manifest, intent.layerId, intent.patch);

    case 'REORDER_LAYER':
    case 'RENAME_PROJECT':
    case 'UPDATE_CANVAS_SIZE':
    case 'UPDATE_CANVAS_BACKGROUND_COLOR':
    case 'UPDATE_WATERMARK':
    case 'UPDATE_EXPORT_RANGE':
    case 'UPDATE_WORK_AREA':
    case 'UPDATE_INJECTION_SEGMENTS':
    case 'HOVER_LAYER':
      return null;
  }
}

function resolveLayerPropsChangedTime(
  manifest: EngineManifest,
  layerId: string,
  patch: Partial<ILayerManifest>,
): number | null {
  const existingStartTime = resolveExistingLayerStartTime(manifest, layerId);
  if (typeof patch.startTime !== 'number' || !Number.isFinite(patch.startTime)) {
    return existingStartTime;
  }

  const parentScopeStartTime = resolveParentScopeStartTime(manifest, layerId);
  const nextStartTime = parentScopeStartTime + Math.max(0, patch.startTime);
  return existingStartTime === null ? nextStartTime : Math.min(existingStartTime, nextStartTime);
}

function resolveStartTimeChange(
  manifest: EngineManifest,
  layerId: string,
  nextLocalStartTime: number,
): number | null {
  const existingStartTime = resolveExistingLayerStartTime(manifest, layerId);
  const parentScopeStartTime = resolveParentScopeStartTime(manifest, layerId);
  const nextStartTime = parentScopeStartTime + Math.max(0, nextLocalStartTime);
  return existingStartTime === null ? nextStartTime : Math.min(existingStartTime, nextStartTime);
}

function resolveExistingLayerStartTime(manifest: EngineManifest, layerId: string): number | null {
  const layer = manifest.layers[layerId];
  if (!layer) {
    return null;
  }

  return resolveLayerStartTime(manifest, layer);
}

function resolveLayerStartTime(
  manifest: EngineManifest,
  layer: Pick<ILayerManifest, 'id' | 'startTime'>,
  targetScopeId?: string,
): number {
  const localStartTime = typeof layer.startTime === 'number' ? Math.max(0, layer.startTime) : 0;
  const scopeStartTime =
    targetScopeId !== undefined
      ? resolveScopeStartTime(manifest, targetScopeId)
      : resolveParentScopeStartTime(manifest, layer.id);

  return scopeStartTime + localStartTime;
}

function resolveParentScopeStartTime(manifest: EngineManifest, layerId: string): number {
  const parentScope = getParentSequenceStartLayer(manifest, layerId);
  return parentScope ? resolveScopeStartTime(manifest, parentScope.id) : 0;
}

function resolveScopeStartTime(manifest: EngineManifest, scopeId: string): number {
  const scope = manifest.layers[scopeId];
  return typeof scope?.startTime === 'number' ? Math.max(0, scope.startTime) : 0;
}
