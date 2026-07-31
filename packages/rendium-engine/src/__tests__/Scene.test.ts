import { describe, expect, it, vi } from 'vitest';
import type { ILayer, LayerConfig, MediaReadiness, RenderContext } from '../_contracts';
import { Scene } from '../core/Scene';

function createRenderableLayer(options: {
  id: string;
  startTime: number;
  duration: number;
  onUpdate?: (time: number) => void;
  onDraw?: (context: RenderContext) => void;
}): ILayer {
  return {
    id: options.id,
    kind: 'visual',
    startTime: options.startTime,
    duration: options.duration,
    opacity: 1,
    appearance: {
      visible: true,
      opacity: 1,
    },
    update: (time: number) => options.onUpdate?.(time),
    draw: (context: RenderContext) => options.onDraw?.(context),
    dispose: () => {},
    updateConfig: () => {},
    getConfig: () =>
      ({
        id: options.id,
        kind: 'visual',
        startTime: options.startTime,
        duration: options.duration,
      }) as LayerConfig,
  } as ILayer;
}

function createRenderContext(currentTime: number): Omit<RenderContext, 'state' | 'sceneRegistry'> {
  return {
    device: {} as GPUDevice,
    format: 'rgba8unorm',
    passEncoder: {} as GPURenderPassEncoder,
    currentTime,
    deltaTime: 0,
    resolution: { width: 1920, height: 1080 },
    viewportResolution: { width: 1920, height: 1080 },
    sampleRate: 44100,
  };
}

describe('Scene temporal clipping', () => {
  it('draws layers using time relative to their own startTime', () => {
    const scene = new Scene();
    const drawnLayerIds: string[] = [];

    scene.setLayers([
      createRenderableLayer({
        id: 'late-image',
        startTime: 10,
        duration: 5,
        onDraw: () => drawnLayerIds.push('late-image'),
      }),
    ]);

    scene.draw(createRenderContext(12));

    expect(drawnLayerIds).toEqual(['late-image']);
  });

  it('passes layer-local time into active layer updates', () => {
    const scene = new Scene();
    const updateTimes: number[] = [];

    scene.setLayers([
      createRenderableLayer({
        id: 'late-image',
        startTime: 10,
        duration: 5,
        onUpdate: (time) => updateTimes.push(time),
      }),
    ]);

    scene.update(12, 0);

    expect(updateTimes).toEqual([2]);
  });

  it('skips layers outside their startTime and duration window', () => {
    const scene = new Scene();
    const drawnLayerIds: string[] = [];

    scene.setLayers([
      createRenderableLayer({
        id: 'late-image',
        startTime: 10,
        duration: 5,
        onDraw: () => drawnLayerIds.push('late-image'),
      }),
    ]);

    scene.draw(createRenderContext(9));
    scene.draw(createRenderContext(15));

    expect(drawnLayerIds).toEqual([]);
  });
});

describe('Scene runtime ordering and media readiness', () => {
  function createRuntimeLayer(id: string): ILayer {
    return {
      id,
      kind: 'visual',
      startTime: 0,
      duration: 10,
      update: vi.fn(),
      updateConfig: vi.fn(),
      getConfig: vi.fn(() => ({}) as LayerConfig),
      dispose: vi.fn(),
    };
  }

  function createMediaLayer(options: {
    id: string;
    kind: 'visual' | 'audio';
    startTime: number;
    duration: number;
    visible?: boolean;
    isReady?: boolean;
    isSetup?: boolean;
    mediaReadiness?: MediaReadiness;
  }): ILayer {
    const layer: ILayer & {
      appearance?: { visible: boolean; opacity: number };
      draw?: ReturnType<typeof vi.fn>;
      isReady?: boolean;
      isSetup?: boolean;
      mediaReadiness?: MediaReadiness;
    } = {
      id: options.id,
      kind: options.kind,
      startTime: options.startTime,
      duration: options.duration,
      update: vi.fn(),
      updateConfig: vi.fn(),
      getConfig: vi.fn(() => ({}) as LayerConfig),
      dispose: vi.fn(),
    };

    if (options.kind === 'visual') {
      layer.appearance = { visible: options.visible ?? true, opacity: 1 };
      layer.draw = vi.fn();
      layer.isReady = options.isReady ?? true;
      if (options.mediaReadiness !== undefined) {
        layer.mediaReadiness = options.mediaReadiness;
      }
    } else {
      layer.isSetup = options.isSetup ?? true;
      if (options.mediaReadiness !== undefined) {
        layer.mediaReadiness = options.mediaReadiness;
      }
    }

    return layer;
  }

  it('reorders existing layer instances without disposing them', () => {
    const scene = new Scene();
    const first = createRuntimeLayer('first');
    const second = createRuntimeLayer('second');
    scene.setLayers([first, second]);

    scene.setLayerOrder(['second', 'first']);

    expect(scene.layers.map((layer) => layer.id)).toEqual(['second', 'first']);
    expect(first.dispose).not.toHaveBeenCalled();
    expect(second.dispose).not.toHaveBeenCalled();
  });

  it('rejects invalid layer order input', () => {
    const scene = new Scene();
    scene.setLayers([createRuntimeLayer('first'), createRuntimeLayer('second')]);

    expect(() => scene.setLayerOrder(['first'])).toThrow(/length mismatch/i);
    expect(() => scene.setLayerOrder(['first', 'first'])).toThrow(/duplicate/i);
    expect(() => scene.setLayerOrder(['first', 'missing'])).toThrow(/unknown id/i);
  });

  it('checks media readiness only for active timeline content', () => {
    const scene = new Scene();
    scene.setLayers([
      createMediaLayer({
        id: 'front-video',
        kind: 'visual',
        startTime: 0,
        duration: 5,
        isReady: true,
      }),
      createMediaLayer({
        id: 'back-video',
        kind: 'visual',
        startTime: 5,
        duration: 5,
        isReady: false,
      }),
      createMediaLayer({
        id: 'active-audio',
        kind: 'audio',
        startTime: 0,
        duration: 5,
        isSetup: true,
      }),
    ]);

    expect(scene.areActiveMediaLayersReady(2)).toBe(true);
    expect(scene.areActiveMediaLayersReady(6)).toBe(false);
  });

  it('ignores hidden visual readiness but gates active audio setup', () => {
    const scene = new Scene();
    scene.setLayers([
      createMediaLayer({
        id: 'hidden-video',
        kind: 'visual',
        startTime: 0,
        duration: 5,
        visible: false,
        isReady: false,
      }),
      createMediaLayer({
        id: 'active-audio',
        kind: 'audio',
        startTime: 0,
        duration: 5,
        isSetup: false,
      }),
    ]);

    expect(scene.areActiveMediaLayersReady(2)).toBe(false);
  });

  it('exposes failed media separately from media that is still loading', () => {
    const scene = new Scene();
    scene.setLayers([
      createMediaLayer({
        id: 'failed-video',
        kind: 'visual',
        startTime: 0,
        duration: 10,
        isReady: false,
        mediaReadiness: 'failed',
      }),
    ]);

    expect(scene.getActiveMediaLayersReadiness(2)).toBe('failed');
    expect(scene.areActiveMediaLayersReady(2)).toBe(false);

    scene.setLayers([
      createMediaLayer({
        id: 'failed-video',
        kind: 'visual',
        startTime: 0,
        duration: 10,
        isReady: false,
        mediaReadiness: 'failed',
      }),
      createMediaLayer({
        id: 'loading-video',
        kind: 'visual',
        startTime: 0,
        duration: 10,
        isReady: false,
        mediaReadiness: 'loading',
      }),
    ]);

    expect(scene.getActiveMediaLayersReadiness(2)).toBe('loading');
  });

  it('allows a ready silent video-audio layer while surfacing a failed audio source', () => {
    const scene = new Scene();
    scene.setLayers([
      createMediaLayer({
        id: 'silent-video-audio',
        kind: 'audio',
        startTime: 0,
        duration: 10,
        isSetup: false,
        mediaReadiness: 'ready',
      }),
    ]);

    expect(scene.getActiveMediaLayersReadiness(2)).toBe('ready');

    scene.setLayers([
      createMediaLayer({
        id: 'failed-audio',
        kind: 'audio',
        startTime: 0,
        duration: 10,
        isSetup: false,
        mediaReadiness: 'failed',
      }),
    ]);

    expect(scene.getActiveMediaLayersReadiness(2)).toBe('failed');
  });
});
