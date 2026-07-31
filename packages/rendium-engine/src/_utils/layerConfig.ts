import type {
  ImageFitMode,
  LayerConfig,
  LayerKind,
  ScopeRoleType,
  ScopeRuleType,
} from '../_contracts';

type LayerConfigRecord = Record<string, unknown> & Partial<Record<'x' | 'y', unknown>>;

function isRecord(value: unknown): value is LayerConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isLayerConfigVector(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

export function isLayerConfigColorTuple(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

export function isImageFitMode(value: unknown): value is ImageFitMode {
  return value === 'contain' || value === 'cover';
}

function isLayerKind(value: unknown): value is LayerKind {
  return value === 'visual' || value === 'audio' || value === 'control';
}

function isAlign(value: unknown): value is NonNullable<LayerConfig['align']> {
  return value === 'left' || value === 'center' || value === 'right';
}

function isScopeRuleType(value: unknown): value is ScopeRuleType {
  return value === 'freeform' || value === 'mutex' || value === 'magnetic';
}

function isScopeRoleType(value: unknown): value is ScopeRoleType {
  return value === 'main' || value === 'overlay' || value === 'text' || value === 'composite';
}

function isMode(value: unknown): value is NonNullable<LayerConfig['mode']> {
  return value === 'bar' || value === 'waveform' || value === 'circle';
}

function invalidLayerConfig(path: string, key: string): Error {
  return new Error(`LayerConfig is invalid: ${path}.${key} has an unsupported value.`);
}

export function normalizeLayerConfigPayload(value: unknown, path = 'config'): LayerConfig {
  if (!isRecord(value)) {
    throw new Error(`LayerConfig is invalid: ${path} must be an object.`);
  }

  const config: LayerConfig = {};

  for (const [key, entry] of Object.entries(value)) {
    switch (key) {
      case 'id':
      case 'name':
      case 'fontFamily':
      case 'targetScopeId':
        if (entry !== undefined && !isString(entry)) {
          throw invalidLayerConfig(path, key);
        }
        if (entry !== undefined) {
          config[key] = entry;
        }
        break;
      case 'sourceUrl':
      case 'linkedAudioId':
      case 'targetAudioId':
        if (entry !== null && entry !== undefined && !isString(entry)) {
          throw invalidLayerConfig(path, key);
        }
        if (entry !== undefined) {
          config[key] = entry;
        }
        break;
      case 'kind':
        if (!isLayerKind(entry)) throw invalidLayerConfig(path, key);
        config.kind = entry;
        break;
      case 'startTime':
      case 'duration':
      case 'rotation':
      case 'opacity':
      case 'imageOpacity':
      case 'sourceWidth':
      case 'sourceHeight':
      case 'smoothing':
      case 'volume':
      case 'clipOffset':
      case 'fontSize':
      case 'outlineWidth':
      case 'bandCount':
      case 'barGap':
      case 'minHeight':
      case 'maxHeight':
      case 'gain':
      case 'minFrequency':
      case 'maxFrequency':
      case 'spectralTilt':
        if (!isFiniteNumber(entry)) throw invalidLayerConfig(path, key);
        config[key] = entry;
        break;
      case 'isInfinite':
      case 'visible':
      case 'isProjectAnchor':
      case 'muted':
      case 'gradientMode':
      case 'isSystem':
        if (!isBoolean(entry)) throw invalidLayerConfig(path, key);
        config[key] = entry;
        break;
      case 'position':
      case 'scale':
      case 'anchor':
        if (!isLayerConfigVector(entry)) throw invalidLayerConfig(path, key);
        config[key] = entry;
        break;
      case 'color':
      case 'backgroundColor':
      case 'outlineColor':
      case 'colorLow':
      case 'colorHigh':
        if (!isLayerConfigColorTuple(entry)) throw invalidLayerConfig(path, key);
        config[key] = entry;
        break;
      case 'fit':
        if (!isImageFitMode(entry)) throw invalidLayerConfig(path, key);
        config.fit = entry;
        break;
      case 'text':
        if (!isString(entry)) throw invalidLayerConfig(path, key);
        config.text = entry;
        break;
      case 'fontWeight':
        if (!isString(entry) && !isFiniteNumber(entry)) throw invalidLayerConfig(path, key);
        config.fontWeight = entry;
        break;
      case 'align':
        if (!isAlign(entry)) throw invalidLayerConfig(path, key);
        config.align = entry;
        break;
      case 'ruleType':
        if (!isScopeRuleType(entry)) throw invalidLayerConfig(path, key);
        config.ruleType = entry;
        break;
      case 'scopeRole':
        if (!isScopeRoleType(entry)) throw invalidLayerConfig(path, key);
        config.scopeRole = entry;
        break;
      case 'mode':
        if (!isMode(entry)) throw invalidLayerConfig(path, key);
        config.mode = entry;
        break;
      default:
        config[key] = entry;
    }
  }

  return config;
}

export function normalizeLayerConfigEntry(
  key: string,
  value: unknown,
  path = 'config',
): LayerConfig {
  return normalizeLayerConfigPayload({ [key]: value }, path);
}
