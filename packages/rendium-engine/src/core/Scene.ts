import type {
  ILayer,
  ILayerManifest,
  IRenderableLayer,
  IScene,
  IScopeStartLayer,
  LayerId,
  MediaReadiness,
  RenderContext,
} from '../_contracts';
import { SCENE_CONFIG } from '../_contracts';
import { normalizeLayerConfigPayload } from '../_utils/layerConfig';
import { RuntimeLayerFactory } from '../layers/factories';
import { StateStack } from './StateStack';

/**
 * Type guard: checks if a layer is a RenderableLayer (has draw + appearance).
 */
function isRenderable(layer: ILayer): layer is IRenderableLayer {
  return 'draw' in layer && 'appearance' in layer;
}

function isAudioReady(layer: ILayer): boolean {
  if (layer.kind !== 'audio') return true;
  return (layer as { isSetup?: boolean }).isSetup === true;
}

function getAudioMediaReadiness(layer: ILayer): MediaReadiness {
  const readiness = (layer as ILayer & { mediaReadiness?: MediaReadiness }).mediaReadiness;
  return readiness ?? (isAudioReady(layer) ? 'ready' : 'loading');
}

function getRenderableMediaReadiness(layer: IRenderableLayer): MediaReadiness {
  const readiness = (layer as IRenderableLayer & { mediaReadiness?: MediaReadiness })
    .mediaReadiness;
  return readiness ?? (layer.isReady ? 'ready' : 'loading');
}

function isScopeStartLayer(layer: ILayer): layer is IScopeStartLayer {
  return layer.kind === 'control' && 'matrix' in layer && 'stackOpacity' in layer;
}

function isScopeEndLayer(layer: ILayer): boolean {
  return layer.kind === 'control' && 'targetScopeId' in layer;
}

function getLayerLocalTime(scopeLocalTime: number, layer: ILayer): number {
  return scopeLocalTime - layer.startTime;
}

function isLayerTemporallyActive(scopeLocalTime: number, layer: ILayer): boolean {
  const localTime = getLayerLocalTime(scopeLocalTime, layer);
  return layer.duration <= 0 || (localTime >= 0 && localTime < layer.duration);
}

/**
 * Standard implementation of IScene with stack-based rendering support.
 * Follows 'Unified Flat Architecture' (1D array order = rendering order).
 *
 * Scene.update() — updates ALL temporally-active layers regardless of visibility.
 * Scene.draw()   — only renders timeline content. Background is handled by
 *                  the renderer's render-pass clear color, sourced from
 *                  `manifest.projectSettings.canvas.backgroundColor`, not as
 *                  drawable content.
 */
export class Scene implements IScene {
  private _layers: ILayer[] = [];
  private _registry: Map<string, ILayer> = new Map();
  private _stateStack = new StateStack();
  private _listeners = new Set<() => void>();
  public hoveredLayerId: LayerId | null = null;
  public width: number = SCENE_CONFIG.DEFAULT_RESOLUTION.width;
  public height: number = SCENE_CONFIG.DEFAULT_RESOLUTION.height;

  public subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  public notifyListeners(): void {
    for (const listener of this._listeners) {
      listener();
    }
  }

  public get layers(): ILayer[] {
    return this._layers;
  }

  public add(layer: ILayer): void {
    const insertionIndex = this._findInsertionIndex();
    this._layers.splice(insertionIndex, 0, layer);
    this._registry.set(layer.id, layer);
    this.notifyListeners();
  }

  /**
   * Finds the correct insertion index for new layers.
   * Searches backwards to find the terminal scaffold marker,
   * ensuring new layers are inserted before it to stay within bounds.
   */
  private _findInsertionIndex(): number {
    for (let i = this._layers.length - 1; i >= 0; i--) {
      const layer = this._layers[i];
      if (layer && isScopeEndLayer(layer) && layer.isProjectAnchor === true) {
        return i;
      }
    }
    // Fallback: no terminal scaffold marker found, append to end
    return this._layers.length;
  }

  public remove(id: LayerId): void {
    const index = this._layers.findIndex((l) => l.id === id);
    if (index !== -1) {
      const layerToRemove = this._layers[index];
      if (!layerToRemove) return;

      const newLayers = [...this._layers];

      // If it's a scope:start, find and remove matching scope:end too
      if (isScopeStartLayer(layerToRemove)) {
        let depth = 0;
        let endIndex = -1;
        for (let i = index; i < newLayers.length; i++) {
          const l = newLayers[i];
          if (!l) break;
          if (isScopeStartLayer(l)) depth++;
          else if (isScopeEndLayer(l)) depth--;

          if (depth === 0) {
            endIndex = i;
            break;
          }
        }

        if (endIndex !== -1) {
          // Remove end first to avoid index shift issues
          const endLayer = newLayers[endIndex];
          if (endLayer) {
            endLayer.dispose();
            this._registry.delete(endLayer.id);
          }
          newLayers.splice(endIndex, 1);
        }
      }

      layerToRemove.dispose();
      this._registry.delete(id);
      newLayers.splice(index, 1);
      this._layers = newLayers;
      this.notifyListeners();
    }
  }

  public reorder(id: LayerId, targetIndex: number): void {
    const index = this._layers.findIndex((l) => l.id === id);
    if (index === -1) return;

    const layer = this._layers[index];
    if (!layer) return;

    let count = 1;

    // If it's a scope:start, we must move the entire block until scope:end
    if (isScopeStartLayer(layer)) {
      let depth = 0;
      for (let i = index; i < this._layers.length; i++) {
        const l = this._layers[i];
        if (!l) break;

        if (isScopeStartLayer(l)) depth++;
        else if (isScopeEndLayer(l)) depth--;

        if (depth === 0) {
          count = i - index + 1;
          break;
        }
      }
    }

    const newLayers = [...this._layers];
    const items = newLayers.splice(index, count);
    // Adjust target index if we removed items before it
    const adjustedTarget = targetIndex > index ? targetIndex - count : targetIndex;
    newLayers.splice(Math.max(0, adjustedTarget), 0, ...items);
    this._layers = newLayers;
    this.notifyListeners();
  }

  public getLayerById(id: LayerId): ILayer | undefined {
    return this._registry.get(id);
  }

  /**
   * Factory: creates a runtime ILayer instance from a pure DTO manifest,
   * applies all config from the manifest, and registers it in both
   * _layers (ordered flat array) and _registry (id → instance Map).
   *
   * Called by SceneReconciler to handle `add` patches from EngineStore.
   *
   * @param manifest - The pure-JSON DTO to instantiate.
   * @returns The newly created ILayer instance.
   */
  public instantiateLayer(manifest: ILayerManifest): ILayer {
    const { id, kind, startTime, duration, name, transform, appearance, source, control } =
      manifest;

    const layer = RuntimeLayerFactory.create(manifest);

    // Apply base temporal properties
    layer.startTime = startTime;
    layer.duration = duration;
    const isProjectAnchor =
      kind === 'control' && control?.params?.isProjectAnchor === true ? true : undefined;
    if (isProjectAnchor !== undefined) {
      (layer as { isProjectAnchor: boolean }).isProjectAnchor = isProjectAnchor;
    }
    if (name !== undefined) layer.name = name;
    const scopeRole = control?.params?.scopeRole;
    if (scopeRole !== undefined) {
      layer.updateConfig(normalizeLayerConfigPayload({ scopeRole }, 'control.params'));
    }
    const ruleType = control?.params?.ruleType;
    if (ruleType !== undefined) {
      layer.updateConfig(normalizeLayerConfigPayload({ ruleType }, 'control.params'));
    }
    const isSystem = control?.params?.isSystem;
    if (typeof isSystem === 'boolean') {
      layer.updateConfig(normalizeLayerConfigPayload({ isSystem }, 'control.params'));
    }
    if (source?.clipOffset !== undefined) {
      layer.updateConfig(normalizeLayerConfigPayload({ clipOffset: source.clipOffset }, 'source'));
    }
    if (source?.params !== undefined) {
      layer.updateConfig(normalizeLayerConfigPayload(source.params, 'source.params'));
    }

    // Apply spatial + optical properties onto RenderableLayer / ScopeStartLayer
    if (transform) {
      const r = layer as Partial<IRenderableLayer>;
      if (r.transform) {
        r.transform.position = { ...transform.position };
        r.transform.scale = { ...transform.scale };
        r.transform.rotation = transform.rotation;
      }
    }
    if (appearance) {
      const r = layer as Partial<IRenderableLayer>;
      if (r.appearance) {
        r.appearance.visible = appearance.visible;
        r.appearance.opacity = appearance.opacity;
      }
    }

    // Register in both data structures
    const insertionIndex = this._findInsertionIndex();
    this._layers.splice(insertionIndex, 0, layer);
    this._registry.set(id, layer);
    this.notifyListeners();

    return layer;
  }

  public setLayers(layers: ILayer[]): void {
    // Clean up existing resources to prevent leaks
    for (const layer of this._layers) {
      layer.dispose();
    }

    this._layers = [...layers];
    this._registry.clear();
    for (const layer of this._layers) {
      this._registry.set(layer.id, layer);
    }

    // Notify UI that the entire state has been replaced
    this.notifyListeners();
  }

  public setLayerOrder(layerIds: readonly LayerId[]): void {
    if (layerIds.length !== this._layers.length) {
      throw new Error(
        `Layer order length mismatch: expected ${this._layers.length}, received ${layerIds.length}.`,
      );
    }

    const seen = new Set<LayerId>();
    const orderedLayers: ILayer[] = [];
    for (const id of layerIds) {
      if (seen.has(id)) {
        throw new Error(`Layer order contains duplicate id '${id}'.`);
      }

      const layer = this._registry.get(id);
      if (!layer) {
        throw new Error(`Layer order references unknown id '${id}'.`);
      }

      seen.add(id);
      orderedLayers.push(layer);
    }

    this._layers = orderedLayers;
    this.notifyListeners();
  }

  /**
   * Update loop: iterates ALL layers each tick.
   * Visibility is NOT checked here — that belongs exclusively in draw().
   * ScopeStart/End are handled for temporal-offset propagation only.
   */
  public update(
    time: number,
    deltaTime: number,
    getAudioData?: (id: string) => Float32Array,
  ): void {
    this._stateStack.reset(time, this.width, this.height);

    for (const layer of this._layers) {
      if (isScopeStartLayer(layer)) {
        const l = layer as IScopeStartLayer;
        this._stateStack.push(l.matrix, l.stackOpacity, l.startTime);
        continue;
      }

      if (isScopeEndLayer(layer)) {
        this._stateStack.pop();
        continue;
      }

      const scopeLocalTime = this._stateStack.current.localTime;
      if (!isLayerTemporallyActive(scopeLocalTime, layer)) {
        continue;
      }

      // Update every temporally-active layer unconditionally
      layer.update(getLayerLocalTime(scopeLocalTime, layer), deltaTime, getAudioData);
    }
  }

  public draw(
    context: Omit<RenderContext, 'state' | 'sampleRate' | 'sceneRegistry'> & {
      sampleRate: number;
    },
  ): void {
    const logicalWidth = context.resolution.width || this.width;
    const logicalHeight = context.resolution.height || this.height;
    const viewportWidth = context.viewportResolution?.width || logicalWidth;
    const viewportHeight = context.viewportResolution?.height || logicalHeight;
    const scaleX = viewportWidth / (logicalWidth || 1);
    const scaleY = viewportHeight / (logicalHeight || 1);

    this._stateStack.reset(
      context.currentTime,
      viewportWidth,
      viewportHeight,
      scaleX,
      scaleY,
      context.shakeX ?? 0,
      context.shakeY ?? 0,
    );

    for (const layer of this._layers) {
      // Handle special Scope layers for stack management
      if (isScopeStartLayer(layer)) {
        const l = layer as IScopeStartLayer;
        this._stateStack.push(l.matrix, l.stackOpacity, l.startTime);
        continue;
      }

      if (isScopeEndLayer(layer)) {
        this._stateStack.pop();
        continue;
      }

      const scopeLocalTime = this._stateStack.current.localTime;
      if (!isLayerTemporallyActive(scopeLocalTime, layer)) {
        continue;
      }

      // Visibility culling: only for RenderableLayer instances
      if (!isRenderable(layer)) continue;
      if (!layer.appearance.visible) continue;

      // Render normal layer using current stack state
      const effectiveState = {
        ...this._stateStack.current,
        opacity: this._stateStack.current.opacity * layer.opacity,
      };

      layer.draw({
        ...context,
        state: effectiveState,
        sceneRegistry: this._registry,
      } as RenderContext);
    }
  }

  public getActiveMediaLayersReadiness(time: number): MediaReadiness {
    this._stateStack.reset(time, this.width, this.height);
    let hasFailedMedia = false;

    for (const layer of this._layers) {
      if (isScopeStartLayer(layer)) {
        const l = layer as IScopeStartLayer;
        this._stateStack.push(l.matrix, l.stackOpacity, l.startTime);
        continue;
      }

      if (isScopeEndLayer(layer)) {
        this._stateStack.pop();
        continue;
      }

      const scopeLocalTime = this._stateStack.current.localTime;
      if (!isLayerTemporallyActive(scopeLocalTime, layer)) {
        continue;
      }

      if (isRenderable(layer)) {
        if (!layer.appearance.visible) continue;
        const readiness = getRenderableMediaReadiness(layer);
        if (readiness === 'loading') return 'loading';
        if (readiness === 'failed') hasFailedMedia = true;
        continue;
      }

      const readiness = getAudioMediaReadiness(layer);
      if (readiness === 'loading') return 'loading';
      if (readiness === 'failed') hasFailedMedia = true;
    }

    return hasFailedMedia ? 'failed' : 'ready';
  }

  public areActiveMediaLayersReady(time: number): boolean {
    return this.getActiveMediaLayersReadiness(time) === 'ready';
  }

  public dispose(): void {
    for (const layer of this._layers) {
      layer.dispose();
    }
    this._layers = [];
    this._registry.clear();
    this.notifyListeners();
  }
}
