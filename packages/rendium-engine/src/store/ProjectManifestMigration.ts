import type {
  BehaviorRole,
  ControlSpec,
  ICanvasSettings,
  ILayerManifest,
  IProjectInfo,
  IProjectManifest,
  IProjectSettings,
  ITimeRange,
  IWatermarkConfig,
  LayerKind,
  LayerLink,
  SourceProviderKind,
  SourceTrackKind,
} from '../_contracts';
import {
  BACKGROUND_CONFIG,
  PROJECT_CONFIG,
  PROJECT_MANIFEST_VERSION,
  SCENE_CONFIG,
} from '../_contracts';

export type ProjectManifestInput = Partial<
  Omit<IProjectManifest, 'projectInfo' | 'projectSettings'>
> & {
  projectInfo?: Partial<IProjectInfo> | undefined;
  projectSettings?: Partial<IProjectSettings> | undefined;
  meta?: Partial<IProjectInfo> | undefined;
  canvasSize?: { width?: number; height?: number } | undefined;
  canvasBackgroundColor?: [number, number, number, number] | undefined;
  watermark?: IWatermarkConfig | undefined;
  exportRange?: ITimeRange | undefined;
  workArea?: ITimeRange | undefined;
};

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value;

  return structuredClone(value);
}

type ManifestRecordKey =
  | 'appearance'
  | 'backgroundColor'
  | 'canvas'
  | 'canvasBackgroundColor'
  | 'canvasSize'
  | 'clipOffset'
  | 'control'
  | 'createdAt'
  | 'duration'
  | 'effects'
  | 'enabled'
  | 'endTime'
  | 'exportRange'
  | 'from'
  | 'height'
  | 'id'
  | 'injectionSegments'
  | 'kind'
  | 'layerOrder'
  | 'layers'
  | 'links'
  | 'meta'
  | 'name'
  | 'opacity'
  | 'params'
  | 'playbackRate'
  | 'position'
  | 'projectInfo'
  | 'projectSettings'
  | 'props'
  | 'provider'
  | 'role'
  | 'roles'
  | 'rotation'
  | 'scale'
  | 'size'
  | 'source'
  | 'sourceId'
  | 'sourceUrl'
  | 'startTime'
  | 'targetScopeId'
  | 'text'
  | 'to'
  | 'track'
  | 'transform'
  | 'type'
  | 'updatedAt'
  | 'version'
  | 'visible'
  | 'watermark'
  | 'width'
  | 'workArea'
  | 'x'
  | 'y';

type ManifestRecord = Record<string, unknown> & Partial<Record<ManifestRecordKey, unknown>>;

function isRecord(value: unknown): value is ManifestRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function assertOptionalNumber(value: unknown, path: string): void {
  if (value !== undefined && !isNumber(value)) {
    throw new Error(`Project manifest is invalid: ${path} must be a finite number.`);
  }
}

function assertOptionalString(value: unknown, path: string): void {
  if (value !== undefined && !isString(value)) {
    throw new Error(`Project manifest is invalid: ${path} must be a string.`);
  }
}

function assertVector(value: unknown, path: string): void {
  if (!isRecord(value) || !isNumber(value.x) || !isNumber(value.y)) {
    throw new Error(`Project manifest is invalid: ${path} must be a numeric vector.`);
  }
}

function assertOptionalColorTuple(value: unknown, path: string): void {
  if (value === undefined) return;

  if (!Array.isArray(value) || value.length !== 4 || !value.every(isNumber)) {
    throw new Error(`Project manifest is invalid: ${path} must be a four-number color tuple.`);
  }
}

function assertOptionalTimeRange(value: unknown, path: string): void {
  if (value === undefined) return;

  if (!isRecord(value) || !isNumber(value.startTime) || !isNumber(value.endTime)) {
    throw new Error(`Project manifest is invalid: ${path} must be a numeric time range.`);
  }
}

function assertOptionalWatermark(value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isRecord(value) || !isBoolean(value.enabled)) {
    throw new Error(`Project manifest is invalid: ${path}.enabled must be a boolean.`);
  }

  assertOptionalString(value.text, `${path}.text`);
  if (value.sourceUrl !== undefined && value.sourceUrl !== null && !isString(value.sourceUrl)) {
    throw new Error(`Project manifest is invalid: ${path}.sourceUrl must be a string or null.`);
  }
  assertOptionalNumber(value.opacity, `${path}.opacity`);
  if (value.position !== undefined) assertVector(value.position, `${path}.position`);
  if (value.scale !== undefined) assertVector(value.scale, `${path}.scale`);
}

const LAYER_KINDS = new Set<string>(['visual', 'audio', 'control'] satisfies LayerKind[]);
const SOURCE_TRACKS = new Set<string>(['visual', 'audio', 'metadata'] satisfies SourceTrackKind[]);
const SOURCE_PROVIDERS = new Set<string>([
  'raster',
  'animated-raster',
  'svg',
  'video',
  'text',
  'shape',
  'generated-visual',
  'audio-file',
  'generated-audio',
  'stream',
] satisfies SourceProviderKind[]);
const CONTROL_ROLES = new Set<string>([
  'scopeStart',
  'scopeEnd',
  'marker',
  'adjustment',
  'mask',
  'camera',
  'automation',
  'transition',
] satisfies ControlSpec['role'][]);
const BEHAVIOR_ROLES = new Set<string>([
  'syncMove',
  'syncTrim',
  'deleteTogether',
  'selectTogether',
  'dependsOn',
  'drivesParameter',
  'inheritsTransform',
  'appliesEffect',
  'allowsCycle',
  'requiresAcyclic',
] satisfies BehaviorRole[]);

export interface CreateDefaultProjectInfoInput {
  readonly name?: string;
  readonly createdAt?: number;
}

export function createDefaultProjectInfo(input: CreateDefaultProjectInfoInput = {}): IProjectInfo {
  const name = input.name ?? PROJECT_CONFIG.DEFAULT_NAME;
  const createdAt = input.createdAt ?? Date.now();

  return {
    name,
    createdAt,
    updatedAt: createdAt,
  };
}

export interface CreateDefaultCanvasSettingsInput {
  readonly width?: number;
  readonly height?: number;
}

export function createDefaultCanvasSettings(
  input: CreateDefaultCanvasSettingsInput = {},
): ICanvasSettings {
  const width = input.width ?? SCENE_CONFIG.DEFAULT_RESOLUTION.width;
  const height = input.height ?? SCENE_CONFIG.DEFAULT_RESOLUTION.height;

  return {
    size: { width, height },
    backgroundColor: cloneValue(BACKGROUND_CONFIG.DEFAULT_COLOR),
  };
}

export interface CreateDefaultProjectSettingsInput {
  readonly width?: number;
  readonly height?: number;
}

export function createDefaultProjectSettings(
  input: CreateDefaultProjectSettingsInput = {},
): IProjectSettings {
  return {
    canvas: createDefaultCanvasSettings(input),
  };
}

export function resolveProjectInfo(source?: ProjectManifestInput): IProjectInfo {
  const candidate = source?.projectInfo ?? source?.meta;
  const createdAt = candidate?.createdAt ?? Date.now();

  return {
    name: candidate?.name?.trim() || PROJECT_CONFIG.DEFAULT_NAME,
    createdAt,
    updatedAt: candidate?.updatedAt ?? createdAt,
  };
}

export function resolveProjectSettings(source?: ProjectManifestInput): IProjectSettings {
  const canvasSize = source?.projectSettings?.canvas?.size ?? source?.canvasSize;
  const backgroundColor =
    source?.projectSettings?.canvas?.backgroundColor ?? source?.canvasBackgroundColor;
  const width =
    typeof canvasSize?.width === 'number'
      ? canvasSize.width
      : SCENE_CONFIG.DEFAULT_RESOLUTION.width;
  const height =
    typeof canvasSize?.height === 'number'
      ? canvasSize.height
      : SCENE_CONFIG.DEFAULT_RESOLUTION.height;

  const settings: IProjectSettings = createDefaultProjectSettings({ width, height });

  if (backgroundColor) {
    settings.canvas.backgroundColor = cloneValue(backgroundColor);
  }

  const watermark = source?.projectSettings?.watermark ?? source?.watermark;
  if (watermark) {
    settings.watermark = cloneValue(watermark);
  }

  const exportRange = source?.projectSettings?.exportRange ?? source?.exportRange;
  if (exportRange) {
    settings.exportRange = cloneValue(exportRange);
  }

  const workArea = source?.projectSettings?.workArea ?? source?.workArea;
  if (workArea) {
    settings.workArea = cloneValue(workArea);
  }

  return settings;
}

function cloneLayers(layers?: Record<string, ILayerManifest>): Record<string, ILayerManifest> {
  return cloneValue(layers ?? {});
}

function assertSourceRef(value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    throw new Error(`Project manifest is invalid: ${path} must be an object.`);
  }

  if (!isString(value.sourceId)) {
    throw new Error(`Project manifest is invalid: ${path}.sourceId must be a string.`);
  }
  if (value.track !== undefined && (!isString(value.track) || !SOURCE_TRACKS.has(value.track))) {
    throw new Error(`Project manifest is invalid: ${path}.track is unsupported.`);
  }
  if (
    value.provider !== undefined &&
    (!isString(value.provider) || !SOURCE_PROVIDERS.has(value.provider))
  ) {
    throw new Error(`Project manifest is invalid: ${path}.provider is unsupported.`);
  }
  assertOptionalNumber(value.clipOffset, `${path}.clipOffset`);
  assertOptionalNumber(value.playbackRate, `${path}.playbackRate`);
  if (value.params !== undefined && (!isRecord(value.params) || !isJsonValue(value.params))) {
    throw new Error(`Project manifest is invalid: ${path}.params must be JSON-compatible.`);
  }
}

function assertControlSpec(value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    throw new Error(`Project manifest is invalid: ${path} must be an object.`);
  }

  if (!isString(value.role) || !CONTROL_ROLES.has(value.role)) {
    throw new Error(`Project manifest is invalid: ${path}.role is unsupported.`);
  }
  assertOptionalString(value.targetScopeId, `${path}.targetScopeId`);
  if (value.params !== undefined && !isRecord(value.params)) {
    throw new Error(`Project manifest is invalid: ${path}.params must be an object.`);
  }
}

function assertLayerManifest(value: unknown, id: string): void {
  if (!isRecord(value)) {
    throw new Error(`Project manifest is invalid: layer "${id}" must be an object.`);
  }
  if (value.type !== undefined) {
    throw new Error(`Project manifest is invalid: layer "${id}" uses legacy "type".`);
  }
  if (value.props !== undefined) {
    throw new Error(`Project manifest is invalid: layer "${id}" uses legacy "props".`);
  }
  if (!isString(value.id)) {
    throw new Error(`Project manifest is invalid: layer "${id}" requires string id.`);
  }
  if (value.id !== id) {
    throw new Error(`Project manifest is invalid: layer "${id}" id does not match its key.`);
  }
  if (!isString(value.kind) || !LAYER_KINDS.has(value.kind)) {
    throw new Error(`Project manifest is invalid: layer "${id}" has invalid kind.`);
  }
  assertOptionalString(value.name, `layer "${id}".name`);
  if (!isNumber(value.startTime)) {
    throw new Error(`Project manifest is invalid: layer "${id}".startTime must be a number.`);
  }
  if (!isNumber(value.duration)) {
    throw new Error(`Project manifest is invalid: layer "${id}".duration must be a number.`);
  }

  if (value.transform !== undefined) {
    if (!isRecord(value.transform)) {
      throw new Error(`Project manifest is invalid: layer "${id}".transform must be an object.`);
    }
    assertVector(value.transform.position, `layer "${id}".transform.position`);
    assertVector(value.transform.scale, `layer "${id}".transform.scale`);
    if (!isNumber(value.transform.rotation)) {
      throw new Error(
        `Project manifest is invalid: layer "${id}".transform.rotation must be a number.`,
      );
    }
  }

  if (value.appearance !== undefined) {
    if (!isRecord(value.appearance)) {
      throw new Error(`Project manifest is invalid: layer "${id}".appearance must be an object.`);
    }
    if (!isBoolean(value.appearance.visible) || !isNumber(value.appearance.opacity)) {
      throw new Error(
        `Project manifest is invalid: layer "${id}".appearance requires visible and opacity.`,
      );
    }
  }

  assertSourceRef(value.source, `layer "${id}".source`);
  assertControlSpec(value.control, `layer "${id}".control`);

  if (value.kind === 'control' && value.control === undefined) {
    throw new Error(`Project manifest is invalid: control layer "${id}" requires control.role.`);
  }

  if (value.effects !== undefined) {
    if (!Array.isArray(value.effects)) {
      throw new Error(`Project manifest is invalid: layer "${id}".effects must be an array.`);
    }
    for (const [effectIndex, effect] of value.effects.entries()) {
      if (
        !isRecord(effect) ||
        !isString(effect.kind) ||
        !isRecord(effect.params) ||
        !isJsonValue(effect.params)
      ) {
        throw new Error(
          `Project manifest is invalid: layer "${id}".effects[${effectIndex}] is invalid.`,
        );
      }
    }
  }

  if (value.roles !== undefined) {
    if (!Array.isArray(value.roles) || !value.roles.every((role) => isString(role))) {
      throw new Error(`Project manifest is invalid: layer "${id}".roles must be strings.`);
    }
  }
}

function assertLayerMap(value: unknown): asserts value is Record<string, ILayerManifest> {
  if (value === undefined) return;
  if (!isRecord(value)) {
    throw new Error('Project manifest is invalid: layers must be an object.');
  }

  for (const [id, layer] of Object.entries(value)) {
    assertLayerManifest(layer, id);
  }
}

function assertLayerOrder(value: unknown): asserts value is string[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every(isString)) {
    throw new Error('Project manifest is invalid: layerOrder must be an array of layer ids.');
  }
}

function assertLinks(value: unknown): asserts value is Record<string, LayerLink> | undefined {
  if (value === undefined) return;
  if (!isRecord(value)) {
    throw new Error('Project manifest is invalid: links must be an object.');
  }

  for (const [id, link] of Object.entries(value)) {
    if (!isRecord(link)) {
      throw new Error(`Project manifest is invalid: link "${id}" must be an object.`);
    }
    if (!isString(link.id) || link.id !== id || !isString(link.from) || !isString(link.to)) {
      throw new Error(`Project manifest is invalid: link "${id}" has invalid endpoints.`);
    }
    if (
      !Array.isArray(link.roles) ||
      !link.roles.every((role) => isString(role) && BEHAVIOR_ROLES.has(role))
    ) {
      throw new Error(`Project manifest is invalid: link "${id}" has invalid roles.`);
    }
  }
}

function assertProjectInfo(value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    throw new Error(`Project manifest is invalid: ${path} must be an object.`);
  }
  assertOptionalString(value.name, `${path}.name`);
  assertOptionalNumber(value.createdAt, `${path}.createdAt`);
  assertOptionalNumber(value.updatedAt, `${path}.updatedAt`);
}

function assertProjectSettings(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    throw new Error('Project manifest is invalid: projectSettings must be an object.');
  }

  if (value.canvas !== undefined) {
    if (!isRecord(value.canvas)) {
      throw new Error('Project manifest is invalid: projectSettings.canvas must be an object.');
    }
    if (value.canvas.size !== undefined) {
      if (!isRecord(value.canvas.size)) {
        throw new Error(
          'Project manifest is invalid: projectSettings.canvas.size must be an object.',
        );
      }
      assertOptionalNumber(value.canvas.size.width, 'projectSettings.canvas.size.width');
      assertOptionalNumber(value.canvas.size.height, 'projectSettings.canvas.size.height');
    }
    assertOptionalColorTuple(
      value.canvas.backgroundColor,
      'projectSettings.canvas.backgroundColor',
    );
  }

  assertOptionalWatermark(value.watermark, 'projectSettings.watermark');
  assertOptionalTimeRange(value.exportRange, 'projectSettings.exportRange');
  assertOptionalTimeRange(value.workArea, 'projectSettings.workArea');
}

function assertProjectManifestInput(input: unknown): asserts input is ProjectManifestInput {
  if (!isRecord(input)) {
    throw new Error('Project manifest is invalid: manifest must be an object.');
  }

  if (input.version !== undefined && input.version !== PROJECT_MANIFEST_VERSION) {
    throw new Error(
      `Project manifest is invalid: unsupported manifest version "${String(input.version)}".`,
    );
  }

  assertProjectInfo(input.projectInfo, 'projectInfo');
  assertProjectInfo(input.meta, 'meta');
  assertProjectSettings(input.projectSettings);
  if (input.canvasSize !== undefined) {
    if (!isRecord(input.canvasSize)) {
      throw new Error('Project manifest is invalid: canvasSize must be an object.');
    }
    assertOptionalNumber(input.canvasSize.width, 'canvasSize.width');
    assertOptionalNumber(input.canvasSize.height, 'canvasSize.height');
  }
  assertOptionalColorTuple(input.canvasBackgroundColor, 'canvasBackgroundColor');
  assertOptionalWatermark(input.watermark, 'watermark');
  assertOptionalTimeRange(input.exportRange, 'exportRange');
  assertOptionalTimeRange(input.workArea, 'workArea');
  assertLayerMap(input.layers);
  assertLayerOrder(input.layerOrder);
  assertLinks(input.links);
}

function normalizeLayerOrder(
  layerOrder: string[] | undefined,
  layers: Record<string, ILayerManifest>,
): string[] {
  const order = Array.isArray(layerOrder) ? [...layerOrder] : [];

  for (const id of order) {
    if (!layers[id]) {
      throw new Error(`Project manifest is invalid: layerOrder references missing layer "${id}".`);
    }
  }

  for (const id of Object.keys(layers)) {
    if (!order.includes(id)) {
      order.push(id);
    }
  }

  return order;
}

function normalizeLinks(
  links: Record<string, import('../_contracts').LayerLink> | undefined,
  layers: Record<string, ILayerManifest>,
): Record<string, import('../_contracts').LayerLink> {
  const normalized = cloneValue(links ?? {});

  for (const [id, link] of Object.entries(normalized)) {
    if (!layers[link.from]) {
      throw new Error(`Project manifest is invalid: link "${id}" references missing from layer.`);
    }
    if (!layers[link.to]) {
      throw new Error(`Project manifest is invalid: link "${id}" references missing to layer.`);
    }
  }

  return normalized;
}

export function normalizeProjectManifest(input: unknown): IProjectManifest {
  assertProjectManifestInput(input);
  const layers = cloneLayers(input.layers);
  const layerOrder = normalizeLayerOrder(input.layerOrder, layers);
  const links = normalizeLinks(input.links, layers);

  return {
    version: PROJECT_MANIFEST_VERSION,
    projectInfo: resolveProjectInfo(input),
    projectSettings: resolveProjectSettings(input),
    layers,
    layerOrder,
    links,
    ...(input.injectionSegments ? { injectionSegments: cloneValue(input.injectionSegments) } : {}),
  };
}
