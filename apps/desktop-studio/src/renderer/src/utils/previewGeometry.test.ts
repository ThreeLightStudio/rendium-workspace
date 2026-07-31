import {
  type ILayer,
  type ILayerManifest,
  buildTransformMatrix,
  createQuadFromBounds,
  engineStore,
  transformQuad,
} from '@rendium/engine';
import { describe, expect, it } from 'vitest';
import {
  type PreviewFrame,
  buildGroupBoundsFrame,
  buildPreviewFrame,
  pointInQuad,
  resizeQuadFromHandle,
  rotateQuadAround,
  updateSingleFrameFromMove,
} from './previewGeometry';

function createFrame(
  id: string,
  quad: PreviewFrame['quad'],
  overrides: Partial<PreviewFrame> = {},
): PreviewFrame {
  const origin = quad[0];
  const center = {
    x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
    y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4,
  };

  return {
    id,
    type: 'test',
    quad,
    origin,
    center,
    xAxis: { x: quad[1].x - quad[0].x, y: quad[1].y - quad[0].y },
    yAxis: { x: quad[3].x - quad[0].x, y: quad[3].y - quad[0].y },
    bounds: {
      left: Math.min(...quad.map((point) => point.x)),
      top: Math.min(...quad.map((point) => point.y)),
      width: Math.max(...quad.map((point) => point.x)) - Math.min(...quad.map((point) => point.x)),
      height: Math.max(...quad.map((point) => point.y)) - Math.min(...quad.map((point) => point.y)),
    },
    rotation: 0,
    width: 10,
    height: 10,
    scaleReference: { width: 10, height: 10 },
    scaleSign: { x: 1, y: 1 },
    anchorMode: 'topLeft',
    anchor: { x: 0, y: 0 },
    isSelectable: true,
    name: id,
    ...overrides,
  };
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function edgeLength(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function createRenderableLayer(id: string): ILayer {
  return {
    id,
    kind: 'visual',
    name: id,
    startTime: 0,
    duration: 5,
    position: { x: 10, y: 20 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    visible: true,
    opacity: 1,
    width: 100,
    height: 50,
    appearance: { visible: true, opacity: 1 },
    transform: {
      position: { x: 10, y: 20 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      _localMatrix: new Float32Array(9),
    },
    draw: () => undefined,
    update: () => undefined,
    dispose: () => undefined,
    updateConfig: () => undefined,
    getConfig: () => ({}),
  } as unknown as ILayer;
}

function loadPreviewManifest(
  layers: ILayerManifest[],
  layerOrder = layers.map((layer) => layer.id),
) {
  engineStore.loadManifest({
    version: '1.0',
    projectInfo: { name: 'Preview Geometry', createdAt: 0, updatedAt: 0 },
    projectSettings: { canvas: { size: { width: 1920, height: 1080 } } },
    layers: Object.fromEntries(layers.map((layer) => [layer.id, layer])),
    layerOrder,
    links: {},
  });
}

describe('previewGeometry', () => {
  it('builds preview frames from canonical visual manifests', () => {
    loadPreviewManifest([
      {
        id: 'image-1',
        kind: 'visual',
        startTime: 0,
        duration: 5,
        source: {
          sourceId: 'rendium-asset://project/files/hash.png',
          provider: 'raster',
          track: 'visual',
          params: { fit: 'contain' },
        },
        transform: {
          position: { x: 10, y: 20 },
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
        appearance: { visible: true, opacity: 1 },
      },
    ]);

    const frame = buildPreviewFrame(createRenderableLayer('image-1'), 1920, 1080);

    expect(frame?.id).toBe('image-1');
    expect(frame?.type).toBe('image');
    expect(frame?.isSelectable).toBe(true);
  });

  it('uses the rendered image layout size for image preview frames', () => {
    loadPreviewManifest([
      {
        id: 'image-layout',
        kind: 'visual',
        startTime: 0,
        duration: 5,
        source: {
          sourceId: 'rendium-asset://project/files/hash.png',
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
      },
    ]);

    const frame = buildPreviewFrame(
      {
        ...createRenderableLayer('image-layout'),
        width: 2752,
        height: 1536,
      } as ILayer,
      1920,
      1080,
    );

    expect(frame?.width).toBeCloseTo(1920);
    expect(frame?.height).toBeCloseTo(1071.628);
    expect(frame?.bounds.left).toBeCloseTo(10);
    expect(frame?.bounds.top).toBeCloseTo(24.186);
  });

  it('uses video source metadata for video preview frames before runtime metadata loads', () => {
    loadPreviewManifest([
      {
        id: 'video-layout',
        kind: 'visual',
        startTime: 0,
        duration: 5,
        source: {
          sourceId: 'rendium-asset://project/files/hash.mp4',
          provider: 'video',
          track: 'visual',
          params: {
            sourceWidth: 1280,
            sourceHeight: 720,
            fit: 'contain',
          },
        },
        transform: {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
        appearance: { visible: true, opacity: 1 },
      },
    ]);

    const frame = buildPreviewFrame(
      {
        ...createRenderableLayer('video-layout'),
        position: { x: 0, y: 0 },
        width: 1,
        height: 1,
      } as ILayer,
      1920,
      1080,
    );

    expect(frame?.type).toBe('video');
    expect(frame?.width).toBeCloseTo(1920);
    expect(frame?.height).toBeCloseTo(1080);
    expect(frame?.bounds.left).toBeCloseTo(0);
    expect(frame?.bounds.top).toBeCloseTo(0);
  });

  it('does not build preview frames for audio or scope control manifests', () => {
    (globalThis as { window?: unknown }).window ??= {};
    loadPreviewManifest([
      {
        id: 'audio-1',
        kind: 'audio',
        startTime: 0,
        duration: 5,
        source: {
          sourceId: 'audio:audio-1',
          provider: 'audio-file',
          track: 'audio',
          params: {},
        },
      },
      {
        id: 'scope-1',
        kind: 'control',
        startTime: 0,
        duration: 5,
        control: { role: 'scopeStart', params: { scopeRole: 'main' } },
      },
    ]);

    expect(
      buildPreviewFrame({ ...createRenderableLayer('audio-1'), kind: 'audio' }, 1920, 1080),
    ).toBeNull();
    expect(buildPreviewFrame(createRenderableLayer('scope-1'), 1920, 1080)).toBeNull();
  });

  it('detects points inside and outside a quad', () => {
    const quad: PreviewFrame['quad'] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    expect(pointInQuad({ x: 5, y: 5 }, quad)).toBe(true);
    expect(pointInQuad({ x: 15, y: 5 }, quad)).toBe(false);
  });

  it('resizes a quad from the south-east handle while preserving aspect ratio', () => {
    const frame = createFrame('layer-1', [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]);

    const nextQuad = resizeQuadFromHandle(frame, 'se', { x: 40, y: 16 });

    expect(nextQuad[0]).toEqual({ x: 0, y: 0 });
    expect(nextQuad[1]).toEqual({ x: 40, y: 0 });
    expect(nextQuad[2]).toEqual({ x: 40, y: 20 });
    expect(edgeLength(nextQuad[0], nextQuad[1]) / edgeLength(nextQuad[0], nextQuad[3])).toBeCloseTo(
      2,
      6,
    );
  });

  it('resizes a quad from the north-east handle while preserving aspect ratio', () => {
    const frame = createFrame('layer-2', [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]);

    const nextQuad = resizeQuadFromHandle(frame, 'ne', { x: 40, y: -5 });

    expect(nextQuad[3]).toEqual({ x: 0, y: 10 });
    expect(nextQuad[0]).toEqual({ x: 0, y: -10 });
    expect(nextQuad[1]).toEqual({ x: 40, y: -10 });
    expect(nextQuad[2]).toEqual({ x: 40, y: 10 });
    expect(edgeLength(nextQuad[0], nextQuad[1]) / edgeLength(nextQuad[0], nextQuad[3])).toBeCloseTo(
      2,
      6,
    );
  });

  it('resizes a quad from the east handle while changing width only', () => {
    const frame = createFrame('layer-3', [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]);

    const nextQuad = resizeQuadFromHandle(frame, 'e', { x: 50, y: 999 });

    expect(nextQuad[0]).toEqual({ x: 0, y: 0 });
    expect(nextQuad[1]).toEqual({ x: 50, y: 0 });
    expect(nextQuad[2]).toEqual({ x: 50, y: 10 });
    expect(nextQuad[3]).toEqual({ x: 0, y: 10 });
  });

  it('resizes a rotated quad from the north handle in local space', () => {
    const center = { x: 10, y: 5 };
    const frame = createFrame(
      'layer-rotated',
      rotateQuadAround(
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 10 },
          { x: 0, y: 10 },
        ],
        center,
        Math.PI / 4,
      ),
    );
    const targetQuad = rotateQuadAround(
      [
        { x: 0, y: -4 },
        { x: 20, y: -4 },
        { x: 20, y: 14 },
        { x: 0, y: 14 },
      ],
      center,
      Math.PI / 4,
    );

    const nextQuad = resizeQuadFromHandle(frame, 'n', midpoint(targetQuad[0], targetQuad[1]));

    expect(edgeLength(nextQuad[0], nextQuad[1])).toBeCloseTo(20, 6);
    expect(nextQuad[2].x).toBeCloseTo(frame.quad[2].x, 6);
    expect(nextQuad[2].y).toBeCloseTo(frame.quad[2].y, 6);
    expect(nextQuad[3].x).toBeCloseTo(frame.quad[3].x, 6);
    expect(nextQuad[3].y).toBeCloseTo(frame.quad[3].y, 6);
    expect(edgeLength(nextQuad[0], nextQuad[3])).toBeGreaterThan(
      edgeLength(frame.quad[0], frame.quad[3]),
    );
  });

  it('clamps edge resizing to the minimum dimension', () => {
    const frame = createFrame('layer-min', [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]);

    const nextQuad = resizeQuadFromHandle(frame, 'e', { x: 1, y: 999 });

    expect(edgeLength(nextQuad[0], nextQuad[1])).toBe(4);
    expect(edgeLength(nextQuad[0], nextQuad[3])).toBe(10);
  });

  it('builds a group bounds frame around multiple quads', () => {
    const frameA = createFrame('layer-a', [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 30 },
    ]);
    const frameB = createFrame('layer-b', [
      { x: 40, y: 5 },
      { x: 60, y: 5 },
      { x: 60, y: 25 },
      { x: 40, y: 25 },
    ]);

    const groupFrame = buildGroupBoundsFrame([frameA, frameB]);

    expect(groupFrame).not.toBeNull();
    expect(groupFrame?.bounds).toEqual({
      left: 10,
      top: 5,
      width: 50,
      height: 25,
    });
    expect(groupFrame?.isSelectable).toBe(false);
  });

  it('resizes a quad from the west handle while keeping the opposite side fixed', () => {
    const frame = createFrame('layer-4', [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]);

    const nextQuad = resizeQuadFromHandle(frame, 'w', { x: -5, y: 100 });

    expect(nextQuad[1]).toEqual({ x: 20, y: 0 });
    expect(nextQuad[2]).toEqual({ x: 20, y: 10 });
    expect(nextQuad[0]).toEqual({ x: -5, y: 0 });
    expect(nextQuad[3]).toEqual({ x: -5, y: 10 });
  });

  it('keeps rotated frames from jumping when move begins', () => {
    const bounds = { left: 0, top: 0, width: 120, height: 60 };
    const transform = {
      position: { x: 240, y: 180 },
      scale: { x: 1.2, y: 0.8 },
      rotation: Math.PI / 5,
    };
    const matrix = buildTransformMatrix(transform, {
      bounds,
      anchor: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    });
    const quad = transformQuad(createQuadFromBounds(bounds), matrix);
    const frame = createFrame('layer-rotated', quad, {
      width: bounds.width,
      height: bounds.height,
      scaleReference: { width: bounds.width, height: bounds.height },
      scaleSign: { x: 1, y: 1 },
      anchorMode: 'topLeft',
      anchor: { x: 0, y: 0 },
    });

    const delta = { x: 14, y: -8 };
    const nextTransform = updateSingleFrameFromMove(frame, delta);
    const nextMatrix = buildTransformMatrix(
      {
        position: nextTransform.position ?? { x: 0, y: 0 },
        scale: nextTransform.scale ?? { x: 1, y: 1 },
        rotation: nextTransform.rotation ?? 0,
      },
      {
        bounds,
        anchor: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      },
    );
    const nextQuad = transformQuad(createQuadFromBounds(bounds), nextMatrix);

    expect(nextTransform.position?.x).toBeCloseTo(transform.position.x + delta.x, 4);
    expect(nextTransform.position?.y).toBeCloseTo(transform.position.y + delta.y, 4);
    expect(nextTransform.rotation).toBeCloseTo(transform.rotation, 4);
    expect(nextTransform.scale?.x).toBeCloseTo(transform.scale.x, 4);
    expect(nextTransform.scale?.y).toBeCloseTo(transform.scale.y, 4);
    expect(nextQuad[0].x - quad[0].x).toBeCloseTo(delta.x, 4);
    expect(nextQuad[0].y - quad[0].y).toBeCloseTo(delta.y, 4);
    expect(nextQuad[2].x - quad[2].x).toBeCloseTo(delta.x, 4);
    expect(nextQuad[2].y - quad[2].y).toBeCloseTo(delta.y, 4);
  });
});
