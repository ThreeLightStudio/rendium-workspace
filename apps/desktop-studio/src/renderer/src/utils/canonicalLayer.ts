import {
  AUDIO_CONFIG,
  type ILayer,
  type ILayerManifest,
  IMAGE_CONFIG,
  type ImageFitMode,
  type JsonValue,
  type LayerConfig,
  SPECTRUM_CONFIG,
  type ScopeRoleType,
  type SourceProviderKind,
  type SourceRef,
  type SourceTrackKind,
  TEXT_CONFIG,
  engineStore,
  getAllowedChildCapabilities,
} from '@rendium/engine';

export type StudioLayerType =
  | 'image'
  | 'video'
  | 'text'
  | 'spectrum'
  | 'audio'
  | 'scope:start'
  | 'scope:end'
  | 'control';

const SOURCE_PARAM_KEYS = [
  'sourceUrl',
  'sourceWidth',
  'sourceHeight',
  'fit',
  'volume',
  'muted',
  'text',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'color',
  'align',
  'outlineColor',
  'outlineWidth',
  'anchor',
  'linkedAudioId',
  'bandCount',
  'barGap',
  'minHeight',
  'maxHeight',
  'gain',
  'smoothing',
  'minFrequency',
  'maxFrequency',
  'spectralTilt',
  'gradientMode',
  'colorLow',
  'colorHigh',
] as const;

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

export function isScopeStartManifest(layer?: ILayerManifest | null): boolean {
  return layer?.kind === 'control' && layer.control?.role === 'scopeStart';
}

export function isScopeEndManifest(layer?: ILayerManifest | null): boolean {
  return layer?.kind === 'control' && layer.control?.role === 'scopeEnd';
}

export function isProjectAnchorManifest(layer?: ILayerManifest | null): boolean {
  return layer?.control?.params?.isProjectAnchor === true;
}

export function isSystemManifest(layer?: ILayerManifest | null): boolean {
  return layer?.control?.params?.isSystem === true;
}

export function getManifestForLayer(
  layer: Pick<ILayer, 'id'> | string,
): ILayerManifest | undefined {
  const layerId = typeof layer === 'string' ? layer : layer.id;
  const manifest = engineStore.getManifest() as ReturnType<typeof engineStore.getManifest> | null;
  return manifest?.layers?.[layerId];
}

function readScopeRoleFromManifest(layer?: ILayerManifest | null): ScopeRoleType | undefined {
  const scopeRole = layer?.control?.params?.scopeRole;
  return scopeRole === 'main' ||
    scopeRole === 'overlay' ||
    scopeRole === 'text' ||
    scopeRole === 'composite'
    ? (scopeRole as ScopeRoleType)
    : undefined;
}

export function getScopeRole(layer?: ILayer | ILayerManifest | null): ScopeRoleType | undefined {
  if (!layer) return undefined;

  // Runtime layer or layer-like object.
  // Tests and UI helpers often pass lightweight objects with only an id, so
  // resolve through the public manifest snapshot instead of relying on runtime methods.
  if (typeof (layer as Partial<ILayer>).getConfig === 'function' || !('kind' in layer)) {
    return readScopeRoleFromManifest(getManifestForLayer(layer as Pick<ILayer, 'id'>));
  }

  // Manifest object. Non-control visual/audio manifests simply have no scope role.
  return readScopeRoleFromManifest(layer as ILayerManifest);
}

export function getStudioLayerTypeFromManifest(layer?: ILayerManifest | null): StudioLayerType {
  if (!layer) return 'control';
  if (isScopeStartManifest(layer)) return 'scope:start';
  if (isScopeEndManifest(layer)) return 'scope:end';
  if (layer.kind === 'audio') return 'audio';
  if (layer.kind === 'visual') {
    switch (layer.source?.provider) {
      case 'raster':
      case 'animated-raster':
      case 'svg':
        return 'image';
      case 'video':
        return 'video';
      case 'text':
        return 'text';
      case 'generated-visual':
        return 'spectrum';
      default:
        return 'control';
    }
  }
  return 'control';
}

export function getStudioLayerType(layer: ILayer): StudioLayerType {
  return getStudioLayerTypeFromManifest(getManifestForLayer(layer));
}

export function getStudioLayerClassName(layer: ILayer): string {
  return getStudioLayerType(layer).replace(':', '-');
}

export function getSourceParams(layer?: ILayerManifest | null): Record<string, JsonValue> {
  return layer?.source?.params ? { ...layer.source.params } : {};
}

export function getSourceParam<T extends JsonValue>(
  layer: ILayerManifest | undefined,
  key: string,
): T | undefined {
  return layer?.source?.params?.[key] as T | undefined;
}

function sourceIdFor(id: string, provider: SourceProviderKind, sourceUrl?: string | null): string {
  if (sourceUrl) return sourceUrl;
  if (provider === 'text') return `text:${id}`;
  if (provider === 'generated-visual') return `generated:${id}`;
  return `source:${id}`;
}

function makeSource(
  id: string,
  provider: SourceProviderKind,
  track: SourceTrackKind,
  params?: Record<string, JsonValue>,
  clipOffset?: number,
): SourceRef {
  const sourceUrl = typeof params?.sourceUrl === 'string' ? params.sourceUrl : null;
  return {
    sourceId: sourceIdFor(id, provider, sourceUrl),
    provider,
    track,
    ...(clipOffset !== undefined ? { clipOffset } : {}),
    ...(params ? { params } : {}),
  };
}

export function mergeSourceParamsPatch(
  layer: ILayerManifest,
  params: Record<string, JsonValue>,
): Partial<ILayerManifest> {
  const source = layer.source ?? makeSource(layer.id, 'generated-visual', 'visual');
  return {
    source: {
      ...source,
      params: {
        ...(source.params ?? {}),
        ...params,
      },
    },
  };
}

function extractSourceParams(config: Partial<LayerConfig>): Record<string, JsonValue> {
  const params: Record<string, JsonValue> = {};
  for (const key of SOURCE_PARAM_KEYS) {
    const value = config[key];
    if (value !== undefined && isJsonValue(value)) {
      params[key] = value;
    }
  }
  return params;
}

export function buildLayerPatchFromConfig(
  layer: ILayerManifest,
  config: Partial<LayerConfig>,
): Partial<ILayerManifest> {
  const patch: Partial<ILayerManifest> = {};

  if (typeof config.startTime === 'number') patch.startTime = config.startTime;
  if (typeof config.duration === 'number') patch.duration = config.duration;
  if (typeof config.name === 'string') patch.name = config.name;

  if (config.position || config.scale || config.rotation !== undefined) {
    patch.transform = {
      position: config.position ?? layer.transform?.position ?? { x: 0, y: 0 },
      scale: config.scale ?? layer.transform?.scale ?? { x: 1, y: 1 },
      rotation: config.rotation ?? layer.transform?.rotation ?? 0,
    };
  }

  if (config.opacity !== undefined || config.visible !== undefined) {
    patch.appearance = {
      visible: config.visible ?? layer.appearance?.visible ?? true,
      opacity: config.opacity ?? layer.appearance?.opacity ?? 1,
    };
  }

  const sourceParams = extractSourceParams(config);
  const clipOffset = typeof config.clipOffset === 'number' ? config.clipOffset : undefined;
  if (Object.keys(sourceParams).length > 0 || clipOffset !== undefined) {
    const source = layer.source ?? makeSource(layer.id, 'generated-visual', 'visual');
    patch.source = {
      ...source,
      ...(clipOffset !== undefined ? { clipOffset } : {}),
      params: {
        ...(source.params ?? {}),
        ...sourceParams,
      },
    };
  }

  const controlParams: Record<string, JsonValue> = {};
  for (const key of ['ruleType', 'scopeRole', 'isSystem', 'isProjectAnchor'] as const) {
    const value = config[key];
    if (value !== undefined && isJsonValue(value)) controlParams[key] = value;
  }
  if (Object.keys(controlParams).length > 0 && layer.kind === 'control') {
    patch.control = {
      role: layer.control?.role ?? 'scopeStart',
      ...(layer.control?.targetScopeId ? { targetScopeId: layer.control.targetScopeId } : {}),
      params: {
        ...(layer.control?.params ?? {}),
        ...controlParams,
      },
    };
  }

  return patch;
}

export function getAllowedStudioLayerTypes(scopeRole?: ScopeRoleType): StudioLayerType[] {
  const allowed = getAllowedChildCapabilities(scopeRole);
  const types = new Set<StudioLayerType>();
  for (const capability of allowed) {
    if (capability.kind === 'audio') types.add('audio');
    if (capability.kind === 'control' && capability.controlRole === 'scopeStart') {
      types.add('scope:start');
    }
    if (capability.kind === 'visual') {
      if (capability.provider === 'video') types.add('video');
      if (
        capability.provider === 'raster' ||
        capability.provider === 'animated-raster' ||
        capability.provider === 'svg'
      ) {
        types.add('image');
      }
      if (capability.provider === 'text') types.add('text');
      if (capability.provider === 'generated-visual') types.add('spectrum');
      if (capability.provider === undefined) {
        types.add('image');
        types.add('video');
        types.add('text');
        types.add('spectrum');
      }
    }
  }
  return [...types];
}

export function createImageLayerManifest(options: {
  id: string;
  name?: string;
  startTime: number;
  duration: number;
  sourceUrl?: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  fit?: ImageFitMode;
  opacity?: number;
}): ILayerManifest {
  return {
    id: options.id,
    kind: 'visual',
    name: options.name ?? 'Image Layer',
    startTime: options.startTime,
    duration: options.duration,
    source: makeSource(options.id, 'raster', 'visual', {
      sourceUrl: options.sourceUrl ?? null,
      ...(Number.isFinite(options.sourceWidth) && Number(options.sourceWidth) > 0
        ? { sourceWidth: Number(options.sourceWidth) }
        : {}),
      ...(Number.isFinite(options.sourceHeight) && Number(options.sourceHeight) > 0
        ? { sourceHeight: Number(options.sourceHeight) }
        : {}),
      fit: options.fit ?? IMAGE_CONFIG.DEFAULT_FIT,
    }),
    transform: {
      position: { ...IMAGE_CONFIG.DEFAULT_POSITION },
      scale: { ...IMAGE_CONFIG.DEFAULT_SCALE },
      rotation: 0,
    },
    appearance: {
      visible: true,
      opacity: options.opacity ?? IMAGE_CONFIG.DEFAULT_OPACITY,
    },
  };
}

export function createVideoLayerManifest(options: {
  id: string;
  name?: string;
  startTime: number;
  duration: number;
  sourceUrl?: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  fit?: ImageFitMode;
}): ILayerManifest {
  return {
    id: options.id,
    kind: 'visual',
    name: options.name ?? 'Video Layer',
    startTime: options.startTime,
    duration: options.duration,
    source: makeSource(options.id, 'video', 'visual', {
      sourceUrl: options.sourceUrl ?? null,
      sourceWidth: options.sourceWidth ?? null,
      sourceHeight: options.sourceHeight ?? null,
      fit: options.fit ?? IMAGE_CONFIG.DEFAULT_FIT,
    }),
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    },
    appearance: {
      visible: true,
      opacity: 1,
    },
  };
}

export function createVideoAudioLayerManifest(options: {
  id: string;
  name?: string;
  startTime: number;
  duration: number;
  sourceUrl?: string | null;
  volume?: number;
  muted?: boolean;
}): ILayerManifest {
  return {
    id: options.id,
    kind: 'audio',
    name: options.name ?? 'Video Audio',
    startTime: options.startTime,
    duration: options.duration,
    source: makeSource(options.id, 'video', 'audio', {
      sourceUrl: options.sourceUrl ?? null,
      volume: options.volume ?? AUDIO_CONFIG.DEFAULT_VOLUME,
      muted: options.muted ?? AUDIO_CONFIG.DEFAULT_MUTED,
    }),
  };
}

export function createAudioLayerManifest(options: {
  id: string;
  name?: string;
  startTime: number;
  duration: number;
  sourceUrl?: string | null;
}): ILayerManifest {
  return {
    id: options.id,
    kind: 'audio',
    name: options.name ?? 'Audio',
    startTime: options.startTime,
    duration: options.duration,
    source: makeSource(options.id, 'audio-file', 'audio', {
      sourceUrl: options.sourceUrl ?? null,
      volume: AUDIO_CONFIG.DEFAULT_VOLUME,
      muted: AUDIO_CONFIG.DEFAULT_MUTED,
    }),
  };
}

export function createSpectrumLayerManifest(options: {
  id: string;
  name?: string;
  startTime: number;
  duration: number;
  linkedAudioId?: string | null;
}): ILayerManifest {
  return {
    id: options.id,
    kind: 'visual',
    name: options.name ?? 'Spectrum Layer',
    startTime: options.startTime,
    duration: options.duration,
    source: makeSource(options.id, 'generated-visual', 'visual', {
      linkedAudioId: options.linkedAudioId ?? null,
      bandCount: SPECTRUM_CONFIG.DEFAULT_BAND_COUNT,
      color: [...SPECTRUM_CONFIG.DEFAULT_COLOR],
      minHeight: SPECTRUM_CONFIG.DEFAULT_MIN_HEIGHT,
      maxHeight: SPECTRUM_CONFIG.DEFAULT_MAX_HEIGHT,
      smoothing: SPECTRUM_CONFIG.DEFAULT_SMOOTHING,
      barGap: SPECTRUM_CONFIG.DEFAULT_BAR_GAP,
      gain: SPECTRUM_CONFIG.DEFAULT_GAIN,
      minFrequency: SPECTRUM_CONFIG.DEFAULT_MIN_FREQUENCY,
      maxFrequency: SPECTRUM_CONFIG.DEFAULT_MAX_FREQUENCY,
      spectralTilt: SPECTRUM_CONFIG.DEFAULT_SPECTRAL_TILT,
      gradientMode: SPECTRUM_CONFIG.DEFAULT_GRADIENT_MODE,
      colorLow: [...SPECTRUM_CONFIG.DEFAULT_COLOR_LOW],
      colorHigh: [...SPECTRUM_CONFIG.DEFAULT_COLOR_HIGH],
    }),
    transform: {
      position: { ...SPECTRUM_CONFIG.DEFAULT_POSITION },
      scale: { ...SPECTRUM_CONFIG.DEFAULT_SCALE },
      rotation: 0,
    },
    appearance: {
      visible: true,
      opacity: 1,
    },
  };
}

export function createTextLayerManifest(options: {
  id: string;
  text: string;
  name?: string;
  startTime: number;
  duration: number;
  canvasWidth: number;
  canvasHeight: number;
  appearance?: ILayerManifest['appearance'];
}): ILayerManifest {
  return {
    id: options.id,
    kind: 'visual',
    name: options.name ?? (options.text.slice(0, 24) || 'Text Layer'),
    startTime: options.startTime,
    duration: options.duration,
    source: makeSource(options.id, 'text', 'visual', {
      text: options.text,
      fontFamily: TEXT_CONFIG.DEFAULT_FONT_FAMILY,
      fontSize: TEXT_CONFIG.DEFAULT_FONT_SIZE,
      fontWeight: 'bold',
      color: [...TEXT_CONFIG.DEFAULT_COLOR],
      align: TEXT_CONFIG.DEFAULT_ALIGN,
      outlineColor: [...TEXT_CONFIG.DEFAULT_OUTLINE_COLOR],
      outlineWidth: TEXT_CONFIG.DEFAULT_OUTLINE_WIDTH,
      anchor: { x: 0.5, y: 0.5 },
    }),
    transform: {
      position: {
        x: Math.round(options.canvasWidth / 2),
        y: Math.round(options.canvasHeight / 2),
      },
      scale: { x: 1, y: 1 },
      rotation: 0,
    },
    appearance: options.appearance ?? {
      visible: true,
      opacity: 1,
    },
  };
}
