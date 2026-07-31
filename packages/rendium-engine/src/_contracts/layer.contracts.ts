export type LayerId = string;
export type LinkId = string;
export type SourceId = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type SourceParams = Record<string, JsonValue>;

export type LayerKind = 'visual' | 'audio' | 'control';
export type SourceTrackKind = 'visual' | 'audio' | 'metadata';
export type SourceProviderKind =
  | 'raster'
  | 'animated-raster'
  | 'svg'
  | 'video'
  | 'text'
  | 'shape'
  | 'generated-visual'
  | 'audio-file'
  | 'generated-audio'
  | 'stream';

export type BehaviorRole =
  | 'syncMove'
  | 'syncTrim'
  | 'deleteTogether'
  | 'selectTogether'
  | 'dependsOn'
  | 'drivesParameter'
  | 'inheritsTransform'
  | 'appliesEffect'
  | 'allowsCycle'
  | 'requiresAcyclic';

export interface SourceRef {
  sourceId: SourceId;
  track?: SourceTrackKind;
  clipOffset?: number;
  playbackRate?: number;
  provider?: SourceProviderKind;
  params?: SourceParams;
}

export interface LayerLink {
  id: LinkId;
  from: LayerId;
  to: LayerId;
  roles: BehaviorRole[];
}

export type ScopeRuleType = 'freeform' | 'mutex' | 'magnetic';
export type ScopeRoleType = 'main' | 'overlay' | 'text' | 'composite';

export interface ControlParams {
  ruleType?: ScopeRuleType;
  scopeRole?: ScopeRoleType;
  isSystem?: boolean;
  isProjectAnchor?: boolean;
  [key: string]: unknown;
}

export interface ControlSpec {
  role:
    | 'scopeStart'
    | 'scopeEnd'
    | 'marker'
    | 'adjustment'
    | 'mask'
    | 'camera'
    | 'automation'
    | 'transition';
  targetScopeId?: LayerId;
  params?: ControlParams;
}

export interface EffectSpec {
  kind: string;
  params: Record<string, unknown>;
}

export type ImageFitMode = 'contain' | 'cover';

export interface LayerCapability {
  kind: LayerKind;
  provider?: SourceProviderKind;
  controlRole?: ControlSpec['role'];
}

export const SCOPE_ROLE_ALLOWED_CHILD_CAPABILITIES: Record<
  ScopeRoleType,
  readonly LayerCapability[]
> = {
  main: [
    { kind: 'visual', provider: 'video' },
    { kind: 'visual', provider: 'raster' },
    { kind: 'audio' },
    { kind: 'control', controlRole: 'scopeStart' },
  ],
  overlay: [
    { kind: 'visual', provider: 'raster' },
    { kind: 'visual', provider: 'video' },
    { kind: 'visual', provider: 'generated-visual' },
    { kind: 'control', controlRole: 'scopeStart' },
  ],
  text: [
    { kind: 'visual', provider: 'text' },
    { kind: 'control', controlRole: 'scopeStart' },
  ],
  composite: [
    { kind: 'visual' },
    { kind: 'audio' },
    { kind: 'control', controlRole: 'scopeStart' },
  ],
} as const;

export function getAllowedChildCapabilities(scopeRole?: ScopeRoleType): readonly LayerCapability[] {
  return scopeRole
    ? SCOPE_ROLE_ALLOWED_CHILD_CAPABILITIES[scopeRole]
    : SCOPE_ROLE_ALLOWED_CHILD_CAPABILITIES.composite;
}

export function isLayerCapabilityAllowedInScopeRole(
  capability: LayerCapability,
  scopeRole?: ScopeRoleType,
): boolean {
  return getAllowedChildCapabilities(scopeRole).some((allowed) => {
    if (allowed.kind !== capability.kind) return false;
    if (allowed.provider !== undefined && allowed.provider !== capability.provider) return false;
    if (allowed.controlRole !== undefined && allowed.controlRole !== capability.controlRole) {
      return false;
    }
    return true;
  });
}

export const SCENE_CONFIG = {
  DEFAULT_RESOLUTION: { width: 1920, height: 1080 },
  DEFAULT_POSITION: { x: 0, y: 0 },
  DEFAULT_SCALE: { x: 1, y: 1 },
  DEFAULT_ROTATION: 0,
  DEFAULT_VISIBLE: true,
} as const;

export const SPECTRUM_CONFIG = {
  DEFAULT_BAND_COUNT: 96,
  DEFAULT_COLOR: [1, 0.72, 0.22, 1] as [number, number, number, number],
  DEFAULT_MIN_HEIGHT: 0.018,
  DEFAULT_MAX_HEIGHT: 0.26,
  DEFAULT_SMOOTHING: 0.72,
  DEFAULT_BAR_GAP: 0.08,
  DEFAULT_GAIN: 0.9,
  DEFAULT_MIN_FREQUENCY: 20.0,
  DEFAULT_MAX_FREQUENCY: 8000.0,
  DEFAULT_SPECTRAL_TILT: 0.5,
  DEFAULT_COLOR_LOW: [1, 0.27, 0.42, 1] as [number, number, number, number],
  DEFAULT_COLOR_HIGH: [1, 0.84, 0.24, 1] as [number, number, number, number],
  DEFAULT_GRADIENT_MODE: true,
  DEFAULT_POSITION: { x: 0, y: 1080 },
  DEFAULT_SCALE: { x: 1920, y: -540 },
} as const;

export const IMAGE_CONFIG = {
  DEFAULT_FIT: 'contain' as const,
  DEFAULT_OPACITY: 1,
  DEFAULT_POSITION: { x: 0, y: 0 },
  DEFAULT_SCALE: { x: 1, y: 1 },
} as const;

export const BACKGROUND_CONFIG = {
  DEFAULT_COLOR: [0.05, 0.05, 0.07, 1.0] as [number, number, number, number],
  DEFAULT_IMAGE_OPACITY: 1.0,
  DEFAULT_SOURCE_URL: null as string | null,
} as const;

export const AUDIO_CONFIG = {
  DEFAULT_VOLUME: 1.0,
  DEFAULT_MUTED: false,
  DEFAULT_CLIP_OFFSET: 0,
} as const;

export const TEXT_CONFIG = {
  DEFAULT_FONT_FAMILY: 'Arial, sans-serif',
  DEFAULT_FONT_SIZE: 24,
  DEFAULT_COLOR: [1, 1, 1, 1] as [number, number, number, number], // White
  DEFAULT_ALIGN: 'center' as const,
  DEFAULT_OUTLINE_COLOR: [0, 0, 0, 1] as [number, number, number, number], // Black
  DEFAULT_OUTLINE_WIDTH: 0,
  DEFAULT_ANCHOR: { x: 0, y: 0 },
} as const;

export interface RenderContext {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly passEncoder: GPURenderPassEncoder;
  readonly currentTime: number;
  readonly deltaTime: number;
  /**
   * Logical project canvas resolution used for layer layout calculations.
   */
  readonly resolution: { width: number; height: number };
  /**
   * Actual render target resolution. When omitted, it is assumed to match
   * `resolution`.
   */
  readonly viewportResolution?: { width: number; height: number };
  readonly state: {
    readonly matrix: Float32Array;
    readonly opacity: number;
  };
  readonly getAudioData?: (audioId: string) => Float32Array;
  readonly sampleRate: number;
  readonly sceneRegistry: Map<LayerId, ILayer>;
  readonly shakeX?: number;
  readonly shakeY?: number;
}

export interface LayerConfig {
  id?: LayerId;
  kind?: LayerKind;
  startTime?: number;
  duration?: number;
  isInfinite?: boolean;
  visible?: boolean;
  name?: string;
  isProjectAnchor?: boolean;
  position?: { x: number; y: number };
  scale?: { x: number; y: number };
  rotation?: number;
  opacity?: number;
  color?: [number, number, number, number];
  backgroundColor?: [number, number, number, number];
  imageOpacity?: number;
  fit?: ImageFitMode;
  sourceWidth?: number;
  sourceHeight?: number;
  smoothing?: number;
  sourceUrl?: string | null;
  volume?: number;
  muted?: boolean;
  clipOffset?: number;
  source?: unknown;
  imageSource?: unknown;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  align?: 'left' | 'center' | 'right';
  outlineColor?: [number, number, number, number];
  outlineWidth?: number;
  anchor?: { x: number; y: number };
  linkedAudioId?: string | null;
  bandCount?: number;
  barGap?: number;
  minHeight?: number;
  maxHeight?: number;
  gain?: number;
  minFrequency?: number;
  maxFrequency?: number;
  spectralTilt?: number;
  gradientMode?: boolean;
  colorLow?: [number, number, number, number];
  colorHigh?: [number, number, number, number];
  targetAudioId?: string | null;
  targetScopeId?: LayerId;
  ruleType?: ScopeRuleType;
  scopeRole?: ScopeRoleType;
  isSystem?: boolean;
  mode?: 'bar' | 'waveform' | 'circle';
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Component Interfaces (Composition over Inheritance)
// ---------------------------------------------------------------------------

/**
 * Geometric / spatial component.
 * Only RenderableLayer and optionally ScopeStartLayer carry this.
 */
export interface ITransform {
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  readonly _localMatrix: Float32Array;
}

/**
 * Optical / visibility component.
 * Only RenderableLayer and optionally ScopeStartLayer carry this.
 */
export interface IAppearance {
  visible: boolean;
  opacity: number;
}

// ---------------------------------------------------------------------------
// Core Layer Interface (temporal-only, lean)
// ---------------------------------------------------------------------------

/**
 * Base contract for every layer in the flat array.
 * Intentionally free of spatial, optical, and GPU concerns.
 */
export interface ILayer {
  readonly id: LayerId;
  readonly kind: LayerKind;
  readonly isProjectAnchor?: boolean;
  isInfinite?: boolean;
  isSystem?: boolean;
  name?: string;

  startTime: number;
  duration: number;

  update(time: number, deltaTime: number, getAudioData?: (id: string) => Float32Array): void;
  dispose(): void;

  /** Update internal config/data */
  updateConfig(config: LayerConfig): void;

  /** Get current configuration */
  getConfig(): LayerConfig;
}

// ---------------------------------------------------------------------------
// Renderable Layer Interface (spatial + optical + GPU)
// ---------------------------------------------------------------------------

/**
 * Extended contract for layers that produce GPU output.
 * Carries ITransform, IAppearance, and GPU lifecycle methods.
 */
export interface IRenderableLayer extends ILayer {
  readonly transform: ITransform;
  readonly appearance: IAppearance;

  // Syntactic-sugar getters (flat access, same as before)
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  opacity: number;
  visible: boolean;

  /** Intrinsic width in pixels (before scale) */
  readonly width: number;
  /** Intrinsic height in pixels (before scale) */
  readonly height: number;

  readonly isSetup: boolean;
  readonly isReady: boolean;
  isSetupFor(device: GPUDevice): boolean;
  setup(device: GPUDevice, format: GPUTextureFormat): Promise<void>;
  draw(context: RenderContext): void;
}

// ---------------------------------------------------------------------------
// Specific Layer Interfaces
// ---------------------------------------------------------------------------

export interface IScopeStartLayer extends ILayer {
  /** Transform matrix exposed to Scene for stack push. Identity if no transform attached. */
  readonly matrix: Float32Array;
  /** Effective opacity for stack push. 1.0 if no appearance attached. */
  readonly stackOpacity: number;
  ruleType?: ScopeRuleType;
  scopeRole?: ScopeRoleType;
  transform?: ITransform;
  appearance?: IAppearance;
}

export interface IAudioLayer extends ILayer {
  sourceUrl: string | null;
  volume: number;
  muted: boolean;
  clipOffset: number;
  audioBuffer: AudioBuffer | null;
  getFrequencyData(time?: number): Uint8Array | null;
  onMetadataLoad?: () => void;
}
