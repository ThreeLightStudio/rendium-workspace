import {
  type EngineIntent,
  type ILayerManifest,
  INTENT_TYPES,
  type JsonValue,
  TEXT_CONFIG,
  engineStore,
} from '@rendium/engine';
import { useStudioStore } from '../stores/studioStore';
import {
  getStudioLayerTypeFromManifest,
  isProjectAnchorManifest,
  isScopeStartManifest,
  mergeSourceParamsPatch,
} from '../utils/canonicalLayer';
import { buildCenteredTextLayerManifest } from '../utils/textLayer';
import { seekToFirstChangedTimelineTime } from './timelineFocusCommands';

export type TextCommandPlacement = 'center' | 'top' | 'bottom';
export type TextCommandErrorKey = 'text.applyFailed' | 'text.noScopeFound' | 'text.noSelection';

export interface AddTextProductCommandOptions {
  text: string;
  placement?: TextCommandPlacement;
  durationSeconds?: number;
  startTime?: number;
  manifest?: ReturnType<typeof engineStore.getManifest>;
  snapshot?: ReturnType<typeof engineStore.getSnapshot>;
}

export interface UpdateSelectedTextStyleCommandOptions {
  patch: Record<string, unknown>;
  selectedLayerId?: string | null;
  manifest?: ReturnType<typeof engineStore.getManifest>;
}

export type TextProductCommandResolution =
  | {
      success: true;
      createdLayerIds: string[];
      intents: EngineIntent[];
    }
  | {
      success: false;
      error: string;
      errorKey: TextCommandErrorKey;
    };

export type TextProductCommandResult =
  | {
      success: true;
      createdLayerIds: string[];
      executedIntents: EngineIntent[];
    }
  | {
      success: false;
      createdLayerIds: [];
      executedIntents: [];
      error: string;
      errorKey: TextCommandErrorKey;
    };

const DEFAULT_TEXT_DURATION_SECONDS = 5;

export function addTitleText(options: AddTextProductCommandOptions): TextProductCommandResult {
  return executeTextCommand(resolveAddTitleTextCommand(options));
}

export function addCaptionText(options: AddTextProductCommandOptions): TextProductCommandResult {
  return executeTextCommand(resolveAddCaptionTextCommand(options));
}

export function updateSelectedTextStyle(
  options: UpdateSelectedTextStyleCommandOptions,
): TextProductCommandResult {
  return executeTextCommand(resolveUpdateSelectedTextStyleCommand(options));
}

export function resolveAddTitleTextCommand(
  options: AddTextProductCommandOptions,
): TextProductCommandResolution {
  return resolveAddTextCommand(options, {
    layerIdPrefix: 'title-text',
    defaultPlacement: 'center',
    defaultFontSize: 72,
    defaultOutlineWidth: 2,
  });
}

export function resolveAddCaptionTextCommand(
  options: AddTextProductCommandOptions,
): TextProductCommandResolution {
  return resolveAddTextCommand(options, {
    layerIdPrefix: 'caption-text',
    defaultPlacement: 'bottom',
    defaultFontSize: 46,
    defaultOutlineWidth: 2,
  });
}

export function resolveUpdateSelectedTextStyleCommand(
  options: UpdateSelectedTextStyleCommandOptions,
): TextProductCommandResolution {
  const manifest = options.manifest ?? engineStore.getManifest();
  const selectedLayerId =
    options.selectedLayerId !== undefined
      ? options.selectedLayerId
      : useStudioStore.getState().selectedLayerId;
  if (!selectedLayerId) {
    return failTextCommand('text.noSelection');
  }

  const selectedLayer = manifest.layers[selectedLayerId];
  if (!selectedLayer || getStudioLayerTypeFromManifest(selectedLayer) !== 'text') {
    return failTextCommand('text.noSelection');
  }

  const sourceParams = normalizeTextStyleParams(options.patch);
  const layerPatch = buildLayerPatch(selectedLayer, options.patch, sourceParams);
  if (Object.keys(layerPatch).length === 0) {
    return failTextCommand('text.applyFailed');
  }

  return {
    success: true,
    createdLayerIds: [],
    intents: [
      {
        type: INTENT_TYPES.UPDATE_LAYER_PROPS,
        layerId: selectedLayerId,
        patch: layerPatch,
      },
    ],
  };
}

function resolveAddTextCommand(
  options: AddTextProductCommandOptions,
  defaults: {
    layerIdPrefix: string;
    defaultPlacement: TextCommandPlacement;
    defaultFontSize: number;
    defaultOutlineWidth: number;
  },
): TextProductCommandResolution {
  const text = options.text.trim();
  if (!text) {
    return failTextCommand('text.applyFailed');
  }

  const manifest = options.manifest ?? engineStore.getManifest();
  const targetScopeId = resolveTextScopeId(manifest);
  if (!targetScopeId) {
    return failTextCommand('text.noScopeFound');
  }

  const snapshot = options.snapshot ?? engineStore.getSnapshot();
  const canvasWidth = snapshot.width || manifest.projectSettings.canvas.size.width;
  const canvasHeight = snapshot.height || manifest.projectSettings.canvas.size.height;
  const placement = options.placement ?? defaults.defaultPlacement;
  const layerId = createLayerId(defaults.layerIdPrefix);
  const y = resolvePlacementY(canvasHeight, placement);
  const durationSeconds =
    typeof options.durationSeconds === 'number' && Number.isFinite(options.durationSeconds)
      ? Math.max(0.1, options.durationSeconds)
      : DEFAULT_TEXT_DURATION_SECONDS;

  const baseManifest = buildCenteredTextLayerManifest({
    id: layerId,
    text,
    name: text,
    startTime:
      typeof options.startTime === 'number' && Number.isFinite(options.startTime)
        ? Math.max(0, options.startTime)
        : 0,
    duration: durationSeconds,
    canvasWidth,
    canvasHeight,
    params: {
      fontSize: defaults.defaultFontSize,
      fontWeight: 'bold',
      color: [...TEXT_CONFIG.DEFAULT_COLOR],
      outlineColor: [...TEXT_CONFIG.DEFAULT_OUTLINE_COLOR],
      outlineWidth: defaults.defaultOutlineWidth,
      anchor: { x: 0.5, y: 0.5 },
    },
  });

  return {
    success: true,
    createdLayerIds: [layerId],
    intents: [
      {
        type: INTENT_TYPES.ADD_LAYER,
        targetScopeId,
        manifest: {
          ...baseManifest,
          transform: {
            ...(baseManifest.transform ?? {
              position: { x: canvasWidth / 2, y },
              scale: { x: 1, y: 1 },
              rotation: 0,
            }),
            position: { x: canvasWidth / 2, y },
          },
        },
      },
    ],
  };
}

function executeTextCommand(resolution: TextProductCommandResolution): TextProductCommandResult {
  if (!resolution.success) {
    return {
      success: false,
      createdLayerIds: [],
      executedIntents: [],
      error: resolution.error,
      errorKey: resolution.errorKey,
    };
  }

  const manifest = engineStore.getManifest();
  engineStore.executeAtomicIntentBatch(resolution.intents);
  seekToFirstChangedTimelineTime({ intents: resolution.intents, manifest });
  const lastCreatedLayerId = resolution.createdLayerIds[resolution.createdLayerIds.length - 1];
  if (lastCreatedLayerId) {
    useStudioStore.getState().selectLayer(lastCreatedLayerId);
  }

  return {
    success: true,
    createdLayerIds: resolution.createdLayerIds,
    executedIntents: resolution.intents,
  };
}

function resolveTextScopeId(manifest: ReturnType<typeof engineStore.getManifest>): string | null {
  return findScopeIdByRole(manifest, 'text');
}

function findScopeIdByRole(
  manifest: ReturnType<typeof engineStore.getManifest>,
  role: 'main' | 'overlay' | 'text',
): string | null {
  return (
    manifest.layerOrder.find((layerId) => {
      const layer = manifest.layers[layerId];
      return (
        isScopeStartManifest(layer) &&
        !isProjectAnchorManifest(layer) &&
        layer.control?.params?.scopeRole === role
      );
    }) ?? null
  );
}

function resolvePlacementY(canvasHeight: number, placement: TextCommandPlacement): number {
  if (placement === 'top') {
    return canvasHeight * 0.18;
  }
  if (placement === 'bottom') {
    return canvasHeight * 0.82;
  }
  return canvasHeight / 2;
}

function normalizeTextStyleParams(patch: Record<string, unknown>): Record<string, JsonValue> {
  const params: Record<string, JsonValue> = {};
  const normalizedColor = normalizeColorValue(patch.color ?? patch.textColor ?? patch.fillColor);
  if (normalizedColor) {
    params.color = normalizedColor;
  }
  const normalizedOutlineColor = normalizeColorValue(
    patch.outlineColor ?? patch.strokeColor ?? patch.borderColor,
  );
  if (normalizedOutlineColor) {
    params.outlineColor = normalizedOutlineColor;
  }
  const outlineEnabled =
    patch.outline === true || patch.hasOutline === true || patch.stroke === true;
  if (outlineEnabled && patch.outlineWidth === undefined && patch.strokeWidth === undefined) {
    params.outlineWidth = 2;
  }
  if (
    outlineEnabled &&
    patch.outlineColor === undefined &&
    patch.strokeColor === undefined &&
    patch.borderColor === undefined
  ) {
    params.outlineColor = [0, 0, 0, 1];
  }

  for (const key of [
    'text',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'align',
    'outlineWidth',
    'strokeWidth',
    'anchor',
  ]) {
    const value = patch[key];
    if (value !== undefined && isJsonValue(value)) {
      params[key === 'strokeWidth' ? 'outlineWidth' : key] = value;
    }
  }
  return params;
}

function normalizeColorValue(value: unknown): [number, number, number, number] | null {
  if (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((component) => typeof component === 'number' && Number.isFinite(component))
  ) {
    return value as [number, number, number, number];
  }

  const normalized = typeof value === 'string' ? value.toLowerCase().trim() : '';
  switch (normalized) {
    case 'white':
    case '흰색':
      return [1, 1, 1, 1];
    case 'black':
    case '검정':
    case '검은색':
      return [0, 0, 0, 1];
    case 'red':
    case '빨강':
    case '빨간색':
      return [1, 0.12, 0.12, 1];
    case 'yellow':
    case '노랑':
    case '노란색':
      return [1, 0.9, 0.1, 1];
    case 'blue':
    case '파랑':
    case '파란색':
      return [0.2, 0.6, 1, 1];
    default:
      return parseHexColor(normalized);
  }
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

function buildLayerPatch(
  layer: ILayerManifest,
  rawPatch: Record<string, unknown>,
  sourceParams: Record<string, JsonValue>,
): Partial<ILayerManifest> {
  const patch: Partial<ILayerManifest> = {};
  if (Object.keys(sourceParams).length > 0) {
    Object.assign(patch, mergeSourceParamsPatch(layer, sourceParams));
  }

  const position = normalizePoint(rawPatch.position);
  const scale = normalizePoint(rawPatch.scale);
  const rotation =
    typeof rawPatch.rotation === 'number' && Number.isFinite(rawPatch.rotation)
      ? rawPatch.rotation
      : undefined;
  if (position || scale || rotation !== undefined) {
    patch.transform = {
      position: position ?? layer.transform?.position ?? { x: 0, y: 0 },
      scale: scale ?? layer.transform?.scale ?? { x: 1, y: 1 },
      rotation: rotation ?? layer.transform?.rotation ?? 0,
    };
  }

  const opacity =
    typeof rawPatch.opacity === 'number' && Number.isFinite(rawPatch.opacity)
      ? Math.max(0, Math.min(1, rawPatch.opacity))
      : undefined;
  if (opacity !== undefined) {
    patch.appearance = {
      visible: layer.appearance?.visible ?? true,
      opacity,
    };
  }

  if (typeof rawPatch.name === 'string' && rawPatch.name.trim().length > 0) {
    patch.name = rawPatch.name.trim();
  }

  return patch;
}

function normalizePoint(value: unknown): { x: number; y: number } | null {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number' &&
    Number.isFinite((value as { x: number }).x) &&
    Number.isFinite((value as { y: number }).y)
  ) {
    return { x: (value as { x: number }).x, y: (value as { y: number }).y };
  }
  return null;
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

function failTextCommand(
  errorKey: TextCommandErrorKey,
  error: string = resolveDefaultTextCommandError(errorKey),
): TextProductCommandResolution {
  return {
    success: false,
    error,
    errorKey,
  };
}

function resolveDefaultTextCommandError(errorKey: TextCommandErrorKey): string {
  switch (errorKey) {
    case 'text.noScopeFound':
      return '텍스트를 배치할 수 있는 scope를 찾지 못했습니다.';
    case 'text.noSelection':
      return '선택된 텍스트 레이어가 없습니다.';
    case 'text.applyFailed':
      return '텍스트 명령을 적용할 수 없습니다.';
  }
}

function createLayerId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
