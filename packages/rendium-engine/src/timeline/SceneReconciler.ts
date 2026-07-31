/**
 * SceneReconciler — Phase 3 Translation Layer
 *
 * Translates Immer JSON Patches (produced by EngineStore dispatchIntent / undo / redo)
 * into concrete mutations on the Scene runtime.
 *
 * Design principles:
 *  1. O(1) layer access — patch paths always carry the layer id
 *     (e.g. `/layers/id_abc/transform/position/x`), so we look up
 *     `scene._registry` directly rather than scanning `_layers`.
 *
 *  2. Minimal side-effects — only the fields mentioned in each patch are
 *     touched.  Transform changes trigger `_recomputeMatrix()`.
 *
 *  3. Ordered re-sync — `layerOrder` patches rebuild `_layers` from the
 *     registry to stay in lock-step with the DTO.
 *
 *  4. Lifecycle safety — `remove` patches call `layer.dispose()` before
 *     de-registering, preventing GPU / Audio resource leaks.
 *
 * Patch path anatomy (normalized IProjectManifest):
 *   /layers/{id}                  → add / remove whole layer
 *   /layers/{id}/startTime        → temporal property
 *   /layers/{id}/duration         → temporal property
 *   /layers/{id}/name             → metadata
 *   /layers/{id}/transform/...    → spatial → triggers _recomputeMatrix
 *   /layers/{id}/appearance/...   → optical
 *   /layers/{id}/source           → source reference
 *   /layers/{id}/control          → control role/params
 *   /layers/{id}/effects          → effect specs
 *   /layers/{id}/roles            → behavior roles
 *   /links                        → relationship metadata
 *   /layerOrder                   → full replace → re-sort _layers
 *   /layerOrder/{index}           → element-level replace → re-sort _layers
 *   /projectInfo                  → identity metadata (runtime no-op)
 *   /projectSettings/canvas/size  → scene canvas dimensions
 *   /projectSettings/*            → global manifest settings (runtime no-op)
 *   /canvasSize/...               → legacy canvas dimensions fallback
 *   /canvasBackgroundColor|watermark|exportRange|workArea → legacy no-op
 */

import type { Patch } from 'immer';
import {
  type ILayerManifest,
  type IProjectManifest,
  type IRenderableLayer,
  IntentValidationError,
  RendiumError,
} from '../_contracts';
import {
  isLayerConfigVector,
  normalizeLayerConfigEntry,
  normalizeLayerConfigPayload,
} from '../_utils/layerConfig';
import type { Scene } from '../core/Scene';
import { normalizeProjectManifest } from '../store/ProjectManifestMigration';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recomputes the local transform matrix for a renderable layer.
 * Called whenever any transform sub-property changes.
 */
function recomputeMatrix(layer: IRenderableLayer): void {
  // RenderableLayer rebuilds the shared pivot-aware local matrix and caches it
  // back into transform._localMatrix.
  if ('getLocalMatrix' in layer && typeof layer.getLocalMatrix === 'function') {
    (layer as { getLocalMatrix: () => Float32Array }).getLocalMatrix();
  }
}

/**
 * Extracts the segment of a patch path array at a given index.
 * Returns undefined if the index is out of bounds.
 */
function seg(path: (string | number)[], index: number): string | number | undefined {
  return path[index];
}

function applyCanvasSizePatch(scene: Scene, value: unknown): void {
  if (!value || typeof value !== 'object') return;

  const size = value as { width?: unknown; height?: unknown };
  if (typeof size.width === 'number') {
    scene.width = size.width;
  }
  if (typeof size.height === 'number') {
    scene.height = size.height;
  }
}

// ---------------------------------------------------------------------------
// SceneReconciler
// ---------------------------------------------------------------------------

/**
 * Translates EngineStore JSON Patches into Scene mutations.
 *
 * Usage:
 *   const reconciler = new SceneReconciler(scene);
 *   engineStore.dispatchIntent(intent);  // → produces patches via EngineStore
 *   reconciler.reconcile(patches); // → updates runtime
 */
export class SceneReconciler {
  /**
   * Whether the last reconcile pass encountered an unrecoverable patch error.
   * Set to true inside the patch loop; reset to false after a successful
   * recoverFromCorruption() run. Never mutated on the normal (happy) path,
   * so it has zero cost for all regular patch applications.
   */
  private _isCorrupted = false;

  /** @internal — exposed exclusively for unit tests. Do not use in app code. */
  public get isCorrupted(): boolean {
    return this._isCorrupted;
  }

  /** @internal — exposed exclusively for unit tests. Do not use in app code. */
  public get scene(): Scene {
    return this._scene;
  }

  /**
   * @param _scene - The live Scene runtime to mutate.
   * @param _manifestGetter - Optional getter for the current manifest,
   *   used when re-syncing layerOrder requires the full DTO.
   */
  constructor(
    private readonly _scene: Scene,
    private readonly _manifestGetter?: () => IProjectManifest,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Apply a batch of Immer patches to the Scene runtime.
   *
   * Patches are processed in order; no rollback is performed on error
   * (consistent with Immer's apply-in-order contract).
   *
   * Special case — full-replace patch ({ op: "replace", path: [] }):
   *   Emitted exclusively by EngineStore.loadManifest(). Triggers a hard
   *   reset: all existing layers are disposed and the scene is rebuilt
   *   fresh from the incoming manifest's layerOrder.
   *
   * @param patches - Forwarded directly from Immer's produceWithPatches.
   */
  public reconcile(patches: Patch[]): void {
    let shouldResyncLayerOrder = false;

    for (const patch of patches) {
      // Hard-reset path: full-replace patch emitted by loadManifest()
      if (
        patch.op === 'replace' &&
        (patch.path.length === 0 || (patch.path.length === 1 && patch.path[0] === ''))
      ) {
        if (!patch.value || typeof patch.value !== 'object') continue;
        let newManifest: IProjectManifest;
        try {
          newManifest = normalizeProjectManifest(patch.value);
        } catch (err) {
          const error =
            err instanceof Error
              ? err
              : new RendiumError(
                  '[SceneReconciler] Invalid full-replace manifest.',
                  'SCENE_RECONCILIATION',
                );
          console.error('[SceneReconciler] Invalid full-replace manifest:', error);
          this._isCorrupted = true;
          continue;
        }
        this._hardReset(newManifest);
        break; // nothing else to process after a full reset
      }

      try {
        if (seg(patch.path, 0) === 'layerOrder') {
          shouldResyncLayerOrder = true;
          continue;
        }
        this._applyPatch(patch);
      } catch (err) {
        // A patch failure means the runtime Scene may now be partially
        // diverged from the manifest — flag as corrupted so the post-loop
        // guard can trigger a full recovery without touching the happy path.
        console.error('[SceneReconciler] Patch error — scene marked corrupted:', patch, err);
        this._isCorrupted = true;
      }
    }

    if (shouldResyncLayerOrder && !this._isCorrupted) {
      try {
        this._resyncLayerOrder();
      } catch (err) {
        console.error('[SceneReconciler] Patch error — scene marked corrupted:', patches, err);
        this._isCorrupted = true;
      }
    }

    // -----------------------------------------------------------------------
    // Post-loop corruption guard
    // Only entered when _isCorrupted was set above; completely skipped on the
    // normal (error-free) path, so O(1) patch performance is unaffected.
    // -----------------------------------------------------------------------
    if (this._isCorrupted) {
      const manifest = this._manifestGetter?.();
      if (manifest) {
        this.recoverFromCorruption(manifest);
      } else {
        console.error(
          '[SceneReconciler] Corruption detected but no manifestGetter available — ' +
            'Scene may be in an inconsistent state. Provide a manifestGetter to enable auto-recovery.',
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Corruption recovery (public) + Hard reset (private, shared implementation)
  // -------------------------------------------------------------------------

  /**
   * Recover the runtime Scene from a corrupted state.
   *
   * Called automatically by `reconcile()` whenever `_isCorrupted` is set.
   * Can also be called manually if external code detects divergence.
   *
   * Recovery steps (all within the same synchronous call — 1 frame budget):
   *  1. Dispose every existing runtime layer to release GPU / Audio memory.
   *  2. Wipe `_layers` + `_registry` via `Scene.setLayers([])`.
   *  3. Re-instantiate all layers from the stable `manifest` in canonical order.
   *  4. Reset `_isCorrupted` to `false` after successful rebuild.
   *
   * @param manifest - The authoritative, stable manifest to rebuild from.
   *   In normal flow this is `EngineStore.getManifest()`, which is always the
   *   last successfully committed state — never the partially-applied one.
   */
  public recoverFromCorruption(manifest: IProjectManifest): void {
    console.warn(
      `[SceneReconciler] Recovering from corruption — rebuilding ${manifest.layerOrder.length} layers.`,
    );
    this._hardReset(manifest);
    this._isCorrupted = false;
  }

  /**
   * Dispose every existing runtime layer and re-instantiate from the manifest.
   *
   * Shared by both `loadManifest()` (normal load) and `recoverFromCorruption()`
   * (error recovery). Keeping a single implementation avoids drift between the
   * two paths.
   *
   * Steps:
   *  1. Dispose all layers (releases GPU / Audio resources).
   *  2. Clear _layers + _registry via Scene.setLayers([]).
   *  3. Iterate manifest.layerOrder and instantiate each layer in order.
   *  4. Trigger async audio loading for AudioLayers (mirrors _handleLayerAdd).
   */
  private _hardReset(manifest: IProjectManifest): void {
    console.info(`[SceneReconciler] Hard reset — rebuilding ${manifest.layerOrder.length} layers.`);

    // Dispose all + clear registry (setLayers([]) calls dispose() on each)
    this._scene.setLayers([]);

    // Update scene dimensions
    this._scene.width = manifest.projectSettings.canvas.size.width;
    this._scene.height = manifest.projectSettings.canvas.size.height;

    // Re-instantiate in canonical layerOrder
    for (const layerId of manifest.layerOrder) {
      const layerManifest = manifest.layers[layerId];
      if (!layerManifest) {
        throw new IntentValidationError(
          'REORDER_LAYER',
          `[SceneReconciler] hardReset: layerOrder references unknown id '${layerId}'.`,
        );
      }

      const layer = this._scene.instantiateLayer(layerManifest);

      // Mirror _handleLayerAdd: kick off async audio loading
      if (layerManifest.kind === 'audio') {
        const audioLayer = layer as {
          initAudio?: () => Promise<void>;
          onMetadataLoad?: () => void;
        };
        const prevMeta = audioLayer.onMetadataLoad;
        audioLayer.onMetadataLoad = () => {
          prevMeta?.();
          this._scene.notifyListeners();
        };
        audioLayer.initAudio?.().catch((err: Error) => {
          console.error(`[SceneReconciler] Audio init failed for '${layerId}':`, err);
        });
      }
    }

    this._scene.notifyListeners();
  }

  // -------------------------------------------------------------------------
  // Patch routing
  // -------------------------------------------------------------------------

  private _applyPatch(patch: Patch): void {
    const { op, path } = patch;
    const pathHead = seg(path, 0);

    // ------------------------------------------------------------------
    // Route: /layerOrder or /layerOrder/{index}
    // ------------------------------------------------------------------
    if (pathHead === 'layerOrder') {
      this._resyncLayerOrder();
      return;
    }

    if (pathHead === 'links') {
      return;
    }

    // ------------------------------------------------------------------
    // Route: /projectInfo or /projectSettings/...
    // ------------------------------------------------------------------
    if (pathHead === 'projectInfo') {
      return;
    }

    if (pathHead === 'projectSettings') {
      const section = seg(path, 1);

      if (section === 'canvas') {
        const field = seg(path, 2);
        if (field === 'size') {
          const sizeField = seg(path, 3);
          if (sizeField === 'width' && typeof patch.value === 'number') {
            this._scene.width = patch.value;
          } else if (sizeField === 'height' && typeof patch.value === 'number') {
            this._scene.height = patch.value;
          } else {
            applyCanvasSizePatch(this._scene, patch.value);
          }
        }
      }

      return;
    }

    // ------------------------------------------------------------------
    // Route: /canvasSize/{field} (legacy fallback)
    // ------------------------------------------------------------------
    if (pathHead === 'canvasSize') {
      const field = seg(path, 1);
      if (field === 'width' && typeof patch.value === 'number') {
        this._scene.width = patch.value;
      } else if (field === 'height' && typeof patch.value === 'number') {
        this._scene.height = patch.value;
      } else {
        applyCanvasSizePatch(this._scene, patch.value);
      }
      return;
    }

    if (
      pathHead === 'canvasBackgroundColor' ||
      pathHead === 'watermark' ||
      pathHead === 'exportRange' ||
      pathHead === 'workArea' ||
      pathHead === 'meta'
    ) {
      return;
    }

    // ------------------------------------------------------------------
    // Route: /layers/{id}/...
    // ------------------------------------------------------------------
    if (pathHead !== 'layers') return;

    const layerId = seg(path, 1);
    if (typeof layerId !== 'string') return;

    const subPath = path.slice(2); // everything after /layers/{id}

    // --- add whole layer ---
    if (op === 'add' && subPath.length === 0) {
      const normalized = normalizeProjectManifest({
        layers: { [layerId]: patch.value },
        layerOrder: [layerId],
      });
      const manifest = normalized.layers[layerId];
      if (!manifest) return;
      this._handleLayerAdd(manifest);
      return;
    }

    // --- remove whole layer ---
    if (op === 'remove' && subPath.length === 0) {
      this._handleLayerRemove(layerId);
      return;
    }

    // --- replace / modify a property on an existing layer ---
    if (subPath.length > 0) {
      this._handleLayerPropertyChange(layerId, subPath, patch.value);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Layer lifecycle handlers
  // -------------------------------------------------------------------------

  /**
   * Instantiate a new layer from a manifest DTO and insert it into the Scene.
   * Uses Scene.instantiateLayer() which handles _registry + _layers + notify.
   */
  private _handleLayerAdd(manifest: ILayerManifest): void {
    // Guard: do not double-instantiate if already present (idempotency)
    if (this._scene.getLayerById(manifest.id)) {
      throw new IntentValidationError(
        'ADD_LAYER',
        `Layer '${manifest.id}' already exists in scene.`,
      );
    }

    const layer = this._scene.instantiateLayer(manifest);

    // Special post-instantiation: kick off audio loading for AudioLayer
    if (manifest.kind === 'audio') {
      const audioLayer = layer as {
        initAudio?: () => Promise<void>;
        onMetadataLoad?: () => void;
      };

      // Wire metadata callback so duration clamping / UI sync fires after load
      const prevMeta = audioLayer.onMetadataLoad;
      audioLayer.onMetadataLoad = () => {
        prevMeta?.();
        this._scene.notifyListeners();
      };

      audioLayer.initAudio?.().catch((err: Error) => {
        console.error(`[SceneReconciler] Audio init failed for '${manifest.id}':`, err);
      });
    }
  }

  /**
   * Dispose and deregister a layer from the Scene.
   * The layer's dispose() releases GPU / Audio resources.
   */
  private _handleLayerRemove(layerId: string): void {
    const layer = this._scene.getLayerById(layerId);
    if (!layer) {
      // The runtime can occasionally drift behind the manifest during recovery.
      // In that case, treating the remove as an idempotent no-op keeps the
      // reconciler from marking the whole scene corrupted for a harmless delete.
      console.warn(
        `[SceneReconciler] REMOVE_LAYER skipped for missing runtime layer '${layerId}'.`,
      );
      this._scene.remove(layerId);
      return;
    }

    // Guard: never allow removal of the project anchor layer
    if (layer.isProjectAnchor) {
      console.error(
        `[SceneReconciler] SSOT Guard: Cannot remove project anchor layer '${layerId}'.`,
      );
      return;
    }

    // Scene.remove() calls layer.dispose() and updates _layers + _registry
    this._scene.remove(layerId);
  }

  // -------------------------------------------------------------------------
  // Property-level patch handler
  // -------------------------------------------------------------------------

  /**
   * Apply a sub-property change to an existing runtime layer.
   *
   * @param layerId  - O(1) looked up from Scene._registry.
   * @param subPath  - Path segments after /layers/{id}/
   * @param value    - The new value from the patch.
   */
  private _handleLayerPropertyChange(
    layerId: string,
    subPath: (string | number)[],
    value: unknown,
  ): void {
    // O(1) registry lookup — no array scan
    const layer = this._scene.getLayerById(layerId);
    if (!layer) {
      const intentType =
        subPath[0] === 'transform'
          ? 'UPDATE_TRANSFORM'
          : subPath[0] === 'appearance'
            ? 'TOGGLE_VISIBILITY'
            : 'UPDATE_LAYER_PROPS';
      throw new IntentValidationError(
        intentType,
        `Layer '${layerId}' not found for property update.`,
      );
    }

    const section = seg(subPath, 0);

    // -------- /layers/{id}/startTime | duration | name --------
    if (section === 'startTime' && typeof value === 'number') {
      layer.startTime = value;
      return;
    }
    if (section === 'duration' && typeof value === 'number') {
      layer.duration = value;
      return;
    }
    if (section === 'name' && (typeof value === 'string' || value === undefined)) {
      if (value === undefined) {
        // biome-ignore lint/performance/noDelete: Required by exactOptionalPropertyTypes: true in tsconfig
        delete layer.name;
      } else {
        layer.name = value;
      }
      return;
    }

    // -------- /layers/{id}/transform/... --------
    if (section === 'transform') {
      this._applyTransformPatch(layer, subPath.slice(1), value);
      return;
    }

    // -------- /layers/{id}/appearance/... --------
    if (section === 'appearance') {
      this._applyAppearancePatch(layer, subPath.slice(1), value);
      return;
    }

    // -------- /layers/{id}/source --------
    if (section === 'source') {
      this._applySourcePatch(layer, subPath.slice(1), value);
      return;
    }

    // -------- /layers/{id}/control --------
    if (section === 'control') {
      this._applyControlPatch(layer, subPath.slice(1), value);
      return;
    }

    if (section === 'effects' || section === 'roles' || section === 'kind') return;

    // ------------------------------------------------------------------
    // Route: flat layer fields (/layers/{id}/fontSize, /opacity, /color, ...)
    // ------------------------------------------------------------------
    if (typeof section === 'string') {
      layer.updateConfig(normalizeLayerConfigEntry(section, value, `layers.${layerId}`));
    }
  }

  private _applySourcePatch(
    layer: ReturnType<Scene['getLayerById']>,
    subPath: (string | number)[],
    value: unknown,
  ): void {
    if (!layer) return;

    if (subPath.length === 0 && value && typeof value === 'object') {
      const source = value as { clipOffset?: unknown; params?: unknown };
      if (typeof source.clipOffset === 'number') {
        layer.updateConfig({ clipOffset: source.clipOffset });
      }
      if (source.params && typeof source.params === 'object') {
        layer.updateConfig(normalizeLayerConfigPayload(source.params, 'source.params'));
      }
      return;
    }

    const field = seg(subPath, 0);
    if (field === 'clipOffset' && typeof value === 'number') {
      layer.updateConfig({ clipOffset: value });
    } else if (field === 'params') {
      if (subPath.length === 1 && value && typeof value === 'object') {
        layer.updateConfig(normalizeLayerConfigPayload(value, 'source.params'));
        return;
      }
      const key = seg(subPath, 1);
      if (typeof key === 'string') {
        layer.updateConfig(normalizeLayerConfigEntry(key, value, 'source.params'));
      }
    }
  }

  private _applyControlPatch(
    layer: ReturnType<Scene['getLayerById']>,
    subPath: (string | number)[],
    value: unknown,
  ): void {
    if (!layer) return;

    if (subPath.length === 0 && value && typeof value === 'object') {
      const control = value as { params?: Record<string, unknown> };
      layer.updateConfig(normalizeLayerConfigPayload(control.params ?? {}, 'control.params'));
      return;
    }

    const section = seg(subPath, 0);
    if (section === 'params') {
      if (subPath.length === 1 && value && typeof value === 'object') {
        layer.updateConfig(normalizeLayerConfigPayload(value, 'control.params'));
        return;
      }
      const key = seg(subPath, 1);
      if (typeof key === 'string') {
        layer.updateConfig(normalizeLayerConfigEntry(key, value, 'control.params'));
      }
    }
  }

  // -------------------------------------------------------------------------
  // Transform patch
  // -------------------------------------------------------------------------

  /**
   * Apply a transform sub-patch and trigger matrix recomputation.
   * Only renderable layers carry ITransform; non-renderable layers
   * are silently skipped.
   *
   * Examples of subPath values:
   *   ["position", "x"]
   *   ["scale", "y"]
   *   ["rotation"]
   */
  private _applyTransformPatch(
    layer: ReturnType<Scene['getLayerById']>,
    subPath: (string | number)[],
    value: unknown,
  ): void {
    if (!layer) return;
    if (subPath.length === 0 && typeof value === 'object' && value !== null) {
      layer.updateConfig(normalizeLayerConfigPayload(value, 'transform'));
      const renderable = layer as Partial<IRenderableLayer>;
      if (!renderable.transform) return;
      recomputeMatrix(renderable as IRenderableLayer);
      return;
    }

    const field = seg(subPath, 0);
    const axis = seg(subPath, 1);

    if (field === 'rotation' && typeof value === 'number') {
      layer.updateConfig({ rotation: value });
    } else if (
      (field === 'position' || field === 'scale') &&
      (axis === 'x' || axis === 'y') &&
      typeof value === 'number'
    ) {
      layer.updateConfig({
        [field]: {
          [axis]: value,
        },
      });
    } else if (
      (field === 'position' || field === 'scale') &&
      subPath.length === 1 &&
      isLayerConfigVector(value)
    ) {
      layer.updateConfig({
        [field]: value,
      });
    }

    // Always recompute the local matrix after any transform change.
    const renderable = layer as Partial<IRenderableLayer>;
    if (!renderable.transform) return;
    recomputeMatrix(renderable as IRenderableLayer);
  }

  // -------------------------------------------------------------------------
  // Appearance patch
  // -------------------------------------------------------------------------

  /**
   * Apply an appearance sub-patch.
   * Examples of subPath values:
   *   ["visible"]
   *   ["opacity"]
   */
  private _applyAppearancePatch(
    layer: ReturnType<Scene['getLayerById']>,
    subPath: (string | number)[],
    value: unknown,
  ): void {
    if (!layer) return;
    if (subPath.length === 0 && typeof value === 'object' && value !== null) {
      layer.updateConfig(normalizeLayerConfigPayload(value, 'appearance'));
      return;
    }

    const field = seg(subPath, 0);
    if (field === 'visible' && typeof value === 'boolean') {
      layer.updateConfig({ visible: value });
    } else if (field === 'opacity' && typeof value === 'number') {
      layer.updateConfig({ opacity: value });
    }
  }

  // -------------------------------------------------------------------------
  // layerOrder re-sync
  // -------------------------------------------------------------------------

  /**
   * Rebuild Scene._layers to match the DTO's layerOrder.
   *
   * Strategy:
   *  1. Obtain the authoritative layerOrder from the manifest (requires a
   *     manifest getter) OR fall back to the order already in _registry.
   *  2. Map each id to its live runtime instance via _registry (O(1)).
   *  3. Replace _layers in-place without disposing any instances.
   *
   * This is called for BOTH full-array replacements (/layerOrder) and
   * element-level replacements (/layerOrder/2) because both indicate
   * that the canonical order has changed.
   */
  private _resyncLayerOrder(): void {
    let newOrder: string[];

    if (this._manifestGetter) {
      // Authoritative path: read the freshly-updated manifest.
      newOrder = this._manifestGetter().layerOrder;
    } else {
      // Fallback: preserve existing scene order (reconciler is operating
      // without manifest access — this is the degraded mode).
      console.warn('[SceneReconciler] No manifestGetter provided; layerOrder sync skipped.');
      return;
    }

    // Reorder existing runtime instances without disposing them.
    this._scene.setLayerOrder(newOrder);
  }
}
