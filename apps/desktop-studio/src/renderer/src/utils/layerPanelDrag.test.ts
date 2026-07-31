import {
  type ILayer,
  type ILayerManifest,
  type IProjectManifest,
  engineStore,
} from '@rendium/engine';
import { describe, expect, it } from 'vitest';
import { resolveLayerPanelDropIndicator } from './layerPanelDrag';

function createLayer(
  partial: Partial<ILayer> & { id: string; name?: string; [key: string]: unknown },
): ILayer {
  return {
    name: partial.name ?? partial.id,
    startTime: partial.startTime ?? 0,
    duration: partial.duration ?? 1,
    ...partial,
  } as ILayer;
}

function createScopeLayer(
  id: string,
  role: 'scopeStart' | 'scopeEnd',
  name: string,
  params: NonNullable<ILayerManifest['control']>['params'] = {},
): ILayerManifest {
  return {
    id,
    kind: 'control',
    name,
    startTime: 0,
    duration: 1,
    control: { role, params },
  };
}

function createVisualLayer(id: string, name: string): ILayerManifest {
  return {
    id,
    kind: 'visual',
    name,
    startTime: 0,
    duration: 1,
    source: {
      sourceId: `video:${id}`,
      provider: 'video',
      track: 'visual',
      params: {},
    },
  };
}

function createManifest(): IProjectManifest {
  const layers = [
    createScopeLayer('root-start', 'scopeStart', 'root', {
      isProjectAnchor: true,
      scopeRole: 'composite',
    }),
    createScopeLayer('main-start', 'scopeStart', 'main-start', { scopeRole: 'main' }),
    createVisualLayer('clip-a', 'A'),
    createVisualLayer('clip-b', 'B'),
    createScopeLayer('nested-start', 'scopeStart', 'Nested', { scopeRole: 'overlay' }),
    {
      ...createVisualLayer('nested-inner', 'Inner'),
      source: { sourceId: 'text:nested-inner', provider: 'text', track: 'visual', params: {} },
    } satisfies ILayerManifest,
    createScopeLayer('nested-end', 'scopeEnd', 'Nested End'),
    createVisualLayer('clip-c', 'C'),
    createScopeLayer('main-end', 'scopeEnd', 'Main End'),
    createScopeLayer('root-end', 'scopeEnd', 'root-end', { isProjectAnchor: true }),
  ];

  return {
    version: '1.0',
    projectInfo: { name: 'Layer Panel Drag', createdAt: 0, updatedAt: 0 },
    projectSettings: { canvas: { size: { width: 1920, height: 1080 } } },
    layers: Object.fromEntries(layers.map((layer) => [layer.id, layer])),
    layerOrder: layers.map((layer) => layer.id),
    links: {},
  };
}

function createManifestLayers(): ILayer[] {
  return [
    createLayer({
      id: 'root-start',
      isProjectAnchor: true,
      name: 'root',
    }),
    createLayer({
      id: 'main-start',
      name: 'main-start',
      scopeRole: 'main',
    }),
    createLayer({ id: 'clip-a', name: 'A' }),
    createLayer({ id: 'clip-b', name: 'B' }),
    createLayer({
      id: 'nested-start',
      name: 'Nested',
      scopeRole: 'overlay',
    }),
    createLayer({ id: 'nested-inner', name: 'Inner' }),
    createLayer({ id: 'nested-end', name: 'Nested End' }),
    createLayer({ id: 'clip-c', name: 'C' }),
    createLayer({
      id: 'main-end',
      name: 'Main End',
    }),
    createLayer({
      id: 'root-end',
      isProjectAnchor: true,
      name: 'root-end',
    }),
  ];
}

describe('resolveLayerPanelDropIndicator', () => {
  engineStore.loadManifest(createManifest());
  const layers = createManifestLayers();
  const layerOrder = layers.map((layer) => layer.id);
  const clipC = layers[7] as ILayer;
  const nestedStart = layers[4] as ILayer;
  const clipA = layers[2] as ILayer;

  it('calculates before and after slots within the same scope', () => {
    const before = resolveLayerPanelDropIndicator({
      layers,
      layerOrder,
      sourceLayerId: 'clip-a',
      targetNode: { layer: clipC, orderIndex: 7 },
      clientY: 8,
      targetTop: 0,
      targetHeight: 20,
    });

    const after = resolveLayerPanelDropIndicator({
      layers,
      layerOrder,
      sourceLayerId: 'clip-a',
      targetNode: { layer: clipC, orderIndex: 7 },
      clientY: 16,
      targetTop: 0,
      targetHeight: 20,
    });

    expect(before).toEqual({
      targetLayerId: 'clip-c',
      position: 'before',
      toIndex: 6,
    });
    expect(after).toEqual({
      targetLayerId: 'clip-c',
      position: 'after',
      toIndex: 7,
    });
  });

  it('rejects drop slots that cross a nested scope boundary', () => {
    const indicator = resolveLayerPanelDropIndicator({
      layers,
      layerOrder,
      sourceLayerId: 'clip-a',
      targetNode: { layer: nestedStart, orderIndex: 4 },
      clientY: 16,
      targetTop: 0,
      targetHeight: 20,
    });

    expect(indicator).toBeNull();
  });

  it('returns null for no-op self drops', () => {
    const indicator = resolveLayerPanelDropIndicator({
      layers,
      layerOrder,
      sourceLayerId: 'clip-a',
      targetNode: { layer: clipA, orderIndex: 2 },
      clientY: 16,
      targetTop: 0,
      targetHeight: 20,
    });

    expect(indicator).toBeNull();
  });
});
