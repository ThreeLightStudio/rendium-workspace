import {
  type EngineIntent,
  type IAddLayerIntent,
  type ILayerManifest,
  INTENT_TYPES,
  type JsonValue,
  type SourceProviderKind,
  TEXT_CONFIG,
  engineStore,
} from '@rendium/engine';
import { toast } from '../components/ToastSystem';
import { translate } from '../i18n/locale';
import { resolveImageAssetTimelineEndCommand } from '../productCommands/imageAssetCommands';
import {
  resolveAddCaptionTextCommand,
  resolveAddTitleTextCommand,
  resolveUpdateSelectedTextStyleCommand,
} from '../productCommands/textCommands';
import { seekToFirstChangedTimelineTime } from '../productCommands/timelineFocusCommands';

import type {
  AiAddCaptionTextAction,
  AiAddImageAssetToTimelineAction,
  AiAddTitleTextAction,
  AiAssistantAction,
  AiAssistantActionPlan,
  AiSeekTimelineAction,
  AiUpdateSelectedTextStyleAction,
} from '../services/AiService';
import { hasTimelineSeekHandler, seekTimeline } from '../services/timelinePlaybackController';
import { useStudioStore } from '../stores/studioStore';
import { useProjectAssetsStore } from '../stores/useProjectAssetsStore';
import { isScopeStartManifest } from '../utils/canonicalLayer';
import { TEXT_LAYER_CENTER_ANCHOR } from '../utils/textLayer';
import { formatTimecode } from '../utils/timecode';
import {
  normalizeLayerManifestTransform,
  normalizeTransformIntentFields,
} from './aiTransformUtils';

export interface AiActionExecutionResult {
  success: boolean;
  createdLayerIds: string[];
  executedIntents: EngineIntent[];
  error?: string;
}

export async function executeAiActionPlan(
  plan: AiAssistantActionPlan,
): Promise<AiActionExecutionResult> {
  if (plan.actions.length === 0) {
    return {
      success: false,
      createdLayerIds: [],
      executedIntents: [],
      error: translate('ai.noExecutableActions'),
    };
  }

  const createdLayerIds: string[] = [];
  const intents: EngineIntent[] = [];
  const seekTimelineActions: AiSeekTimelineAction[] = [];
  const snapshot = engineStore.getSnapshot();
  const manifest = engineStore.getManifest();
  const mappingErrors: string[] = [];

  for (const action of plan.actions) {
    if (action.type === 'SEEK_TIMELINE') {
      seekTimelineActions.push(action);
      continue;
    }

    if (action.type === 'RUN_WORKFLOW') {
      mappingErrors.push(`${translate('ai.unsupportedAction')}: ${action.type}`);
      continue;
    }

    if (action.type === 'ADD_IMAGE_ASSET_TO_TIMELINE') {
      const mapped = mapImageAssetTimelineAction(action, snapshot, manifest);
      if (!mapped) {
        mappingErrors.push(`${translate('ai.unsupportedAction')}: ${action.type}`);
        continue;
      }
      if (!mapped.success) {
        mappingErrors.push(translate(mapped.errorKey));
        continue;
      }
      createdLayerIds.push(...mapped.createdLayerIds);
      intents.push(...mapped.intents);
      continue;
    }

    if (action.type === 'ADD_TITLE_TEXT') {
      const mapped = mapAddTitleTextAction(action, snapshot, manifest);
      appendProductCommandResolution(action.type, mapped, createdLayerIds, intents, mappingErrors);
      continue;
    }

    if (action.type === 'ADD_CAPTION_TEXT') {
      const mapped = mapAddCaptionTextAction(action, snapshot, manifest);
      appendProductCommandResolution(action.type, mapped, createdLayerIds, intents, mappingErrors);
      continue;
    }

    if (action.type === 'UPDATE_SELECTED_TEXT_STYLE') {
      const mapped = mapUpdateSelectedTextStyleAction(action, manifest);
      appendProductCommandResolution(action.type, mapped, createdLayerIds, intents, mappingErrors);
      continue;
    }

    const mapped = mapActionToIntent(action, snapshot, manifest);
    if (!mapped) {
      mappingErrors.push(`${translate('ai.unsupportedAction')}: ${action.type}`);
      continue;
    }

    if ('createdLayerId' in mapped) {
      createdLayerIds.push(mapped.createdLayerId);
      intents.push(mapped.intent);
      continue;
    }

    intents.push(mapped);
  }

  if (mappingErrors.length > 0) {
    return {
      success: false,
      createdLayerIds: [],
      executedIntents: [],
      error: mappingErrors[0] ?? translate('ai.executionFailed'),
    };
  }

  if (seekTimelineActions.length > 0 && !hasTimelineSeekHandler()) {
    return {
      success: false,
      createdLayerIds: [],
      executedIntents: [],
      error: translate('ai.timelineJumpUnavailable'),
    };
  }

  const isSeekOnlyExecution = seekTimelineActions.length > 0 && intents.length === 0;

  try {
    if (intents.length > 0) {
      engineStore.executeAtomicIntentBatch(intents);
    }

    if (createdLayerIds.length > 0) {
      useStudioStore.getState().selectLayer(createdLayerIds[createdLayerIds.length - 1] ?? null);
    } else if (intents.length > 0) {
      syncSelectionWithScene();
    }

    const lastSeekAction = seekTimelineActions[seekTimelineActions.length - 1] ?? null;
    if (lastSeekAction) {
      const didSeek = seekTimeline(lastSeekAction.timeSeconds);
      if (!didSeek) {
        throw new Error(translate('ai.timelineJumpUnavailable'));
      }
    } else if (intents.length > 0) {
      seekToFirstChangedTimelineTime({ intents, manifest });
    }

    const successToast = buildSuccessToast({
      createdLayerIds,
      intents,
      seekTimelineActions,
    });
    toast.success(successToast.title, {
      message: successToast.message,
    });

    return {
      success: true,
      createdLayerIds,
      executedIntents: intents,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : translate('ai.executionFailed');
    toast.error(
      isSeekOnlyExecution ? translate('ai.timelineJumpFailure') : translate('ai.applyFailure'),
      {
        message,
      },
    );
    return {
      success: false,
      createdLayerIds,
      executedIntents: intents,
      error: message,
    };
  }
}

function buildSuccessToast(params: {
  createdLayerIds: string[];
  intents: EngineIntent[];
  seekTimelineActions: AiSeekTimelineAction[];
}): { title: string; message: string } {
  const { createdLayerIds, intents, seekTimelineActions } = params;
  const lastSeekAction = seekTimelineActions[seekTimelineActions.length - 1] ?? null;

  if (lastSeekAction && intents.length === 0) {
    return {
      title: translate('ai.timelineJumpSuccess'),
      message: `${formatTimecode(lastSeekAction.timeSeconds)}로 이동했습니다.`,
    };
  }

  if (lastSeekAction) {
    return {
      title: translate('ai.applySuccess'),
      message:
        createdLayerIds.length > 0
          ? `${createdLayerIds.length}개 레이어를 생성하고 타임라인을 이동했습니다.`
          : `${intents.length}개 액션을 실행하고 타임라인을 이동했습니다.`,
    };
  }

  if (createdLayerIds.length > 0) {
    return {
      title: translate('ai.applySuccess'),
      message: `${createdLayerIds.length}개 레이어를 생성했습니다.`,
    };
  }

  return {
    title: translate('ai.applySuccess'),
    message: `${intents.length}개 액션을 실행했습니다.`,
  };
}

function syncSelectionWithScene(): void {
  const studioState = useStudioStore.getState();
  const existingSelectedLayerIds = studioState.selectedLayerIds.filter((layerId) =>
    Boolean(engineStore.getLayerById(layerId)),
  );

  if (existingSelectedLayerIds.length === studioState.selectedLayerIds.length) {
    return;
  }

  if (existingSelectedLayerIds.length === 0) {
    studioState.clearSelection();
    return;
  }

  studioState.selectLayers(existingSelectedLayerIds);
}

function mapActionToIntent(
  action: AiAssistantAction,
  snapshot: ReturnType<typeof engineStore.getSnapshot>,
  manifest: ReturnType<typeof engineStore.getManifest>,
): EngineIntent | { intent: EngineIntent; createdLayerId: string } | null {
  switch (action.type) {
    case INTENT_TYPES.ADD_LAYER:
      return mapAddLayerAction(action, snapshot, manifest);

    case INTENT_TYPES.UPDATE_LAYER_PROPS:
    case INTENT_TYPES.TOGGLE_VISIBILITY:
    case INTENT_TYPES.REORDER_LAYER:
    case INTENT_TYPES.REMOVE_LAYER:
      return action;

    case INTENT_TYPES.UPDATE_TRANSFORM:
      return mapUpdateTransformAction(
        action as Extract<AiAssistantAction, { type: typeof INTENT_TYPES.UPDATE_TRANSFORM }>,
      );

    default:
      return null;
  }
}

function mapAddLayerAction(
  action: Extract<AiAssistantAction, { type: typeof INTENT_TYPES.ADD_LAYER }>,
  snapshot: ReturnType<typeof engineStore.getSnapshot>,
  manifest: ReturnType<typeof engineStore.getManifest>,
): { intent: EngineIntent; createdLayerId: string } | null {
  const normalizedIntent = normalizeAddLayerIntent(action, snapshot, manifest);
  if (!normalizedIntent) {
    return null;
  }

  return {
    createdLayerId: normalizedIntent.manifest.id,
    intent: normalizedIntent,
  };
}

function mapAddTitleTextAction(
  action: AiAddTitleTextAction,
  snapshot: ReturnType<typeof engineStore.getSnapshot>,
  manifest: ReturnType<typeof engineStore.getManifest>,
): ReturnType<typeof resolveAddTitleTextCommand> {
  return resolveAddTitleTextCommand({
    text: action.text,
    placement: action.placement,
    durationSeconds: action.durationSeconds,
    startTime: action.startTime,
    snapshot,
    manifest,
  });
}

function mapAddCaptionTextAction(
  action: AiAddCaptionTextAction,
  snapshot: ReturnType<typeof engineStore.getSnapshot>,
  manifest: ReturnType<typeof engineStore.getManifest>,
): ReturnType<typeof resolveAddCaptionTextCommand> {
  return resolveAddCaptionTextCommand({
    text: action.text,
    placement: action.placement,
    durationSeconds: action.durationSeconds,
    startTime: action.startTime,
    snapshot,
    manifest,
  });
}

function mapUpdateSelectedTextStyleAction(
  action: AiUpdateSelectedTextStyleAction,
  manifest: ReturnType<typeof engineStore.getManifest>,
): ReturnType<typeof resolveUpdateSelectedTextStyleCommand> {
  return resolveUpdateSelectedTextStyleCommand({
    patch: action.patch,
    manifest,
  });
}

function mapImageAssetTimelineAction(
  action: AiAddImageAssetToTimelineAction,
  snapshot: ReturnType<typeof engineStore.getSnapshot>,
  manifest: ReturnType<typeof engineStore.getManifest>,
): ReturnType<typeof resolveImageAssetTimelineEndCommand> | null {
  if (action.placement !== 'start' && action.placement !== 'end') {
    return null;
  }

  return resolveImageAssetTimelineEndCommand({
    assetId: action.assetId,
    assets: useProjectAssetsStore.getState().assets,
    scopeRole: action.scopeRole,
    placement: action.placement,
    durationSeconds: action.durationSeconds,
    fit: action.fit,
    snapshot,
    manifest,
  });
}

function appendProductCommandResolution(
  actionType: string,
  resolution:
    | ReturnType<typeof resolveImageAssetTimelineEndCommand>
    | ReturnType<typeof resolveAddTitleTextCommand>
    | ReturnType<typeof resolveAddCaptionTextCommand>
    | ReturnType<typeof resolveUpdateSelectedTextStyleCommand>
    | null,
  createdLayerIds: string[],
  intents: EngineIntent[],
  mappingErrors: string[],
): void {
  if (!resolution) {
    mappingErrors.push(`${translate('ai.unsupportedAction')}: ${actionType}`);
    return;
  }

  if (!resolution.success) {
    mappingErrors.push(resolveProductCommandErrorMessage(resolution.errorKey, resolution.error));
    return;
  }

  createdLayerIds.push(...resolution.createdLayerIds);
  intents.push(...resolution.intents);
}

function resolveProductCommandErrorMessage(errorKey: string, fallback: string): string {
  if (errorKey.startsWith('text.')) {
    return fallback;
  }

  if (
    errorKey === 'assets.applyFailed' ||
    errorKey === 'assets.missingSource' ||
    errorKey === 'assets.noScopeFound'
  ) {
    return translate(errorKey);
  }

  return fallback;
}

function normalizeAddLayerIntent(
  action: Extract<AiAssistantAction, { type: typeof INTENT_TYPES.ADD_LAYER }>,
  snapshot: ReturnType<typeof engineStore.getSnapshot>,
  manifest: ReturnType<typeof engineStore.getManifest>,
): IAddLayerIntent | null {
  if (!isValidAddManifest(action.manifest)) {
    return null;
  }

  const provider = action.manifest.source?.provider;
  const layerPrefix = resolveLayerIdPrefix(action.manifest);
  const layerId =
    typeof action.manifest.id === 'string' && action.manifest.id.trim().length > 0
      ? action.manifest.id.trim()
      : createLayerId(layerPrefix);
  const duration =
    typeof action.manifest.duration === 'number'
      ? action.manifest.duration
      : Math.max(snapshot.projectDuration, 5);
  const startTime = typeof action.manifest.startTime === 'number' ? action.manifest.startTime : 0;
  const isTextLayer = action.manifest.kind === 'visual' && provider === 'text';
  const inferredTargetScopeId = resolveTargetScopeIdForProvider(
    action.manifest.kind,
    provider,
    manifest,
  );
  const explicitTargetScopeId = action.targetScopeId;
  const targetScopeId = explicitTargetScopeId ?? inferredTargetScopeId;
  if (!targetScopeId) return null;
  const source = normalizeSource(action.manifest, layerId, isTextLayer);

  const normalizedManifest: ILayerManifest = {
    id: layerId,
    kind: action.manifest.kind,
    name: resolveLayerName(action.manifest, isTextLayer),
    startTime,
    duration,
    transform: normalizeTransform(action.manifest, snapshot, manifest, isTextLayer),
    appearance: normalizeAppearance(action.manifest.appearance, isTextLayer),
    ...(source ? { source } : {}),
    ...(action.manifest.control ? { control: action.manifest.control } : {}),
  };

  return {
    type: INTENT_TYPES.ADD_LAYER,
    manifest: normalizedManifest,
    targetScopeId,
  };
}

function resolveLayerName(
  manifest: Partial<ILayerManifest>,
  isTextLayer: boolean,
): string | undefined {
  if (typeof manifest.name === 'string' && manifest.name.trim().length > 0) {
    return manifest.name.trim();
  }

  if (!isTextLayer) {
    return undefined;
  }

  const text =
    typeof manifest.source?.params?.text === 'string' ? manifest.source.params.text.trim() : '';
  return text.slice(0, 24) || 'Text Layer';
}

function normalizeTransform(
  transformLike: unknown,
  snapshot: ReturnType<typeof engineStore.getSnapshot>,
  manifest: ReturnType<typeof engineStore.getManifest>,
  isTextLayer: boolean,
): ILayerManifest['transform'] | undefined {
  const normalizedTransform = normalizeLayerManifestTransform(transformLike);
  if (normalizedTransform) {
    return normalizedTransform;
  }

  if (!isTextLayer) {
    return undefined;
  }

  const canvasWidth = snapshot.width || manifest.projectSettings.canvas.size.width;
  const canvasHeight = snapshot.height || manifest.projectSettings.canvas.size.height;

  return {
    position: { x: canvasWidth / 2, y: canvasHeight / 2 },
    scale: { x: 1, y: 1 },
    rotation: 0,
  };
}

function mapUpdateTransformAction(
  action: Extract<AiAssistantAction, { type: typeof INTENT_TYPES.UPDATE_TRANSFORM }>,
): EngineIntent | null {
  const normalizedFields = normalizeTransformIntentFields(action);
  if (!normalizedFields) {
    return null;
  }

  return {
    type: INTENT_TYPES.UPDATE_TRANSFORM,
    layerId: action.layerId,
    ...normalizedFields,
  };
}

function normalizeAppearance(
  appearance: ILayerManifest['appearance'] | undefined,
  isTextLayer: boolean,
): ILayerManifest['appearance'] | undefined {
  if (appearance) {
    return appearance;
  }

  if (!isTextLayer) {
    return undefined;
  }

  return {
    visible: true,
    opacity: 1,
  };
}

function normalizeSource(
  manifest: Partial<ILayerManifest>,
  layerId: string,
  isTextLayer: boolean,
): ILayerManifest['source'] | undefined {
  if (!manifest.source && manifest.kind === 'control') return undefined;
  const provider = manifest.source?.provider ?? (manifest.kind === 'audio' ? 'audio-file' : 'text');
  const track = manifest.source?.track ?? (manifest.kind === 'audio' ? 'audio' : 'visual');
  const rawParams = isPlainObject(manifest.source?.params) ? manifest.source.params : {};
  const params = isTextLayer ? normalizeTextParams(rawParams) : normalizeJsonParams(rawParams);
  return {
    sourceId: manifest.source?.sourceId ?? `${provider}:${layerId}`,
    provider,
    track,
    ...(manifest.source?.clipOffset !== undefined
      ? { clipOffset: manifest.source.clipOffset }
      : {}),
    ...(Object.keys(params).length > 0 ? { params } : {}),
  };
}

function normalizeJsonParams(params: Record<string, unknown>): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (isJsonValue(value)) result[key] = value;
  }
  return result;
}

function normalizeTextParams(params: Record<string, unknown>): Record<string, JsonValue> {
  const textParams = params;
  return {
    text: typeof textParams.text === 'string' ? textParams.text : '',
    fontFamily:
      typeof textParams.fontFamily === 'string'
        ? textParams.fontFamily
        : TEXT_CONFIG.DEFAULT_FONT_FAMILY,
    fontSize:
      typeof textParams.fontSize === 'number' && Number.isFinite(textParams.fontSize)
        ? Math.max(8, Math.round(textParams.fontSize))
        : TEXT_CONFIG.DEFAULT_FONT_SIZE,
    fontWeight:
      typeof textParams.fontWeight === 'string' || typeof textParams.fontWeight === 'number'
        ? textParams.fontWeight
        : 'bold',
    color: normalizeColor(textParams.color),
    align:
      textParams.align === 'left' || textParams.align === 'center' || textParams.align === 'right'
        ? textParams.align
        : TEXT_CONFIG.DEFAULT_ALIGN,
    outlineColor: normalizeOutlineColor(textParams.outlineColor),
    outlineWidth:
      typeof textParams.outlineWidth === 'number' && Number.isFinite(textParams.outlineWidth)
        ? textParams.outlineWidth
        : TEXT_CONFIG.DEFAULT_OUTLINE_WIDTH,
    anchor: isPoint(textParams.anchor) ? textParams.anchor : { ...TEXT_LAYER_CENTER_ANCHOR },
  };
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

function normalizeColor(value: unknown): [number, number, number, number] {
  if (!value) {
    return [...TEXT_CONFIG.DEFAULT_COLOR];
  }

  if (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((component) => typeof component === 'number')
  ) {
    return value as [number, number, number, number];
  }

  const normalized = typeof value === 'string' ? value.toLowerCase().trim() : '';
  switch (normalized) {
    case 'red':
      return [1, 0.12, 0.12, 1];
    case 'blue':
      return [0.2, 0.6, 1, 1];
    case 'yellow':
      return [1, 0.9, 0.1, 1];
    case 'green':
      return [0.2, 0.85, 0.4, 1];
    case 'white':
      return [1, 1, 1, 1];
    default:
      return parseHexColor(normalized) ?? [...TEXT_CONFIG.DEFAULT_COLOR];
  }
}

function normalizeOutlineColor(value: unknown): [number, number, number, number] {
  if (!value) {
    return [...TEXT_CONFIG.DEFAULT_OUTLINE_COLOR];
  }

  if (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((component) => typeof component === 'number')
  ) {
    return value as [number, number, number, number];
  }

  const normalized = typeof value === 'string' ? value.toLowerCase().trim() : '';
  if (normalized === 'black') {
    return [0, 0, 0, 1];
  }

  return parseHexColor(normalized) ?? [...TEXT_CONFIG.DEFAULT_OUTLINE_COLOR];
}

function parseHexColor(value: string): [number, number, number, number] | null {
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (hex.length !== 6) {
    return null;
  }

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((component) => Number.isNaN(component))) {
    return null;
  }

  return [r / 255, g / 255, b / 255, 1];
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return (
    isPlainObject(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidAddManifest(value: Partial<ILayerManifest>): value is Partial<ILayerManifest> & {
  kind: ILayerManifest['kind'];
} {
  return value.kind === 'visual' || value.kind === 'audio' || value.kind === 'control';
}

function createLayerId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveLayerIdPrefix(manifest: Partial<ILayerManifest>): string {
  if (manifest.kind === 'audio') return 'audio';
  if (manifest.kind === 'control') return 'control';
  return manifest.source?.provider ?? 'visual';
}

function resolveTargetScopeIdForProvider(
  kind: ILayerManifest['kind'],
  provider: SourceProviderKind | undefined,
  manifest: ReturnType<typeof engineStore.getManifest>,
): string | undefined {
  const preferredRole = resolvePreferredScopeRole(kind, provider);
  if (!preferredRole) {
    return undefined;
  }

  return manifest.layerOrder.find((layerId) => {
    const layer = manifest.layers[layerId];
    return isScopeStartManifest(layer) && layer.control?.params?.scopeRole === preferredRole;
  });
}

function resolvePreferredScopeRole(
  kind: ILayerManifest['kind'],
  provider: SourceProviderKind | undefined,
) {
  if (kind === 'audio') return 'main';
  if (provider === 'text') return 'text';
  if (provider === 'raster' || provider === 'generated-visual') return 'overlay';
  if (provider === 'video') return 'main';
  return undefined;
}
