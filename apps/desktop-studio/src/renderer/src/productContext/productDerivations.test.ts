import type { ILayerManifest } from '@rendium/engine';
import { describe, expect, it } from 'vitest';
import type { ProjectAssetRecord } from '../stores/projectAssetTypes';
import {
  deriveImagePlacementProductContext,
  deriveImagePlacementScopes,
  derivePreferredImagePlacementScope,
  deriveProjectContentEnd,
} from './productDerivations';

const baseAsset = {
  projectId: 'project-1',
  contentHash: 'hash',
  importedFromPath: null,
  mimeType: 'image/png',
  size: 1024,
  width: 1280,
  height: 720,
  durationSeconds: null,
  createdAt: 1,
  updatedAt: 1,
} satisfies Omit<
  ProjectAssetRecord,
  'id' | 'assetKind' | 'displayName' | 'sourceUrl' | 'lastKnownSourceUrl' | 'status'
>;

interface TestManifest {
  layers: Record<string, ILayerManifest>;
  layerOrder: string[];
}

function createManifest(): TestManifest {
  return {
    layers: {
      'project-anchor': {
        id: 'project-anchor',
        kind: 'control',
        startTime: 0,
        duration: 0,
        control: {
          role: 'scopeStart',
          params: {
            scopeRole: 'main',
            isProjectAnchor: true,
          },
        },
      },
      'scope-overlay': {
        id: 'scope-overlay',
        kind: 'control',
        startTime: 2,
        duration: 10,
        control: {
          role: 'scopeStart',
          params: {
            scopeRole: 'overlay',
          },
        },
      },
      'scope-main': {
        id: 'scope-main',
        kind: 'control',
        startTime: 0,
        duration: 10,
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
        name: 'Image Layer',
        startTime: 1,
        duration: 5,
        source: {
          sourceId: 'image-1',
          provider: 'raster',
          track: 'visual',
          params: {},
        },
      },
    },
    layerOrder: ['project-anchor', 'scope-overlay', 'scope-main', 'image-1'],
  };
}

function createImageAsset(
  id: string,
  status: 'ready' | 'missing',
  sourceUrl: string | null = `rendium-asset://project-1/files/${id}.png`,
): ProjectAssetRecord {
  return {
    ...baseAsset,
    id,
    assetKind: 'image',
    displayName: id,
    sourceUrl,
    lastKnownSourceUrl: sourceUrl,
    status,
  };
}

describe('product derivations', () => {
  it('derives project content end from duration before projectDuration', () => {
    expect(deriveProjectContentEnd({ duration: 24, projectDuration: 30 })).toBe(24);
    expect(deriveProjectContentEnd({ projectDuration: 30 })).toBe(30);
    expect(deriveProjectContentEnd({ duration: -3, projectDuration: 9 })).toBe(0);
  });

  it('derives image placement scopes while excluding project anchors', () => {
    const scopes = deriveImagePlacementScopes(createManifest());

    expect(scopes).toEqual([
      expect.objectContaining({ id: 'scope-main', role: 'main', preferred: true }),
      expect.objectContaining({ id: 'scope-overlay', role: 'overlay', preferred: false }),
    ]);
    expect(scopes.map((scope) => scope.id)).not.toContain('project-anchor');
  });

  it('prefers overlay scope with main fallback when requested', () => {
    expect(derivePreferredImagePlacementScope(createManifest(), 'overlay')).toEqual(
      expect.objectContaining({ id: 'scope-overlay', role: 'overlay', preferred: true }),
    );

    const manifest = createManifest();
    const withoutOverlay = {
      ...manifest,
      layers: {
        ...manifest.layers,
        'scope-overlay': {
          ...manifest.layers['scope-overlay'],
          control: {
            role: 'scopeStart' as const,
            params: {
              scopeRole: 'text' as const,
            },
          },
        },
      },
    };

    expect(derivePreferredImagePlacementScope(withoutOverlay, 'overlay')).toEqual(
      expect.objectContaining({ id: 'scope-main', role: 'main', preferred: false }),
    );
  });

  it('returns no preferred scope when no valid image placement scope exists', () => {
    const manifest = {
      ...createManifest(),
      layers: {
        'project-anchor': createManifest().layers['project-anchor'],
      },
      layerOrder: ['project-anchor'],
    };

    expect(derivePreferredImagePlacementScope(manifest)).toBeNull();
  });

  it('derives selected ready image asset context', () => {
    const context = deriveImagePlacementProductContext({
      manifest: createManifest(),
      snapshot: { duration: 18 },
      assets: [
        createImageAsset('ready-image', 'ready'),
        createImageAsset('pending-image', 'ready'),
        createImageAsset('missing-image', 'missing', null),
      ],
      selectedAssetId: 'pending-image',
      selectedLayerId: 'image-1',
    });

    expect(context.projectContentEnd).toBe(18);
    expect(context.readyImageAssetIds).toEqual(['ready-image', 'pending-image']);
    expect(context.selectedAssetId).toBe('pending-image');
    expect(context.selectedLayer).toEqual(
      expect.objectContaining({
        layerId: 'image-1',
        layerType: 'image',
      }),
    );
  });
});
