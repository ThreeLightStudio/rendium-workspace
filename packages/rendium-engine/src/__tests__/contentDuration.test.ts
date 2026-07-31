import { describe, expect, it } from 'vitest';
import type { ILayer, ILayerManifest, IProjectManifest } from '../_contracts';
import { calculateContentDuration } from '../_utils/time';
import { EngineSelectors } from '../store/EngineSelectors';
import { getProjectContentDuration } from '../store/SequenceBoundsService';

function createRuntimeLayer(id: string, kind: ILayer['kind'], startTime: number, duration: number) {
  return {
    id,
    kind,
    startTime,
    duration,
    update: () => {},
    dispose: () => {},
    updateConfig: () => {},
    getConfig: () => ({ id, kind, startTime, duration }),
  } as ILayer;
}

function createManifest(): IProjectManifest {
  const layers: Record<string, ILayerManifest> = {
    'outer-start': {
      id: 'outer-start',
      kind: 'control',
      startTime: 0,
      duration: 0,
      control: { role: 'scopeStart' },
    },
    'content-short': {
      id: 'content-short',
      kind: 'visual',
      startTime: 2,
      duration: 8,
      source: { sourceId: 'text-1', provider: 'text', track: 'visual' },
    },
    'content-long': {
      id: 'content-long',
      kind: 'visual',
      startTime: 3,
      duration: 12,
      source: { sourceId: 'image-1', provider: 'raster', track: 'visual' },
    },
    'outer-end': {
      id: 'outer-end',
      kind: 'control',
      startTime: 0,
      duration: 0,
      control: { role: 'scopeEnd', targetScopeId: 'outer-start' },
    },
  };

  return {
    version: '1.0',
    projectInfo: { name: 'Test Project', createdAt: 0, updatedAt: 0 },
    projectSettings: { canvas: { size: { width: 1920, height: 1080 } } },
    layers,
    layerOrder: ['outer-start', 'content-short', 'content-long', 'outer-end'],
    links: {},
  };
}

describe('content duration calculation', () => {
  it('returns zero for empty content', () => {
    expect(calculateContentDuration([])).toBe(0);
  });

  it('shares the same content duration across scene, manifest, and snapshot derivation', () => {
    const layers = [
      createRuntimeLayer('outer-start', 'control', 0, 0),
      createRuntimeLayer('content-short', 'visual', 2, 8),
      createRuntimeLayer('content-long', 'visual', 3, 12),
      createRuntimeLayer('outer-end', 'control', 0, 0),
    ];
    const manifest = createManifest();
    const scene = {
      layers,
      width: 1920,
      height: 1080,
    } as unknown as import('../_contracts').IScene;

    const expectedDuration = 15;

    expect(
      calculateContentDuration(layers, {
        shouldSkip: (layer) => layer.kind === 'control',
      }),
    ).toBe(expectedDuration);
    expect(getProjectContentDuration(manifest)).toBe(expectedDuration);

    const snapshot = EngineSelectors.buildSnapshot(scene, null, 20, 0, 0);
    expect(snapshot.duration).toBe(expectedDuration);
    expect(snapshot.projectDuration).toBe(20);
  });
});
