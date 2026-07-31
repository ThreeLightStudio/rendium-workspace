import type { EngineIntent, ILayerManifest, engineStore } from '@rendium/engine';
import { describe, expect, it } from 'vitest';

import {
  resolveAddCaptionTextCommand,
  resolveAddTitleTextCommand,
  resolveUpdateSelectedTextStyleCommand,
} from './textCommands';
import { resolveFirstChangedTimelineTime } from './timelineFocusCommands';

function createManifest(): {
  projectSettings: { canvas: { size: { width: number; height: number } } };
  layers: Record<string, ILayerManifest>;
  layerOrder: string[];
} {
  return {
    projectSettings: {
      canvas: {
        size: {
          width: 1920,
          height: 1080,
        },
      },
    },
    layers: {
      'scope-main': createScope('scope-main', 'main'),
      'scope-overlay': createScope('scope-overlay', 'overlay'),
      'scope-text': createScope('scope-text', 'text'),
      'text-1': {
        id: 'text-1',
        kind: 'visual',
        name: 'Existing text',
        startTime: 0,
        duration: 5,
        source: {
          sourceId: 'text:text-1',
          provider: 'text',
          track: 'visual',
          params: {
            text: 'Old',
            fontSize: 24,
          },
        },
      },
    },
    layerOrder: ['scope-main', 'scope-overlay', 'scope-text', 'text-1'],
  };
}

function createSnapshot() {
  return {
    width: 1920,
    height: 1080,
    duration: 180,
    projectDuration: 180,
    layers: [],
    layerOrder: [],
    hoveredLayerId: null,
    pxPerSec: 100,
    undoStackSize: 0,
    redoStackSize: 0,
  } as unknown as ReturnType<typeof engineStore.getSnapshot>;
}

function createEngineManifest() {
  return createManifest() as unknown as ReturnType<typeof engineStore.getManifest>;
}

function createScope(id: string, scopeRole: 'main' | 'overlay' | 'text'): ILayerManifest {
  return {
    id,
    kind: 'control',
    startTime: 0,
    duration: 10,
    control: {
      role: 'scopeStart',
      params: { scopeRole },
    },
  };
}

describe('text ProductCommands', () => {
  it('creates title and caption text manifests with product defaults', () => {
    const title = resolveAddTitleTextCommand({
      text: 'Launch Title',
      placement: 'top',
      durationSeconds: 6,
      manifest: createEngineManifest(),
      snapshot: createSnapshot(),
    });
    const caption = resolveAddCaptionTextCommand({
      text: 'Lower caption',
      manifest: createEngineManifest(),
      snapshot: createSnapshot(),
    });

    expect(title.success).toBe(true);
    expect(caption.success).toBe(true);
    if (!title.success || !caption.success) return;
    expect(title.intents[0]).toMatchObject({
      type: 'ADD_LAYER',
      targetScopeId: 'scope-text',
      manifest: {
        name: 'Launch Title',
        startTime: 0,
        duration: 6,
        transform: {
          position: { x: 960, y: 194.4 },
        },
      },
    });
    expect(caption.intents[0]).toMatchObject({
      type: 'ADD_LAYER',
      targetScopeId: 'scope-text',
      manifest: {
        name: 'Lower caption',
        duration: 5,
        transform: {
          position: { x: 960, y: expect.closeTo(885.6, 4) },
        },
      },
    });
  });

  it('updates selected text style through UPDATE_LAYER_PROPS', () => {
    const result = resolveUpdateSelectedTextStyleCommand({
      selectedLayerId: 'text-1',
      manifest: createEngineManifest(),
      patch: {
        text: 'New copy',
        fontSize: 64,
        color: [1, 0, 0, 1],
        position: { x: 100, y: 200 },
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.intents).toEqual([
      {
        type: 'UPDATE_LAYER_PROPS',
        layerId: 'text-1',
        patch: expect.objectContaining({
          source: expect.objectContaining({
            params: expect.objectContaining({
              text: 'New copy',
              fontSize: 64,
              color: [1, 0, 0, 1],
            }),
          }),
          transform: expect.objectContaining({
            position: { x: 100, y: 200 },
          }),
        }),
      },
    ]);
  });

  it('normalizes natural text style aliases into renderer-ready params', () => {
    const result = resolveUpdateSelectedTextStyleCommand({
      selectedLayerId: 'text-1',
      manifest: createEngineManifest(),
      patch: {
        textColor: 'white',
        stroke: true,
        strokeColor: 'black',
        strokeWidth: 4,
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.intents[0]).toMatchObject({
      type: 'UPDATE_LAYER_PROPS',
      layerId: 'text-1',
      patch: {
        source: expect.objectContaining({
          params: expect.objectContaining({
            color: [1, 1, 1, 1],
            outlineColor: [0, 0, 0, 1],
            outlineWidth: 4,
          }),
        }),
      },
    });
  });
});

describe('timeline focus ProductCommands', () => {
  it('resolves the earliest affected time from persisted edit intents', () => {
    const manifest = {
      ...createManifest(),
      layers: {
        ...createManifest().layers,
        'scope-main': {
          ...createScope('scope-main', 'main'),
          startTime: 10,
        },
        'image-1': {
          id: 'image-1',
          kind: 'visual',
          name: 'Image',
          startTime: 30,
          duration: 5,
        },
      },
      layerOrder: ['scope-main', 'image-1', 'scope-overlay', 'scope-text', 'text-1'],
    } as unknown as ReturnType<typeof engineStore.getManifest>;
    const intents: EngineIntent[] = [
      {
        type: 'UPDATE_TRANSFORM',
        layerId: 'image-1',
        position: { x: 100, y: 100 },
      },
      {
        type: 'CHANGE_START_TIME',
        layerId: 'image-1',
        startTime: 5,
      },
      {
        type: 'REORDER_LAYER',
        layerId: 'image-1',
        toIndex: 1,
      },
    ];

    expect(resolveFirstChangedTimelineTime({ intents, manifest })).toBe(15);
  });

  it('uses added layer placement time and ignores time-neutral project changes', () => {
    const manifest = {
      ...createManifest(),
      layers: {
        ...createManifest().layers,
        'scope-main': {
          ...createScope('scope-main', 'main'),
          startTime: 20,
        },
      },
    } as unknown as ReturnType<typeof engineStore.getManifest>;
    const intents: EngineIntent[] = [
      {
        type: 'RENAME_PROJECT',
        name: 'Next Project',
      },
      {
        type: 'ADD_LAYER',
        targetScopeId: 'scope-main',
        manifest: {
          id: 'new-image',
          kind: 'visual',
          startTime: 4,
          duration: 5,
        },
      },
    ];

    expect(resolveFirstChangedTimelineTime({ intents, manifest })).toBe(24);
  });
});
