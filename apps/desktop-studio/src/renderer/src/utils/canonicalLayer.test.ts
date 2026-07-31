import { type ILayer, type IProjectManifest, engineStore } from '@rendium/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getManifestForLayer, getScopeRole } from './canonicalLayer';

const manifest: IProjectManifest = {
  version: '1.0',
  projectInfo: { name: 'Canonical Layer Test', createdAt: 0, updatedAt: 0 },
  projectSettings: { canvas: { size: { width: 1920, height: 1080 } } },
  layers: {
    'scope-main': {
      id: 'scope-main',
      kind: 'control',
      startTime: 0,
      duration: 1,
      control: {
        role: 'scopeStart',
        params: {
          scopeRole: 'main',
        },
      },
    },
    'image-1': {
      id: 'image-1',
      kind: 'visual',
      startTime: 0,
      duration: 1,
      source: {
        sourceId: 'image-1',
        provider: 'raster',
        track: 'visual',
      },
    },
  },
  layerOrder: ['scope-main', 'image-1'],
  links: {},
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('canonical layer helpers', () => {
  it('resolves scope roles from runtime layers through the manifest snapshot', () => {
    engineStore.loadManifest(manifest);
    const scopeLayer = {
      id: 'scope-main',
      kind: 'control',
      startTime: 0,
      duration: 1,
      getConfig: () => ({}),
    } as unknown as ILayer;

    expect(getScopeRole(scopeLayer)).toBe('main');
  });

  it('does not recursively resolve non-control manifest layers', () => {
    engineStore.loadManifest(manifest);
    const imageManifest = getManifestForLayer('image-1');

    expect(getScopeRole(imageManifest)).toBeUndefined();
  });

  it('returns undefined when the manifest snapshot is unavailable', () => {
    vi.spyOn(engineStore, 'getManifest').mockReturnValue(null as unknown as IProjectManifest);

    expect(getManifestForLayer('image-1')).toBeUndefined();
  });
});
