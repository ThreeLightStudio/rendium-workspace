import type { Patch } from 'immer';
import type {
  BehaviorRole,
  ControlSpec,
  EffectSpec,
  ILayer,
  LayerId,
  LayerKind,
  LayerLink,
  RenderContext,
  SourceRef,
} from './layer.contracts';

// =============================================================================
// Phase 1 ─ DTO (Data Transfer Object) Interfaces
// Single Source of Truth for persistence and state management.
// Runtime-only fields (_localMatrix, GPU/Audio handles) are EXCLUDED here.
// =============================================================================

/**
 * Pure-JSON DTO for a single layer.
 *
 * Rules (enforced by omission):
 *  - No GPU references  (GPUBuffer, GPUTexture, GPUPipeline …)
 *  - No Audio handles   (_sourceNode, _gainNode, AudioBuffer …)
 *  - No derived data    (_localMatrix — recomputed from transform on load)
 */
export interface ILayerManifest {
  readonly id: LayerId;
  readonly kind: LayerKind;
  name?: string;

  /**
   * Temporal placement for timeline content only.
   * Global manifest settings such as canvas background, watermark, and export range
   * are owned by IProjectManifest.
   */
  startTime: number;
  duration: number;

  /**
   * Spatial component — present only on RenderableLayer and ScopeStartLayer.
   * Omit for AudioLayer, ScopeEndLayer, etc.
   */
  transform?: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
    // NOTE: _localMatrix is intentionally absent — recomputed at runtime
  };

  /**
   * Optical component — present only on RenderableLayer and ScopeStartLayer.
   */
  appearance?: {
    visible: boolean;
    opacity: number;
  };

  source?: SourceRef;
  effects?: EffectSpec[];
  control?: ControlSpec;
  roles?: BehaviorRole[];
}

/**
 * Project identity metadata.
 * Kept separate from render/config state so UI and persistence can treat it
 * as document identity rather than timeline content.
 */
export interface IProjectInfo {
  name: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Canvas-specific project settings.
 * The canvas size belongs here because it is part of the project-level
 * rendering surface, not the timeline layer graph.
 */
export interface ICanvasSettings {
  size: { width: number; height: number };
  backgroundColor?: [number, number, number, number];
}

/**
 * Project-wide render/export settings.
 * This is intentionally distinct from project identity so settings can evolve
 * without being mixed into document metadata.
 */
export interface IProjectSettings {
  canvas: ICanvasSettings;
  watermark?: IWatermarkConfig;
  exportRange?: ITimeRange;
  workArea?: ITimeRange;
}

/**
 * Normalized project manifest — the single source of truth (SSOT).
 *
 * Shape rationale (Record + layerOrder, not Array):
 *  - Array-based layers would cause Immer to emit `/layers/0`, `/layers/1`
 *    index-based patches on every insert/delete/move, leading to O(N) patch
 *    explosions and breaking the Reconciler's O(1) id-keyed lookup.
 *  - Record<id, manifest> ensures patches always carry the layer id
 *    (e.g. `/layers/id_abc/transform/position/x`), enabling O(1) registry
 *    lookup in SceneReconciler with zero reverse-index tables.
 *  - layerOrder is the *only* authority for rendering/Z-order sequence;
 *    mutating it never touches the `layers` Record, keeping patches minimal.
 */
export interface Segment {
  readonly id: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly effects?: {
    readonly shakeIntensity?: number;
    readonly spectrumSensitivity?: number;
    readonly colorHueShift?: number;
  };
}

/**
 * Unified Scene Graph State (SSOT)
 *
 * [Architecture Concept: State Mutation Converging Pipeline]
 * 사용자 입력(UI)과 AI의 예측/추천 액션(AiActionPreview)은 서로 다른 경로로 동작하지 않고,
 * 동일하게 이 단일 IProjectManifest 씬 그래프 데이터를 경유하여 변이(Mutation)를 수렴시킵니다.
 *
 * Zustand + Immer 기반의 스토어 변이 메커니즘을 사용하여 불변 상태(Immutable State) 변경 레시피를 실행하며,
 * 그 결과로 발생하는 정밀한 JSON Patch 스트림이 SceneReconciler로 전달되어
 * 런타임 WebGL 캔버스 및 Web Audio API 그래프 구성을 동기화시킵니다.
 */
export interface IProjectManifest {
  /** Schema version — bump when a breaking structural change is introduced. */
  readonly version: '1.0';
  /**
   * Project identity metadata.
   * Mutate ONLY via ProjectSettingsMutators.mutateProjectInfo.
   */
  projectInfo: IProjectInfo;
  /**
   * Project-wide render/export settings.
   * Mutate ONLY via ProjectSettingsMutators helpers.
   */
  projectSettings: IProjectSettings;
  /**
   * Attribute store: id → manifest (O(1) access).
   * Mutate ONLY via ManifestMutators.mutateLayerProps / addLayer / removeLayer.
   */
  layers: Record<LayerId, ILayerManifest>;
  /**
   * Rendering order: index 0 is drawn first (bottom), last is drawn on top.
   * Mutate ONLY via ManifestMutators.mutateLayerOrder.
   */
  layerOrder: LayerId[];
  /**
   * Relationship policy graph. Links never define render order or ownership.
   */
  links: Record<string, LayerLink>;
  /**
   * List of manually injected style/motion segment blocks in the timeline.
   */
  injectionSegments?: Segment[];
}

/**
 * Project-level time range used for export and working ranges.
 * This is intentionally separate from layer timing so global settings remain
 * distinct from timeline content.
 */
export interface ITimeRange {
  startTime: number;
  endTime: number;
}

/**
 * Project-level watermark configuration for always-on or project-wide overlays.
 * If a watermark needs temporal placement, it should be represented as a layer.
 */
export interface IWatermarkConfig {
  readonly enabled: boolean;
  text?: string;
  sourceUrl?: string | null;
  opacity?: number;
  position?: { x: number; y: number };
  scale?: { x: number; y: number };
}

// =============================================================================
// Phase 2 ─ History / Undo-Redo Record
// =============================================================================

/**
 * A single entry on the undo/redo stack.
 * Produced by Immer's `produceWithPatches`; applied via `applyPatches`.
 *
 * Test verification:
 *  - `patches`        → forwarded to SceneReconciler.reconcile() after intent routing
 *  - `inversePatches` → forwarded to SceneReconciler.reconcile() on undo/redo
 *  - `timestamp`      → useful for squashing rapid successive operations
 */
export interface HistoryRecord {
  /** RFC 6902 JSON Patch describing the forward change. */
  readonly patches: Patch[];
  /** RFC 6902 JSON Patch describing the reverse (undo) change. */
  readonly inversePatches: Patch[];
  /** Unix ms timestamp of when this record was created. */
  readonly timestamp: number;
}

/**
 * Strategy for routing user intents to manifest mutations.
 */
export interface IIntentRouter {
  /**
   * Routes the given intent to the appropriate manifest mutator.
   * Performs exhaustive check over all persisted EngineIntent types.
   */
  route(
    draft: import('immer').WritableDraft<IProjectManifest>,
    intent: import('./intents.contracts').EngineIntent,
  ): void;
}

/**
 * Manager for undo/redo history stacks and patch application.
 */
export interface IHistoryManager {
  /** Push a new record onto the undo stack; clears the redo stack. */
  push(patches: Patch[], inversePatches: Patch[]): void;

  /** Pops from undo stack and returns the reverted manifest. */
  undo(manifest: IProjectManifest): IProjectManifest | null;

  /** Pops from redo stack and returns the reapplied manifest. */
  redo(manifest: IProjectManifest): IProjectManifest | null;

  /** Returns forward or inverse patches for the last operation (undo/redo). */
  getLastPatches(): Patch[] | null;

  /** Clears all history. */
  clear(): void;

  readonly undoStackSize: number;
  readonly redoStackSize: number;
  getHistory(): { undoStack: HistoryRecord[]; redoStack: HistoryRecord[] };
}

export interface IScene {
  readonly layers: ILayer[];
  width: number;
  height: number;

  add(layer: ILayer): void;
  remove(id: LayerId): void;
  reorder(id: LayerId, targetIndex: number): void;
  getLayerById(id: LayerId): ILayer | undefined;
  setLayers(layers: ILayer[]): void;
  setLayerOrder(layerIds: readonly LayerId[]): void;

  update(time: number, deltaTime: number, getAudioData?: (id: string) => Float32Array): void;
  draw(context: Omit<RenderContext, 'state' | 'sceneRegistry'>): void;
  getActiveMediaLayersReadiness(time: number): MediaReadiness;
  areActiveMediaLayersReady(time: number): boolean;
  subscribe(listener: () => void): () => void;
  hoveredLayerId: LayerId | null;
  notifyListeners(): void;
  dispose(): void;
}

/**
 * The runtime preparation state of the media that is active at a scene time.
 * `failed` is terminal for the current source, whereas `loading` may become
 * ready on a later frame.
 */
export type MediaReadiness = 'ready' | 'loading' | 'failed';

export type EngineConfig = {
  resolution: { width: number; height: number };
  fps: number;
  sampleRate?: number;
};

export const PROJECT_CONFIG = {
  MAX_NAME_LENGTH: 50,
  DEFAULT_NAME: 'Untitled Project',
  INVALID_NAME_CHARS: /[\\/:*?"<>|]/g,
} as const;

export const PROJECT_MANIFEST_VERSION = '1.0' as const;

export interface EncoderConfig {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
}

export interface IExportPipeline {
  prepare(
    config: EncoderConfig,
    resolution: { width: number; height: number },
    device: GPUDevice,
  ): Promise<void>;
  recordFrame(texture: GPUTexture, timestamp: number): Promise<void>;
  finalize(): Promise<void>;
  abort(): Promise<void>;
}
