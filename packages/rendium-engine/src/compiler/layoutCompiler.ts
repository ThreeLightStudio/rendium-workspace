import type { IProjectManifest } from '../_contracts';
import { validatePresetSchema } from '../validator/schemaValidator';

export const CLASSIC_VISUALIZER_PRESET: IProjectManifest = {
  version: '1.0',
  projectInfo: {
    name: 'Classic Visualizer',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  projectSettings: {
    canvas: {
      size: { width: 1920, height: 1080 },
      backgroundColor: [0.05, 0.05, 0.07, 1.0],
    },
  },
  layers: {
    'layer-classic-background': {
      id: 'layer-classic-background',
      kind: 'visual',
      startTime: 0,
      duration: 300,
      transform: {
        position: { x: 960, y: 540 },
        scale: { x: 1920, y: 1080 },
        rotation: 0,
      },
      appearance: {
        visible: true,
        opacity: 1.0,
      },
      source: {
        sourceId: 'source-classic-bg',
        provider: 'raster',
        track: 'visual',
        params: {
          sourceUrl: null,
        },
      },
    },
    'layer-classic-spectrum': {
      id: 'layer-classic-spectrum',
      kind: 'visual',
      startTime: 0,
      duration: 300,
      transform: {
        position: { x: 0, y: 540 },
        scale: { x: 1920, y: -540 },
        rotation: 0,
      },
      appearance: {
        visible: true,
        opacity: 1.0,
      },
      source: {
        sourceId: 'source-classic-spectrum',
        provider: 'generated-visual',
        track: 'visual',
        params: {
          bandCount: 96,
          gain: 1.5,
          smoothing: 0.72,
          color: [0, 0.75, 1, 1], // vibrant cyan
        },
      },
    },
    'layer-classic-text': {
      id: 'layer-classic-text',
      kind: 'visual',
      startTime: 0,
      duration: 300,
      transform: {
        position: { x: 960, y: 800 },
        scale: { x: 800, y: 100 },
        rotation: 0,
      },
      appearance: {
        visible: true,
        opacity: 1.0,
      },
      source: {
        sourceId: 'source-classic-text',
        provider: 'text',
        track: 'visual',
        params: {
          text: 'Rendium Classic Visualizer',
          fontFamily: 'Inter',
          fontSize: 48,
          fontWeight: 'bold',
          color: '#ffffff',
          align: 'center',
        },
      },
    },
  },
  layerOrder: ['layer-classic-background', 'layer-classic-spectrum', 'layer-classic-text'],
  links: {},
};

/**
 * Compiles coordinates within a project manifest. Converts relative coords (in range [-1.0, 1.0])
 * to absolute pixel coordinates based on the canvas size.
 * Yields Classic Visualizer fallback preset if preset validation fails.
 */
export function compileRelativeCoords(
  manifest: unknown,
  targetSize: { width: number; height: number },
): IProjectManifest {
  if (!validatePresetSchema(manifest)) {
    console.warn('Preset validation failed. Falling back to Classic Visualizer.');
    const fallback = structuredClone(CLASSIC_VISUALIZER_PRESET);
    fallback.projectSettings.canvas.size = targetSize;
    return fallback;
  }

  const cloned = structuredClone(manifest) as IProjectManifest;
  cloned.projectSettings = cloned.projectSettings || { canvas: { size: targetSize } };
  cloned.projectSettings.canvas = cloned.projectSettings.canvas || { size: targetSize };
  cloned.projectSettings.canvas.size = targetSize;

  for (const layerId of Object.keys(cloned.layers || {})) {
    const layer = cloned.layers[layerId];
    if (layer?.transform) {
      const pos = layer.transform.position;
      const scl = layer.transform.scale;

      if (pos) {
        if (typeof pos.x === 'number') {
          if (Math.abs(pos.x) <= 1.0) {
            pos.x = Math.round(pos.x * targetSize.width);
          }
        }
        if (typeof pos.y === 'number') {
          if (Math.abs(pos.y) <= 1.0) {
            pos.y = Math.round(pos.y * targetSize.height);
          }
        }
      }

      if (scl) {
        if (typeof scl.x === 'number') {
          if (Math.abs(scl.x) <= 1.0) {
            scl.x = Math.round(scl.x * targetSize.width);
          }
        }
        if (typeof scl.y === 'number') {
          if (Math.abs(scl.y) <= 1.0) {
            scl.y = Math.round(scl.y * targetSize.height);
          }
        }
      }
    }
  }

  return cloned;
}
