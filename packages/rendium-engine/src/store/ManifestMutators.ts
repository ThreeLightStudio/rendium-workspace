/**
 * ManifestMutators
 *
 * Typed mutation helpers for IProjectManifest.
 *
 * Core principle (from migration plan, Phase 2):
 *   - Attribute changes  → mutate `layers[id]` ONLY  → Immer emits /layers/{id}/...
 *   - Z-Order changes    → mutate `layerOrder` ONLY   → Immer emits /layerOrder/...
 *   - Add / Remove       → touch BOTH atomically in one recipe
 *
 * Keeping these concerns strictly separate means SceneReconciler can branch
 * cleanly on `patch.path[0]` ("layers" vs "layerOrder") with O(1) patch routing,
 * and each Undo/Redo record contains the minimal diff required.
 *
 * Usage (inside EngineStore.dispatchIntent route):
 *   engineStore.dispatchIntent({ type: 'UPDATE_LAYER_PROPS', layerId: id, patch: { startTime: 5 } });
 *   engineStore.dispatchIntent({ type: 'REORDER_LAYER', layerId: id, toIndex: 2 });
 */

import type { WritableDraft } from 'immer';
import { type ILayerManifest, type IProjectManifest, IntentValidationError } from '../_contracts';
import type { LayerId } from '../_contracts';
import { getDefaultLayerInsertionIndex, getProjectContentDuration } from './SequenceBoundsService';
export {
  mutateCanvasBackgroundColor,
  mutateExportRange,
  mutateProjectInfo,
  mutateProjectInfo as mutateProjectMeta,
  mutateProjectSettings,
  mutateWatermark,
  mutateWorkArea,
  mutateCanvasSize,
} from './ProjectSettingsMutators';

// ---------------------------------------------------------------------------
// Locally-scoped draft aliases for type safety
// ---------------------------------------------------------------------------

type ManifestDraft = WritableDraft<IProjectManifest>;
type LayerDraft = WritableDraft<ILayerManifest>;

function isInfiniteManifestLayer(layer?: ILayerManifest): boolean {
  void layer;
  return false;
}

// ---------------------------------------------------------------------------
// Recipe types (callable shapes passed by callers)
// ---------------------------------------------------------------------------

/**
 * A function that may only mutate one ILayerManifest draft.
 * It is intentionally scoped to the layer object — the full manifest draft
 * is never exposed, preventing accidental layerOrder mutations.
 *
 * Test condition:
 *   After calling mutateLayerProps, every Immer patch path must begin with
 *   ["layers", layerId, ...] and NONE should start with ["layerOrder"].
 */
export type LayerPropertyRecipe = (layerDraft: LayerDraft) => void;

/**
 * A function that may only mutate the layerOrder array draft.
 * The layers Record is never exposed, preventing accidental property mutations.
 *
 * Test condition:
 *   After calling mutateLayerOrder, every Immer patch path must begin with
 *   ["layerOrder"] and NONE should start with ["layers"].
 */
export type OrderRecipe = (orderDraft: WritableDraft<LayerId[]>) => void;

export interface MutateLayerPropsInput {
  readonly draft: ManifestDraft;
  readonly layerId: LayerId;
  readonly recipe: LayerPropertyRecipe;
}

export interface AddLayerInput {
  readonly draft: ManifestDraft;
  readonly manifest: ILayerManifest;
  readonly insertAtIndex?: number;
}

// ---------------------------------------------------------------------------
// 1. Attribute mutation (layers[id] only)
// ---------------------------------------------------------------------------

/**
 * Apply a recipe to a single layer's manifest entry.
 *
 * Guarantees:
 *  - Only `draft.layers[layerId]` is passed to the recipe.
 *  - `draft.layerOrder` is never accessible inside the recipe closure.
 *  - Throws a clear error when the layer is not found so callers debug fast.
 *
 * Test condition (검증 1, Phase 2):
 *   const [, patches] = produceWithPatches(manifest, draft =>
 *     mutateLayerProps({ draft, layerId: "id_abc", recipe: l => { l.startTime = 5.0; } })
 *   );
 *   expect(patches.every(p => p.path[0] === "layers")).toBe(true);
 *   expect(patches.some(p => p.path[0] === "layerOrder")).toBe(false);
 */
export function mutateLayerProps(input: MutateLayerPropsInput): void {
  const { draft, layerId, recipe } = input;
  const layer = draft.layers[layerId];
  if (!layer) {
    throw new IntentValidationError(
      'UPDATE_LAYER_PROPS',
      `Layer "${layerId}" not found in manifest.`,
    );
  }
  // Pass ONLY the layer draft — layerOrder is never reachable from here.
  recipe(layer);
}

// ---------------------------------------------------------------------------
// 2. Z-Order / sequence mutation (layerOrder only)
// ---------------------------------------------------------------------------

/**
 * Apply a recipe to the layerOrder array.
 *
 * Guarantees:
 *  - Only `draft.layerOrder` is passed to the recipe.
 *  - `draft.layers` is never accessible inside the recipe closure.
 *
 * Test condition (검증 2, Phase 2):
 *   const [, patches] = produceWithPatches(manifest, draft =>
 *     mutateLayerOrder(draft, order => { order.splice(1, 0, order.splice(3,1)[0]!); })
 *   );
 *   expect(patches.every(p => p.path[0] === "layerOrder")).toBe(true);
 *   expect(patches.some(p => p.path[0] === "layers")).toBe(false);
 */
export function mutateLayerOrder(draft: ManifestDraft, recipe: OrderRecipe): void {
  // Pass ONLY the layerOrder draft — layers Record is never reachable.
  recipe(draft.layerOrder);
}

// ---------------------------------------------------------------------------
// 2.5. Infinite layer normalization
// ---------------------------------------------------------------------------

/**
 * Sync all infinite layers to the current content duration.
 *
 * The content duration intentionally ignores scope markers and existing
 * infinite layers to avoid feedback loops.
 *
 * @returns The duration applied to all infinite layers.
 */
export function normalizeInfiniteLayers(
  draft: Pick<IProjectManifest, 'layers' | 'layerOrder'>,
): number {
  const contentDuration = getProjectContentDuration(draft);

  for (const layer of Object.values(draft.layers)) {
    if (!isInfiniteManifestLayer(layer)) continue;
    layer.startTime = 0;
    layer.duration = contentDuration;
  }

  return contentDuration;
}

// ---------------------------------------------------------------------------
// 3. Atomic add (layers + layerOrder in ONE recipe)
// ---------------------------------------------------------------------------

/**
 * Insert a new layer manifest into both `layers` and `layerOrder` atomically.
 *
 * Because a single `produceWithPatches` recipe touches two fields, Immer will
 * emit two patch groups:
 *   - { op: "add", path: ["layers", manifest.id], value: manifest }
 *   - { op: "add", path: ["layerOrder", insertIdx], value: manifest.id }
 *
 * SceneReconciler handles these as two distinct cases in the same reconcile
 * call, so the engine side is always consistent with the manifest side.
 *
 * @param draft         The current manifest draft (inside produceWithPatches).
 * @param manifest      The new ILayerManifest to register.
 * @param insertAtIndex Position in layerOrder (default: append to end).
 *
 * Test condition:
 *   engineStore.dispatchIntent({ type: 'ADD_LAYER', manifest: newManifest, targetScopeId: selectedScopeId });
 *   expect(engineStore.getManifest().layers[newManifest.id]).toBeDefined();
 *   expect(engineStore.getManifest().layerOrder).toContain(newManifest.id);
 */
export function addLayer(input: AddLayerInput): void {
  const { draft, manifest, insertAtIndex } = input;

  // Guard: reject duplicate ids to preserve manifest integrity.
  if (draft.layers[manifest.id]) {
    throw new Error(`[ManifestMutators] addLayer: layer "${manifest.id}" already exists.`);
  }
  // Immer patch: /layers/{id} → add
  draft.layers[manifest.id] = manifest as LayerDraft;

  // Immer patch: /layerOrder/{index} → add
  const idx = insertAtIndex ?? getDefaultLayerInsertionIndex(draft);

  draft.layerOrder.splice(idx, 0, manifest.id);
}

// ---------------------------------------------------------------------------
// 4. Atomic remove (layers + layerOrder in ONE recipe)
// ---------------------------------------------------------------------------

/**
 * Remove a layer manifest from both `layers` and `layerOrder` atomically.
 *
 * Emits two patches:
 *   - { op: "remove", path: ["layers", layerId] }
 *   - { op: "remove", path: ["layerOrder", index] }
 *
 * SceneReconciler's `remove` branch calls `layer.dispose()` (which fires
 * AbortController.abort() for AudioLayers) before deleting from the registry.
 *
 * @param draft    The current manifest draft.
 * @param layerId  The id of the layer to remove.
 *
 * Test condition:
 *   engineStore.dispatchIntent({ type: 'REMOVE_LAYER', layerId: 'id_abc' });
 *   expect(engineStore.getManifest().layers["id_abc"]).toBeUndefined();
 *   expect(engineStore.getManifest().layerOrder).not.toContain("id_abc");
 */
export function removeLayer(draft: ManifestDraft, layerId: LayerId): void {
  if (!draft.layers[layerId]) {
    throw new IntentValidationError('REMOVE_LAYER', `Layer "${layerId}" not found in manifest.`);
  }
  for (const [linkId, link] of Object.entries(draft.links)) {
    if (link.roles.includes('deleteTogether') && (link.from === layerId || link.to === layerId)) {
      const linkedLayerId = link.from === layerId ? link.to : link.from;
      if (draft.layers[linkedLayerId]) {
        delete draft.layers[linkedLayerId];
        const linkedIndex = draft.layerOrder.indexOf(linkedLayerId);
        if (linkedIndex !== -1) draft.layerOrder.splice(linkedIndex, 1);
      }
    }
    if (link.from === layerId || link.to === layerId) {
      delete draft.links[linkId];
    }
  }
  // Immer patch: /layers/{id} → remove
  delete draft.layers[layerId];

  // Immer patch: /layerOrder/{index} → remove
  const idx = draft.layerOrder.indexOf(layerId);
  if (idx !== -1) {
    draft.layerOrder.splice(idx, 1);
  }
}

// ---------------------------------------------------------------------------
// 5. Global manifest mutation
// ---------------------------------------------------------------------------
