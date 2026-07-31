import type { IProjectManifest } from '../_contracts';

/**
 * Validates whether the given value is a valid Partial<IProjectManifest>
 * or matches basic Rendium schema constraints.
 */
export function validatePresetSchema(preset: unknown): preset is Partial<IProjectManifest> {
  if (typeof preset !== 'object' || preset === null) {
    return false;
  }

  const p = preset as {
    version?: unknown;
    projectSettings?: unknown;
    layers?: unknown;
    layerOrder?: unknown;
  };

  // 1. check version (it is Partial, but if version exists it must be '1.0')
  if (p.version !== undefined && p.version !== '1.0') {
    return false;
  }

  // 2. check projectSettings
  if (p.projectSettings !== undefined) {
    if (typeof p.projectSettings !== 'object' || p.projectSettings === null) {
      return false;
    }
    const ps = p.projectSettings as { canvas?: unknown };
    if (ps.canvas !== undefined) {
      if (typeof ps.canvas !== 'object' || ps.canvas === null) {
        return false;
      }
      const canvas = ps.canvas as { size?: unknown };
      if (canvas.size !== undefined) {
        if (typeof canvas.size !== 'object' || canvas.size === null) {
          return false;
        }
        const size = canvas.size as { width?: unknown; height?: unknown };
        if (typeof size.width !== 'number' || typeof size.height !== 'number') {
          return false;
        }
      }
    }
  }

  // 3. check layers
  if (p.layers !== undefined) {
    if (typeof p.layers !== 'object' || p.layers === null) {
      return false;
    }
    const layers = p.layers as Record<string, unknown>;
    for (const key of Object.keys(layers)) {
      const layer = layers[key];
      if (typeof layer !== 'object' || layer === null) {
        return false;
      }
      const l = layer as { id?: unknown; kind?: unknown };
      if (typeof l.id !== 'string' || typeof l.kind !== 'string') {
        return false;
      }
      if (l.kind !== 'visual' && l.kind !== 'audio' && l.kind !== 'control') {
        return false;
      }
    }
  }

  // 4. check layerOrder
  if (p.layerOrder !== undefined) {
    if (!Array.isArray(p.layerOrder)) {
      return false;
    }
    for (const id of p.layerOrder) {
      if (typeof id !== 'string') {
        return false;
      }
    }
  }

  return true;
}
