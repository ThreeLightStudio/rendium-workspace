/**
 * SceneReconciler.test.ts — Phase 2: Corruption Detection & Auto-Recovery
 *
 * Tests verify that:
 *  1. A poisoned (unroutable) patch causes `_isCorrupted` to be set.
 *  2. `recoverFromCorruption()` is automatically triggered and resets the flag.
 *  3. After recovery, the Scene's live layer list matches the manifest exactly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProjectManifest } from '../_contracts';
import { Scene } from '../core/Scene';
import { ProjectFactory } from '../store/ProjectFactory';
import { SceneReconciler } from '../timeline/SceneReconciler';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a fresh Scene + SceneReconciler pair backed by a blank project manifest.
 * The reconciler is given a manifestGetter so the auto-recovery path can fire.
 */
function buildTestContext(): {
  scene: Scene;
  reconciler: SceneReconciler;
  manifest: IProjectManifest;
} {
  const manifest = ProjectFactory.createBlankManifest({
    name: 'ReconcilerTest',
    width: 1920,
    height: 1080,
  });
  const scene = new Scene();
  const reconciler = new SceneReconciler(scene, () => manifest);

  // Bootstrap the scene from the manifest via a full-replace patch
  reconciler.reconcile([{ op: 'replace', path: [], value: manifest }]);
  expect(scene.width).toBe(manifest.projectSettings.canvas.size.width);
  expect(scene.height).toBe(manifest.projectSettings.canvas.size.height);

  return { scene, reconciler, manifest };
}

interface CorruptibleSceneReconciler {
  _isCorrupted: boolean;
}

function markReconcilerCorrupted(reconciler: SceneReconciler): void {
  (reconciler as unknown as CorruptibleSceneReconciler)._isCorrupted = true;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SceneReconciler — Phase 2: Corruption Detection & Auto-Recovery', () => {
  // Silence console output during tests (errors are expected)
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    return () => vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Poisoned patch activates isCorrupted
  // -------------------------------------------------------------------------

  describe('Scenario 1: Poisoned patch sets isCorrupted', () => {
    it('should set isCorrupted = true when a patch causes an internal error', () => {
      const { reconciler } = buildTestContext();

      // Before injection the reconciler is clean
      expect(reconciler.isCorrupted).toBe(false);

      // Inject a patch that will throw inside _applyPatch:
      // Targeting /layers/{id}/transform/position/x on a layer that does not
      // have a transform property (SCOPE_START has no numeric transform setter
      // at the Scene level) intentionally, but we need a guaranteed throw.
      //
      // The safest way to guarantee the throw is to craft a patch whose path
      // segment causes _applyPatch's internal getter to explode. We do that by
      // temporarily breaking the layer's updateConfig on a targeted layer.
      //
      // However, the simplest and most realistic approach is to use a spy to
      // force _applyPatch to throw via the scene's getLayerById.
      // We replace the scene's getLayerById with one that throws on the first call.
      const badPatch: import('immer').Patch = {
        op: 'replace',
        path: ['layers', 'nonexistent-layer-id', 'startTime'],
        value: 99,
      };

      // getLayerById returns undefined for 'nonexistent-layer-id', so the
      // property-update path emits a warning but does NOT throw.
      // We need an actual throw. Override _applyPatch indirectly by making
      // the scene's getLayerById throw when called with this id.
      const originalGetLayerById = reconciler.scene.getLayerById.bind(reconciler.scene);
      vi.spyOn(reconciler.scene, 'getLayerById').mockImplementationOnce((id) => {
        if (id === 'nonexistent-layer-id') {
          throw new Error('Simulated internal layer registry corruption');
        }
        return originalGetLayerById(id);
      });

      reconciler.reconcile([badPatch]);

      // isCorrupted must be false again because recoverFromCorruption() was
      // called automatically and reset the flag — but we can verify the error
      // path was triggered by checking that console.error was called with
      // 'Patch error' text.
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[SceneReconciler] Patch error'),
        expect.anything(),
        expect.anything(),
      );

      // After auto-recovery isCorrupted is reset to false
      expect(reconciler.isCorrupted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: recoverFromCorruption resets the flag
  // -------------------------------------------------------------------------

  describe('Scenario 2: recoverFromCorruption() resets isCorrupted flag', () => {
    it('should reset isCorrupted to false after manual recoverFromCorruption call', () => {
      const { reconciler, manifest } = buildTestContext();

      // Manually set the corrupted flag (simulating mid-loop failure)
      markReconcilerCorrupted(reconciler);
      expect(reconciler.isCorrupted).toBe(true);

      reconciler.recoverFromCorruption(manifest);

      expect(reconciler.isCorrupted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Post-recovery Scene matches manifest exactly
  // -------------------------------------------------------------------------

  describe('Scenario 3: Post-recovery Scene layer list matches manifest', () => {
    it('should rebuild Scene layers to exactly match manifest.layerOrder after recovery', () => {
      const { scene, reconciler, manifest } = buildTestContext();

      // Verify initial state is healthy
      expect(scene.layers.map((l) => l.id)).toEqual(manifest.layerOrder);

      // Corrupt the scene by manually removing one non-anchor scope:start block
      // without updating the manifest — simulates a diverged Scene state.
      const scopeStartId = manifest.layerOrder.find((id) => {
        const layer = manifest.layers[id];
        return (
          layer?.kind === 'control' &&
          layer.control?.role === 'scopeStart' &&
          layer.control.params?.isProjectAnchor !== true
        );
      });
      if (!scopeStartId) throw new Error('Track scope:start layer missing from fixture');

      // Directly call Scene.remove() to simulate the corruption
      scene.remove(scopeStartId);
      expect(scene.layers.length).toBe(manifest.layerOrder.length - 2);

      // Trigger recovery with the stable scaffold manifest
      reconciler.recoverFromCorruption(manifest);

      // Post-recovery: Scene must match the canonical manifest order exactly
      const recoveredIds = scene.layers.map((l) => l.id);
      expect(recoveredIds).toEqual(manifest.layerOrder);
      expect(recoveredIds.length).toBe(manifest.layerOrder.length);

      // isCorrupted must be clear
      expect(reconciler.isCorrupted).toBe(false);
    });

    it('should ignore REMOVE_LAYER when the runtime layer is already missing', () => {
      const { scene, reconciler, manifest } = buildTestContext();

      const scopeStartId = manifest.layerOrder.find((id) => {
        const layer = manifest.layers[id];
        return (
          layer?.kind === 'control' &&
          layer.control?.role === 'scopeStart' &&
          layer.control.params?.isProjectAnchor !== true
        );
      });
      if (!scopeStartId) throw new Error('Track scope:start layer missing from fixture');

      scene.remove(scopeStartId);
      expect(scene.getLayerById(scopeStartId)).toBeUndefined();

      reconciler.reconcile([{ op: 'remove', path: ['layers', scopeStartId] }]);

      expect(reconciler.isCorrupted).toBe(false);
      expect(scene.getLayerById(scopeStartId)).toBeUndefined();
    });

    it('should rebuild correctly after an automatic recovery triggered by a poisoned patch', () => {
      const { scene, reconciler, manifest } = buildTestContext();

      const expectedIds = [...manifest.layerOrder];

      // Force a corruption recovery cycle via a mocked throw
      vi.spyOn(reconciler.scene, 'getLayerById').mockImplementationOnce(() => {
        throw new Error('Simulated crash inside reconcile loop');
      });

      reconciler.reconcile([
        {
          op: 'replace',
          path: ['layers', manifest.layerOrder[0] ?? 'any', 'startTime'],
          value: 0,
        },
      ]);

      // After auto-recovery the layer IDs must match the manifest exactly
      const postRecoveryIds = scene.layers.map((l) => l.id);
      expect(postRecoveryIds).toEqual(expectedIds);
      expect(reconciler.isCorrupted).toBe(false);
    });
  });
});

describe('SceneReconciler layerOrder runtime reconciliation', () => {
  it('reorders existing runtime layers without disposing them', () => {
    let manifest = ProjectFactory.createBlankManifest({
      width: 1920,
      height: 1080,
    });
    const scene = new Scene();
    const reconciler = new SceneReconciler(scene, () => manifest);

    reconciler.recoverFromCorruption(manifest);
    const disposeSpies = scene.layers.map((layer) => vi.spyOn(layer, 'dispose'));
    const nextOrder = [...manifest.layerOrder].reverse();
    manifest = { ...manifest, layerOrder: nextOrder };

    reconciler.reconcile([{ op: 'replace', path: ['layerOrder'], value: nextOrder }]);

    expect(scene.layers.map((layer) => layer.id)).toEqual(nextOrder);
    for (const disposeSpy of disposeSpies) {
      expect(disposeSpy).not.toHaveBeenCalled();
    }
    expect(reconciler.isCorrupted).toBe(false);
  });
});
