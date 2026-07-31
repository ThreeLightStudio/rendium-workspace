import type { Patch } from 'immer';
import { enablePatches, produceWithPatches } from 'immer';
import type {
  EngineIntent,
  HistoryRecord,
  IHistoryManager,
  IIntentRouter,
  ILayer,
  ILayerManifest,
  IProjectManifest,
  IScene,
  JsonValue,
  LayerConfig,
  LayerId,
  TransientIntent,
} from '../_contracts';
import {
  IntentValidationError,
  RendiumError,
  TransactionError,
  isEngineIntent,
  isNonPersistedIntent,
} from '../_contracts';
import { PROJECT_MANIFEST_VERSION } from '../_contracts';
import { Scene } from '../core/Scene';
import { initConsoleDebugger } from '../debug/ConsoleDebugger';
import { SceneInitializer } from '../timeline/SceneInitializer';
import { SceneReconciler } from '../timeline/SceneReconciler';
import { EngineSelectors, type EngineSnapshot } from './EngineSelectors';
import { HistoryManager } from './HistoryManager';
import { IntentRouter } from './IntentRouter';
import { ProjectFactory } from './ProjectFactory';
import {
  createDefaultProjectInfo,
  createDefaultProjectSettings,
  normalizeProjectManifest,
  resolveProjectInfo,
  resolveProjectSettings,
} from './ProjectManifestMigration';

// Immer requires this call once before produceWithPatches is used.
enablePatches();

// ---------------------------------------------------------------------------
// Helper: bootstrap manifest from an existing Scene
// ---------------------------------------------------------------------------

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
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

function extractSourceParams(config: LayerConfig): Record<string, JsonValue> | undefined {
  const params: Record<string, JsonValue> = {};

  for (const key of SOURCE_PARAM_KEYS) {
    const value = config[key];
    if (value !== undefined && isJsonValue(value)) {
      params[key] = structuredClone(value);
    }
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * Builds the initial IProjectManifest from a Scene that has already been
 * bootstrapped via SceneInitializer.
 */
function manifestFromScene(scene: IScene, existing?: IProjectManifest): IProjectManifest {
  const layers: Record<LayerId, ILayerManifest> = {};
  const layerOrder: LayerId[] = [];

  for (const layer of scene.layers) {
    const cfg = layer.getConfig();
    const { id, kind, startTime, duration, isProjectAnchor, name, scopeRole } = cfg;
    if (!id || !kind) continue;
    const existingLayer = existing?.layers[id];

    const transform =
      cfg.position || cfg.scale || cfg.rotation !== undefined
        ? {
            position: cfg.position ?? { x: 0, y: 0 },
            scale: cfg.scale ?? { x: 1, y: 1 },
            rotation: cfg.rotation ?? 0,
          }
        : undefined;

    const appearance =
      cfg.opacity !== undefined || cfg.visible !== undefined
        ? {
            visible: cfg.visible ?? true,
            opacity: cfg.opacity ?? 1,
          }
        : undefined;

    const control =
      layer.kind === 'control'
        ? {
            role: cfg.targetScopeId !== undefined ? ('scopeEnd' as const) : ('scopeStart' as const),
            ...(cfg.targetScopeId !== undefined ? { targetScopeId: cfg.targetScopeId } : {}),
            params: {
              ...(isProjectAnchor !== undefined ? { isProjectAnchor } : {}),
              ...(cfg.isSystem !== undefined ? { isSystem: cfg.isSystem } : {}),
              ...(scopeRole !== undefined ? { scopeRole } : {}),
              ...(cfg.ruleType !== undefined ? { ruleType: cfg.ruleType } : {}),
            },
          }
        : undefined;
    const sourceParams = extractSourceParams(cfg);
    const source =
      existingLayer?.source || sourceParams
        ? {
            ...(existingLayer?.source ?? { sourceId: `runtime:${id}` }),
            ...(sourceParams ? { params: sourceParams } : {}),
          }
        : undefined;

    layers[id] = {
      id,
      kind,
      ...(name !== undefined ? { name } : {}),
      startTime: startTime ?? 0,
      duration: duration ?? 0,
      ...(transform !== undefined ? { transform } : {}),
      ...(appearance !== undefined ? { appearance } : {}),
      ...(source !== undefined ? { source } : {}),
      ...(control !== undefined ? { control } : {}),
    };
    layerOrder.push(id);
  }

  const projectInfo = existing ? resolveProjectInfo(existing) : createDefaultProjectInfo();
  const projectSettings = existing
    ? resolveProjectSettings(existing)
    : createDefaultProjectSettings({ width: scene.width, height: scene.height });
  projectSettings.canvas.size = { width: scene.width, height: scene.height };

  const manifest: IProjectManifest = {
    version: PROJECT_MANIFEST_VERSION,
    projectInfo,
    projectSettings,
    layers,
    layerOrder,
    links: existing?.links ?? {},
  };

  return manifest;
}

function cloneManifestSnapshot(manifest: IProjectManifest): IProjectManifest {
  return structuredClone(manifest);
}

// ---------------------------------------------------------------------------
// EngineStore
// ---------------------------------------------------------------------------

/**
 * EngineStore — bridge between React UI and the Rendium rendering engine.
 *
 * Refactored (Phase 1+2):
 *  - Decomposed into HistoryManager, IntentRouter, and EngineSelectors.
 */
class EngineStore {
  private _manifest: IProjectManifest;
  private _scene: Scene;
  private _reconciler: SceneReconciler;
  private _history: IHistoryManager;
  private _router: IIntentRouter;
  private _isSynchronizingScene = false;
  private _isNotifyingFromStore = false;

  private _snapshot: EngineSnapshot;
  private _pxPerSec = EngineSelectors.DEFAULT_PX_PER_SEC;
  public hoveredLayerId: string | null = null;
  private _patchListeners = new Set<(patches: Patch[]) => void>();
  /** Subscribers notified whenever a RendiumError escapes the engine. */
  private _errorListeners = new Set<(err: RendiumError) => void>();

  // -------------------------------------------------------------------------
  // Transaction state
  // -------------------------------------------------------------------------
  /** Whether a transaction is currently open. */
  private _txActive = false;
  /** Manifest snapshot captured at startTransaction() for rollback. */
  private _txBaseManifest: IProjectManifest | null = null;
  /** Forward patches accumulated since startTransaction(). */
  private _txPatches: Patch[] = [];
  /** Inverse patches accumulated since startTransaction() (in reverse order). */
  private _txInversePatches: Patch[] = [];

  constructor() {
    // --- Services ---
    this._history = new HistoryManager();
    this._router = new IntentRouter();

    // --- Bootstrap Scene ---
    this._scene = new Scene();
    SceneInitializer.bootstrap(this._scene);
    initConsoleDebugger();

    // --- State ---
    this._manifest = manifestFromScene(this._scene);
    this._reconciler = new SceneReconciler(this._scene, () => this._manifest);

    // --- UI Sync ---
    this._snapshot = this._buildSnapshot();
    this._scene.subscribe(() => {
      if (this._isSynchronizingScene || this._isNotifyingFromStore) {
        return;
      }
      this._manifest = manifestFromScene(this._scene, this._manifest);
      this._updateSnapshot();
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private _buildSnapshot(): EngineSnapshot {
    return EngineSelectors.buildSnapshot(
      this._scene,
      this.hoveredLayerId,
      this._pxPerSec,
      this._history.undoStackSize,
      this._history.redoStackSize,
    );
  }

  private _updateSnapshot(): void {
    this._snapshot = this._buildSnapshot();
  }

  private _notifyListeners(): void {
    this._updateSnapshot();
    this._isNotifyingFromStore = true;
    try {
      this._scene.notifyListeners();
    } finally {
      this._isNotifyingFromStore = false;
    }
  }

  private _reconcileScene(patches: Patch[]): void {
    this._isSynchronizingScene = true;
    try {
      this._reconciler.reconcile(patches);
    } finally {
      this._isSynchronizingScene = false;
    }
  }

  // -------------------------------------------------------------------------
  // Manifest mutation pipeline
  // -------------------------------------------------------------------------

  /**
   * Applies a manifest mutation recipe directly (Immer-based).
   *
   * When a transaction is active the resulting patches are buffered rather
   * than immediately committed to the HistoryManager.
   */
  private _applyManifestRecipe = (recipe: (draft: IProjectManifest) => void): void => {
    const [nextManifest, patches, inversePatches] = produceWithPatches(this._manifest, recipe);

    if (patches.length === 0) return;

    this._manifest = nextManifest;

    if (this._txActive) {
      // Buffer patches — do NOT push to history yet.
      this._txPatches.push(...patches);
      // Inverse patches must be prepended so that the combined inverse
      // undoes operations in the correct reverse order.
      this._txInversePatches.unshift(...inversePatches);
    } else {
      this._history.push(patches, inversePatches);
    }

    this._reconcileScene(patches);
    this._notifyPatchListeners(patches);
    this._notifyListeners();
  };

  /**
   * Dispatch a user intent (Recommended entry point).
   * When inside a transaction, routing errors trigger an automatic rollback.
   */
  public dispatchIntent = (input: unknown): void => {
    if (!isEngineIntent(input)) {
      throw new IntentValidationError(
        'UNKNOWN_INTENT',
        'Invalid engine intent payload. Expected a known intent object.',
      );
    }

    const intent: EngineIntent = input;

    if (isNonPersistedIntent(intent)) {
      this._handleNonPersisted(intent);
      return;
    }

    try {
      // Persisted intents go through the IntentRouter + manifest patch pipeline
      this._applyManifestRecipe((draft) => this._router.route(draft, intent));
    } catch (err) {
      if (this._txActive) {
        // An error inside a transaction must roll back the entire transaction.
        // rollbackTransaction() will emit the TransactionError itself before
        // re-throwing, so we don't call _emitError here to avoid double-emit.
        this.rollbackTransaction(err instanceof Error ? err : new Error(String(err)));
      }
      // Emit non-transaction errors (e.g. IntentValidationError) to UI bridge.
      if (err instanceof RendiumError) {
        this._emitError(err);
      }
      throw err;
    }
  };

  /**
   * Executes a batch of persisted intents inside a single transaction.
   *
   * If a transaction is already active, the intents are dispatched into the
   * existing transaction so callers can compose nested orchestration safely.
   * This stays separate from `dispatchIntent()` so the default one-intent path
   * remains simple while batch callers get explicit atomic + undo semantics.
   */
  public executeAtomicIntentBatch = (intents: EngineIntent[]): void => {
    if (intents.length === 0) return;

    const startedHere = !this._txActive;
    if (startedHere) {
      this.startTransaction();
    }

    try {
      for (const intent of intents) {
        this.dispatchIntent(intent);
      }

      if (startedHere) {
        this.commitTransaction();
      }
    } catch (error) {
      if (startedHere && this._txActive) {
        this.rollbackTransaction(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  };

  /**
   * Dispatch a transient (non-persisted) intent for 60 FPS drag preview.
   */
  public dispatchTransient = (intent: TransientIntent): void => {
    switch (intent.type) {
      case 'TRANSIENT_LAYER_UPDATE':
        this._applyTransient(intent.layerId, intent.partial);
        break;
    }
    this._notifyListeners();
  };

  private _handleNonPersisted(intent: Extract<EngineIntent, { type: 'HOVER_LAYER' }>): void {
    this.hoveredLayerId = intent.layerId;
    this._scene.hoveredLayerId = intent.layerId;
    this._notifyListeners();
  }

  // -------------------------------------------------------------------------
  // Transaction API
  // -------------------------------------------------------------------------

  /**
   * Opens an atomic transaction.
   *
   * After calling this, every `dispatchIntent` call will buffer its patches
   * without pushing them to `HistoryManager`. The manifest is still updated
   * in-memory so subsequent intents see a consistent state.
   *
   * Must be paired with either `commitTransaction()` or `rollbackTransaction()`.
   *
   * @throws If a transaction is already active.
   */
  public startTransaction = (): void => {
    if (this._txActive) {
      throw new TransactionError(
        'startTransaction() called while a transaction is already active. ' +
          'Call commitTransaction() or rollbackTransaction() first.',
      );
    }
    this._txActive = true;
    this._txBaseManifest = this._manifest;
    this._txPatches = [];
    this._txInversePatches = [];
  };

  /**
   * Commits the open transaction.
   *
   * Merges all buffered patches into a **single** HistoryRecord and pushes it
   * to `HistoryManager`, so the entire transaction counts as one Undo step.
   *
   * @throws If no transaction is active.
   */
  public commitTransaction = (): void => {
    if (!this._txActive) {
      throw new TransactionError('commitTransaction() called with no active transaction.');
    }

    if (this._txPatches.length > 0) {
      // Merge all buffered patches into a single history entry.
      this._history.push(this._txPatches, this._txInversePatches);
    }

    this._txActive = false;
    this._txBaseManifest = null;
    this._txPatches = [];
    this._txInversePatches = [];
  };

  /**
   * Rolls back the open transaction.
   *
   * Reverts `_manifest` to the snapshot taken at `startTransaction()` by
   * applying the accumulated inverse patches via Immer. The reconciler is
   * notified so the render scene stays in sync. Throws a `TransactionError`
   * (wrapping the original cause) to propagate failure to the calling Macro.
   *
   * @param cause - The original error that triggered the rollback.
   * @throws TransactionError always, after state restoration is complete.
   */
  public rollbackTransaction = (cause: Error): never => {
    if (!this._txActive) {
      throw new TransactionError('rollbackTransaction() called with no active transaction.', {
        cause,
      });
    }

    const base = this._txBaseManifest;

    // Reset transaction state first to prevent re-entrant rollbacks.
    this._txActive = false;
    this._txBaseManifest = null;
    this._txPatches = [];
    this._txInversePatches = [];

    if (base !== null && base !== this._manifest) {
      // Restore manifest to pre-transaction snapshot.
      this._manifest = base;

      // Notify reconciler and listeners so the render scene stays in sync.
      const rollbackPatch: import('immer').Patch = {
        op: 'replace',
        path: [],
        value: base,
      };
      this._reconcileScene([rollbackPatch]);
      this._notifyPatchListeners([rollbackPatch]);
      this._notifyListeners();
    }

    const txError = new TransactionError(cause.message, { cause });
    this._emitError(txError);
    throw txError;
  };

  // -------------------------------------------------------------------------
  // History API
  // -------------------------------------------------------------------------

  public undo = (): void => {
    const nextManifest = this._history.undo(this._manifest);
    if (!nextManifest) return;

    const patches = this._history.getLastPatches();
    this._manifest = nextManifest;

    if (patches) {
      this._reconcileScene(patches);
      this._notifyPatchListeners(patches);
    }
    this._notifyListeners();
  };

  public redo = (): void => {
    const nextManifest = this._history.redo(this._manifest);
    if (!nextManifest) return;

    const patches = this._history.getLastPatches();
    this._manifest = nextManifest;

    if (patches) {
      this._reconcileScene(patches);
      this._notifyPatchListeners(patches);
    }
    this._notifyListeners();
  };

  // -------------------------------------------------------------------------
  // Transient & Maintenance API
  // -------------------------------------------------------------------------

  private _applyTransient = (layerId: LayerId, partial: Partial<LayerConfig>): void => {
    const layer = this._scene.getLayerById(layerId);
    if (layer) {
      layer.updateConfig(partial);
    }
  };

  public loadManifest = (newManifest: unknown): void => {
    this._manifest = normalizeProjectManifest(newManifest);
    this._history.clear();

    const rootPatch: Patch = { op: 'replace', path: [], value: this._manifest };
    this._reconcileScene([rootPatch]);

    this._notifyPatchListeners([rootPatch]);
    this._notifyListeners();
  };

  public setPxPerSec = (pxPerSec: number): void => {
    if (!Number.isFinite(pxPerSec)) return;
    this._pxPerSec = Math.max(0.1, pxPerSec);
    this._notifyListeners();
  };

  public createBlankProject = (
    input: {
      readonly name?: string;
      readonly width?: number;
      readonly height?: number;
    } = {},
  ): IProjectManifest => {
    const newManifest = ProjectFactory.createBlankManifest(input);
    this.loadManifest(newManifest);
    return newManifest;
  };

  public subscribePatches = (listener: (patches: Patch[]) => void): (() => void) => {
    this._patchListeners.add(listener);
    return () => this._patchListeners.delete(listener);
  };

  private _notifyPatchListeners(patches: Patch[]): void {
    for (const listener of this._patchListeners) {
      listener(patches);
    }
  }

  // -------------------------------------------------------------------------
  // Error Pub/Sub API
  // -------------------------------------------------------------------------

  /**
   * Subscribe to engine-level errors.
   *
   * The callback is invoked synchronously whenever a `RendiumError` escapes
   * `dispatchIntent` or `rollbackTransaction`. Errors are also re-thrown so
   * existing try/catch callers continue to work.
   *
   * @returns An unsubscribe function — call it in useEffect cleanup.
   *
   * @example
   * ```ts
   * const unsub = engineStore.onError((err) => toast.error(err.message));
   * return () => unsub();
   * ```
   */
  public onError = (listener: (err: RendiumError) => void): (() => void) => {
    this._errorListeners.add(listener);
    return () => this._errorListeners.delete(listener);
  };

  private _emitError(err: RendiumError): void {
    for (const listener of this._errorListeners) {
      try {
        listener(err);
      } catch (listenerErr) {
        // Never let a broken UI listener crash the engine.
        console.error('[EngineStore] onError listener threw:', listenerErr);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  public getManifest = (): Readonly<IProjectManifest> => cloneManifestSnapshot(this._manifest);

  public get undoStackSize(): number {
    return this._history.undoStackSize;
  }

  public get redoStackSize(): number {
    return this._history.redoStackSize;
  }

  public getHistory = (): { undoStack: HistoryRecord[]; redoStack: HistoryRecord[] } =>
    this._history.getHistory();

  public getSnapshot = (): typeof this._snapshot => this._snapshot;

  public subscribe = (listener: () => void): (() => void) => this._scene.subscribe(listener);

  public getLayerById = (id: LayerId): ILayer | undefined => this._scene.getLayerById(id);

  /**
   * Converts the current scene to IProjectManifest for persistence.
   */
  public toManifest = (): Readonly<IProjectManifest> => cloneManifestSnapshot(this._manifest);

  /**
   * Internal access for the rendering hook (apps/desktop-studio).
   * Prefixed with '_' as a usage warning — do not use in application logic.
   */
  public get _internalScene(): IScene {
    return this._scene;
  }
}

// Singleton — shared across the entire application.
export const engineStore = new EngineStore();
