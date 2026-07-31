import type { IScene } from '../_contracts';
import { ScopeEndLayer } from '../layers/scope/ScopeEndLayer';
import { ScopeStartLayer } from '../layers/scope/ScopeStartLayer';
import { createDefaultProjectScaffold } from '../store/ProjectFactory';

/**
 * Utility to initialize a Scene with the mandatory project scaffold structure.
 * According to ARCHITECTURE.md Section 6.1.
 */
export const SceneInitializer = {
  /**
   * Initializes a scene with the project scaffold sentinel pair.
   *
   * @param scene The IScene instance to initialize.
   * @param duration Internal scaffold duration used for the default project layout.
   */
  bootstrap: (scene: IScene, duration = 0): void => {
    const existingScaffold = scene.layers.find((l) => l.isProjectAnchor);
    if (existingScaffold) {
      // update existing scaffold layers duration
      for (const l of scene.layers) {
        if (l.isProjectAnchor || l.isSystem) {
          l.updateConfig({ duration });
        }
      }
      return;
    }

    const { layers, layerOrder } = createDefaultProjectScaffold(duration);

    for (const layerId of layerOrder) {
      const manifest = layers[layerId];
      if (!manifest) continue;

      if (manifest.kind === 'control' && manifest.control?.role === 'scopeStart') {
        const scopeStart = new ScopeStartLayer(manifest.id);
        const scopeStartConfig = {
          startTime: manifest.startTime,
          duration: manifest.duration,
          ...(manifest.control.params ?? {}),
          ...(manifest.name !== undefined ? { name: manifest.name } : {}),
        };
        scopeStart.updateConfig(scopeStartConfig);
        scene.add(scopeStart);
        continue;
      }

      if (manifest.kind === 'control' && manifest.control?.role === 'scopeEnd') {
        const targetScopeId = manifest.control.targetScopeId ?? '';
        const scopeEnd = new ScopeEndLayer(manifest.id, targetScopeId);
        const scopeEndConfig = {
          startTime: manifest.startTime,
          duration: manifest.duration,
          ...(manifest.control.params ?? {}),
          ...(manifest.name !== undefined ? { name: manifest.name } : {}),
        };
        scopeEnd.updateConfig(scopeEndConfig);
        scene.add(scopeEnd);
      }
    }
  },
};
