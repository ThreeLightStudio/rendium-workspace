import { type ILayerManifest, INTENT_TYPES } from '@rendium/engine';
import { describe, expect, it } from 'vitest';
import {
  buildDeleteSelectionIntents,
  buildDuplicateSelectionBatch,
  buildNudgeSelectionIntents,
} from './selectionActions';

function createLayer(overrides: Partial<ILayerManifest> = {}): ILayerManifest {
  return {
    id: 'layer-1',
    kind: 'visual',
    startTime: 0,
    duration: 5,
    transform: {
      position: { x: 10, y: 20 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    },
    appearance: {
      visible: true,
      opacity: 1,
    },
    source: {
      sourceId: 'text:layer-1',
      provider: 'text',
      track: 'visual',
      params: {
        text: 'Hello',
      },
    },
    ...overrides,
  };
}

describe('selectionActions', () => {
  it('builds delete intents for deletable layers only', () => {
    const manifest = {
      layers: {
        'layer-1': createLayer(),
        anchor: createLayer({
          id: 'anchor',
          kind: 'control',
          control: { role: 'scopeStart', params: { isProjectAnchor: true } },
        }),
      },
    };

    const intents = buildDeleteSelectionIntents(['layer-1', 'anchor'], manifest);

    expect(intents).toEqual([
      {
        type: INTENT_TYPES.REMOVE_LAYER,
        layerId: 'layer-1',
      },
    ]);
  });

  it('deletes an imported video and its linked audio together from either layer', () => {
    const video = createLayer({
      id: 'video-1',
      source: {
        sourceId: 'video-1-source',
        provider: 'video',
        track: 'visual',
        params: { sourceUrl: 'recording.mov' },
      },
    });
    const linkedAudio: ILayerManifest = {
      id: 'video-1-audio',
      kind: 'audio',
      startTime: 0,
      duration: 5,
      source: {
        sourceId: 'video-1-audio-source',
        provider: 'video',
        track: 'audio',
        params: { sourceUrl: 'recording.mov' },
      },
    };
    const music: ILayerManifest = {
      id: 'music-audio',
      kind: 'audio',
      startTime: 0,
      duration: 5,
      source: {
        sourceId: 'music-source',
        provider: 'audio-file',
        track: 'audio',
        params: { sourceUrl: 'music.mp3' },
      },
    };
    const manifest = {
      layers: { [video.id]: video, [linkedAudio.id]: linkedAudio, [music.id]: music },
    };

    expect(buildDeleteSelectionIntents([video.id], manifest)).toEqual([
      { type: INTENT_TYPES.REMOVE_LAYER, layerId: 'video-1' },
      { type: INTENT_TYPES.REMOVE_LAYER, layerId: 'video-1-audio' },
    ]);
    expect(buildDeleteSelectionIntents([linkedAudio.id], manifest)).toEqual([
      { type: INTENT_TYPES.REMOVE_LAYER, layerId: 'video-1-audio' },
      { type: INTENT_TYPES.REMOVE_LAYER, layerId: 'video-1' },
    ]);
    expect(buildDeleteSelectionIntents([music.id], manifest)).toEqual([
      { type: INTENT_TYPES.REMOVE_LAYER, layerId: 'music-audio' },
    ]);
  });

  it('duplicates selectable layers with a stable offset', () => {
    const manifest = {
      layers: {
        'layer-1': createLayer(),
      },
    };

    const { intents, createdLayerIds } = buildDuplicateSelectionBatch(['layer-1'], manifest, 16);

    expect(createdLayerIds).toHaveLength(1);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      type: INTENT_TYPES.ADD_LAYER,
      manifest: {
        kind: 'visual',
        source: expect.objectContaining({
          provider: 'text',
          params: expect.objectContaining({
            text: 'Hello',
          }),
        }),
        transform: {
          position: {
            x: 26,
            y: 36,
          },
        },
      },
    });
    const duplicateIntent = intents[0];
    if (duplicateIntent?.type === INTENT_TYPES.ADD_LAYER) {
      expect(duplicateIntent.manifest.id).toBe(createdLayerIds[0]);
    }
  });

  it('nudges transform-bearing layers using update transform intents', () => {
    const manifest = {
      layers: {
        'layer-1': createLayer(),
        audio: {
          id: 'audio',
          kind: 'audio',
          startTime: 0,
          duration: 5,
          source: {
            sourceId: 'audio:audio',
            provider: 'audio-file',
            track: 'audio',
            params: {},
          },
        } as ILayerManifest,
      },
    };

    const intents = buildNudgeSelectionIntents(['layer-1', 'audio'], manifest, {
      x: 4,
      y: -2,
    });

    expect(intents).toEqual([
      {
        type: INTENT_TYPES.UPDATE_TRANSFORM,
        layerId: 'layer-1',
        position: {
          x: 14,
          y: 18,
        },
      },
    ]);
  });
});
