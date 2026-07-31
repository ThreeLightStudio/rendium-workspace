import { beforeEach, describe, expect, it } from 'vitest';
import type { ILayerManifest, IProjectManifest } from '../_contracts';
import { INTENT_TYPES, engineStore } from '../index';
import { computeCanvasAspectReflowLayerUpdate } from '../store/CanvasAspectReflow';
import { ProjectFactory } from '../store/ProjectFactory';

const OLD_SIZE = { width: 1920, height: 1080 };
const NEXT_SIZE = { width: 1080, height: 1920 };

function visualLayer(overrides: Partial<ILayerManifest> = {}): ILayerManifest {
  return {
    id: 'visual-layer',
    kind: 'visual',
    startTime: 0,
    duration: 10,
    source: {
      sourceId: 'source:visual-layer',
      provider: 'raster',
      track: 'visual',
      params: { fit: 'contain' },
    },
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    },
    appearance: { visible: true, opacity: 1 },
    ...overrides,
  };
}

function createProjectWithLayers(layers: ILayerManifest[]): IProjectManifest {
  const manifest = ProjectFactory.createBlankManifest({
    name: 'Canvas Reflow Test',
    width: OLD_SIZE.width,
    height: OLD_SIZE.height,
  });
  const mainStartId = manifest.layerOrder.find((layerId) => {
    const layer = manifest.layers[layerId];
    return layer?.control?.role === 'scopeStart' && layer.control.params?.scopeRole === 'main';
  });
  const mainEndIndex = manifest.layerOrder.findIndex((layerId) => {
    const layer = manifest.layers[layerId];
    return layer?.control?.role === 'scopeEnd' && layer.control.targetScopeId === mainStartId;
  });

  if (!mainStartId || mainEndIndex === -1) {
    throw new Error('Main scope markers are missing from ProjectFactory fixture.');
  }

  for (const layer of layers) {
    manifest.layers[layer.id] = layer;
  }
  manifest.layerOrder.splice(mainEndIndex, 0, ...layers.map((layer) => layer.id));

  return manifest;
}

function expectLayer(manifest: IProjectManifest, layerId: string): ILayerManifest {
  const layer = manifest.layers[layerId];
  if (!layer) {
    throw new Error(`Layer "${layerId}" missing from manifest.`);
  }
  return layer;
}

function getSourceParam(layer: ILayerManifest, key: string): unknown {
  return layer.source?.params?.[key];
}

describe('canvas aspect reflow helper', () => {
  it('keeps full-canvas cover/contain media transform unchanged', () => {
    const layer = visualLayer({
      id: 'background',
      source: {
        sourceId: 'source:background',
        provider: 'raster',
        track: 'visual',
        params: { fit: 'cover' },
      },
    });

    expect(
      computeCanvasAspectReflowLayerUpdate({ layer, oldSize: OLD_SIZE, nextSize: NEXT_SIZE }),
    ).toBeNull();
  });

  it('scales manually placed overlay media position and size by canvas ratios', () => {
    const layer = visualLayer({
      id: 'overlay',
      transform: {
        position: { x: 480, y: 270 },
        scale: { x: 640, y: 360 },
        rotation: Math.PI / 8,
      },
    });

    const update = computeCanvasAspectReflowLayerUpdate({
      layer,
      oldSize: OLD_SIZE,
      nextSize: NEXT_SIZE,
    });

    expect(update?.transform?.position.x).toBeCloseTo(270);
    expect(update?.transform?.position.y).toBeCloseTo(480);
    expect(update?.transform?.scale.x).toBeCloseTo(360);
    expect(update?.transform?.scale.y).toBeCloseTo(640);
    expect(update?.transform?.rotation).toBe(layer.transform?.rotation);
  });

  it('scales text position and font size while preserving transform scale', () => {
    const layer = visualLayer({
      id: 'title',
      source: {
        sourceId: 'text:title',
        provider: 'text',
        track: 'visual',
        params: { text: 'Title', fontSize: 72, align: 'center' },
      },
      transform: {
        position: { x: 960, y: 540 },
        scale: { x: 1.2, y: 0.8 },
        rotation: 0.1,
      },
    });

    const update = computeCanvasAspectReflowLayerUpdate({
      layer,
      oldSize: OLD_SIZE,
      nextSize: NEXT_SIZE,
    });

    expect(update?.transform?.position).toEqual({ x: 540, y: 960 });
    expect(update?.transform?.scale).toEqual({ x: 1.2, y: 0.8 });
    expect(update?.transform?.rotation).toBe(0.1);
    expect(update?.textFontSize).toBe(72);
  });

  it('scales spectrum width and preserves negative vertical direction', () => {
    const layer = visualLayer({
      id: 'spectrum',
      source: {
        sourceId: 'generated:spectrum',
        provider: 'generated-visual',
        track: 'visual',
        params: { maxHeight: 0.26, gain: 0.9 },
      },
      transform: {
        position: { x: 0, y: 1080 },
        scale: { x: 1920, y: -540 },
        rotation: 0,
      },
    });

    const update = computeCanvasAspectReflowLayerUpdate({
      layer,
      oldSize: OLD_SIZE,
      nextSize: NEXT_SIZE,
    });

    expect(update?.transform?.position.x).toBeCloseTo(0);
    expect(update?.transform?.position.y).toBeCloseTo(1920);
    expect(update?.transform?.scale.x).toBeCloseTo(1080);
    expect(update?.transform?.scale.y).toBeCloseTo(-960);
  });

  it('skips audio, control, and system layers', () => {
    expect(
      computeCanvasAspectReflowLayerUpdate({
        layer: { id: 'audio', kind: 'audio', startTime: 0, duration: 10 },
        oldSize: OLD_SIZE,
        nextSize: NEXT_SIZE,
      }),
    ).toBeNull();
    expect(
      computeCanvasAspectReflowLayerUpdate({
        layer: {
          id: 'control',
          kind: 'control',
          startTime: 0,
          duration: 0,
          control: { role: 'scopeStart', params: { scopeRole: 'main' } },
        },
        oldSize: OLD_SIZE,
        nextSize: NEXT_SIZE,
      }),
    ).toBeNull();
    expect(
      computeCanvasAspectReflowLayerUpdate({
        layer: visualLayer({
          id: 'system-visual',
          control: { role: 'scopeStart', params: { isSystem: true } },
        }),
        oldSize: OLD_SIZE,
        nextSize: NEXT_SIZE,
      }),
    ).toBeNull();
  });
});

describe('UPDATE_CANVAS_SIZE canvas aspect reflow', () => {
  beforeEach(() => {
    engineStore.loadManifest(
      createProjectWithLayers([
        visualLayer({
          id: 'overlay',
          transform: {
            position: { x: 480, y: 270 },
            scale: { x: 640, y: 360 },
            rotation: 0,
          },
        }),
        visualLayer({
          id: 'title',
          source: {
            sourceId: 'text:title',
            provider: 'text',
            track: 'visual',
            params: { text: 'Title', fontSize: 72 },
          },
          transform: {
            position: { x: 960, y: 540 },
            scale: { x: 1, y: 1 },
            rotation: 0,
          },
        }),
      ]),
    );
  });

  it('updates canvas size and existing layer transforms in one intent', () => {
    engineStore.dispatchIntent({
      type: INTENT_TYPES.UPDATE_CANVAS_SIZE,
      width: NEXT_SIZE.width,
      height: NEXT_SIZE.height,
    });

    const manifest = engineStore.getManifest();
    expect(manifest.projectSettings.canvas.size).toEqual(NEXT_SIZE);
    expect(expectLayer(manifest, 'overlay').transform?.position).toEqual({ x: 270, y: 480 });
    expect(expectLayer(manifest, 'overlay').transform?.scale).toEqual({ x: 360, y: 640 });
    expect(expectLayer(manifest, 'title').transform?.position).toEqual({ x: 540, y: 960 });
    expect(getSourceParam(expectLayer(manifest, 'title'), 'fontSize')).toBe(72);
  });

  it('undo restores both canvas size and reflowed layer data', () => {
    engineStore.dispatchIntent({
      type: INTENT_TYPES.UPDATE_CANVAS_SIZE,
      width: NEXT_SIZE.width,
      height: NEXT_SIZE.height,
    });

    engineStore.undo();

    const manifest = engineStore.getManifest();
    expect(manifest.projectSettings.canvas.size).toEqual(OLD_SIZE);
    expect(expectLayer(manifest, 'overlay').transform?.position).toEqual({ x: 480, y: 270 });
    expect(expectLayer(manifest, 'overlay').transform?.scale).toEqual({ x: 640, y: 360 });
    expect(expectLayer(manifest, 'title').transform?.position).toEqual({ x: 960, y: 540 });
    expect(getSourceParam(expectLayer(manifest, 'title'), 'fontSize')).toBe(72);
  });

  it('does not double-adjust layers added after canvas resize in the same batch', () => {
    const mainScopeId = engineStore.getManifest().layerOrder.find((layerId) => {
      const layer = engineStore.getManifest().layers[layerId];
      return layer?.control?.role === 'scopeStart' && layer.control.params?.scopeRole === 'main';
    });

    if (!mainScopeId) {
      throw new Error('Main scope marker missing from fixture.');
    }

    engineStore.executeAtomicIntentBatch([
      {
        type: INTENT_TYPES.UPDATE_CANVAS_SIZE,
        width: NEXT_SIZE.width,
        height: NEXT_SIZE.height,
      },
      {
        type: INTENT_TYPES.ADD_LAYER,
        targetScopeId: mainScopeId,
        manifest: visualLayer({
          id: 'new-layer',
          transform: {
            position: { x: 100, y: 200 },
            scale: { x: 300, y: 400 },
            rotation: 0,
          },
        }),
      },
    ]);

    const manifest = engineStore.getManifest();
    expect(expectLayer(manifest, 'overlay').transform?.position).toEqual({ x: 270, y: 480 });
    expect(expectLayer(manifest, 'new-layer').transform?.position).toEqual({ x: 100, y: 200 });
    expect(expectLayer(manifest, 'new-layer').transform?.scale).toEqual({ x: 300, y: 400 });
  });
});
