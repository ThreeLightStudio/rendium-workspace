import { type ILayerManifest, INTENT_TYPES, type IProjectManifest } from '@rendium/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type TimelineEditLayer,
  type TimelineManifestLookup,
  buildSplitTimelineLayerIntents,
  buildTrimTimelineLayerEndIntents,
  buildTrimTimelineLayerStartIntents,
} from './timelineEditCommands';

function createVideoManifest(): TimelineManifestLookup {
  const scopeStart: ILayerManifest = {
    id: 'scope-1',
    kind: 'control',
    name: 'Scope 1',
    startTime: 0,
    duration: 30,
    control: { role: 'scopeStart' },
  };
  const videoLayer: ILayerManifest = {
    id: 'video-1',
    kind: 'visual',
    name: 'Video 1',
    startTime: 10,
    duration: 10,
    source: {
      sourceId: 'video-1-source',
      provider: 'video',
      track: 'visual',
      clipOffset: 2,
      params: { sourceUrl: 'video.mp4' },
    },
  };
  const audioLayer: ILayerManifest = {
    id: 'video-1-audio',
    kind: 'audio',
    name: 'Video 1 Audio',
    startTime: 10,
    duration: 10,
    source: {
      sourceId: 'video-1-audio-source',
      provider: 'video',
      track: 'audio',
      clipOffset: 2,
      params: { sourceUrl: 'video.mp4' },
    },
  };
  const scopeEnd: ILayerManifest = {
    id: 'scope-1-end',
    kind: 'control',
    name: 'Scope 1 End',
    startTime: 30,
    duration: 0,
    control: { role: 'scopeEnd', targetScopeId: 'scope-1' },
  };

  return {
    layers: {
      [scopeStart.id]: scopeStart,
      [videoLayer.id]: videoLayer,
      [audioLayer.id]: audioLayer,
      [scopeEnd.id]: scopeEnd,
    } as IProjectManifest['layers'],
    layerOrder: [scopeStart.id, videoLayer.id, audioLayer.id, scopeEnd.id],
  };
}

function createVideoEditLayer(): TimelineEditLayer {
  return {
    id: 'video-1',
    startTime: 10,
    duration: 10,
  };
}

function createVideoAudioEditLayer(): TimelineEditLayer {
  return {
    id: 'video-1-audio',
    startTime: 10,
    duration: 10,
  };
}

function createStandaloneAudioManifest(): TimelineManifestLookup {
  const videoManifest = createVideoManifest();
  const scopeStart = videoManifest.layers['scope-1'];
  const scopeEnd = videoManifest.layers['scope-1-end'];
  const audioLayer: ILayerManifest = {
    id: 'music-audio',
    kind: 'audio',
    name: 'Music Bed',
    startTime: 10,
    duration: 10,
    source: {
      sourceId: 'music-source',
      provider: 'audio-file',
      track: 'audio',
      clipOffset: 2,
      params: { sourceUrl: 'music.mp3' },
    },
  };

  return {
    layers: {
      [scopeStart.id]: scopeStart,
      [audioLayer.id]: audioLayer,
      [scopeEnd.id]: scopeEnd,
    } as IProjectManifest['layers'],
    layerOrder: [scopeStart.id, audioLayer.id, scopeEnd.id],
  };
}

function createStandaloneAudioEditLayer(): TimelineEditLayer {
  return {
    id: 'music-audio',
    startTime: 10,
    duration: 10,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('timeline edit commands', () => {
  it('splits a video layer with its paired audio layer', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = buildSplitTimelineLayerIntents(
      createVideoManifest(),
      createVideoEditLayer(),
      15,
    );

    expect(result).not.toBeNull();
    expect(result?.createdLayerId).toBe('video-1-split-123-i');
    expect(result?.intents).toHaveLength(4);
    expect(result?.intents[0]).toEqual({
      type: INTENT_TYPES.CHANGE_DURATION,
      layerId: 'video-1',
      duration: 5,
    });
    expect(result?.intents[2]).toEqual({
      type: INTENT_TYPES.CHANGE_DURATION,
      layerId: 'video-1-audio',
      duration: 5,
    });
    expect(result?.intents[3]).toMatchObject({
      type: INTENT_TYPES.ADD_LAYER,
      targetScopeId: 'scope-1',
      manifest: {
        id: 'video-1-split-123-i-audio',
        kind: 'audio',
        startTime: 15,
        duration: 5,
        source: {
          clipOffset: 7,
          provider: 'video',
          track: 'audio',
        },
      },
    });
  });

  it('keeps video-only split behavior when paired audio is missing', () => {
    const manifestWithAudio = createVideoManifest();
    const manifest: TimelineManifestLookup = {
      layers: Object.fromEntries(
        Object.entries(manifestWithAudio.layers).filter(([layerId]) => layerId !== 'video-1-audio'),
      ) as IProjectManifest['layers'],
      layerOrder: manifestWithAudio.layerOrder.filter((layerId) => layerId !== 'video-1-audio'),
    };

    const result = buildSplitTimelineLayerIntents(manifest, createVideoEditLayer(), 15);

    expect(result).not.toBeNull();
    expect(result?.intents).toHaveLength(2);
    expect(result?.intents[0]).toMatchObject({
      type: INTENT_TYPES.CHANGE_DURATION,
      layerId: 'video-1',
      duration: 5,
    });
    expect(result?.intents[1]).toMatchObject({
      type: INTENT_TYPES.ADD_LAYER,
      manifest: {
        kind: 'visual',
        startTime: 15,
        duration: 5,
        source: { clipOffset: 7 },
      },
    });
  });

  it('trims a video layer start with its paired audio layer', () => {
    const intents = buildTrimTimelineLayerStartIntents(
      createVideoManifest(),
      createVideoEditLayer(),
      13,
    );

    expect(intents).toEqual([
      { type: INTENT_TYPES.CHANGE_START_TIME, layerId: 'video-1', startTime: 13 },
      { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1', duration: 7 },
      {
        type: INTENT_TYPES.UPDATE_LAYER_PROPS,
        layerId: 'video-1',
        patch: {
          source: {
            sourceId: 'video-1-source',
            provider: 'video',
            track: 'visual',
            clipOffset: 5,
            params: { sourceUrl: 'video.mp4' },
          },
        },
      },
      { type: INTENT_TYPES.CHANGE_START_TIME, layerId: 'video-1-audio', startTime: 13 },
      { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1-audio', duration: 7 },
      {
        type: INTENT_TYPES.UPDATE_LAYER_PROPS,
        layerId: 'video-1-audio',
        patch: {
          source: {
            sourceId: 'video-1-audio-source',
            provider: 'video',
            track: 'audio',
            clipOffset: 5,
            params: { sourceUrl: 'video.mp4' },
          },
        },
      },
    ]);
  });

  it('trims a video layer end with its paired audio layer', () => {
    const intents = buildTrimTimelineLayerEndIntents(
      createVideoManifest(),
      createVideoEditLayer(),
      17,
    );

    expect(intents).toEqual([
      { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1', duration: 7 },
      { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1-audio', duration: 7 },
    ]);
  });

  it('trims a linked audio layer with its video using the same paired intents', () => {
    const startIntents = buildTrimTimelineLayerStartIntents(
      createVideoManifest(),
      createVideoAudioEditLayer(),
      13,
    );
    const endIntents = buildTrimTimelineLayerEndIntents(
      createVideoManifest(),
      createVideoAudioEditLayer(),
      17,
    );

    expect(startIntents).toEqual(
      expect.arrayContaining([
        { type: INTENT_TYPES.CHANGE_START_TIME, layerId: 'video-1-audio', startTime: 13 },
        { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1-audio', duration: 7 },
        { type: INTENT_TYPES.CHANGE_START_TIME, layerId: 'video-1', startTime: 13 },
        { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1', duration: 7 },
      ]),
    );
    expect(endIntents).toEqual(
      expect.arrayContaining([
        { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1-audio', duration: 7 },
        { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1', duration: 7 },
      ]),
    );
  });

  it('keeps standalone audio trim intents independent', () => {
    const manifest = createStandaloneAudioManifest();
    const startIntents = buildTrimTimelineLayerStartIntents(
      manifest,
      createStandaloneAudioEditLayer(),
      13,
    );
    const endIntents = buildTrimTimelineLayerEndIntents(
      manifest,
      createStandaloneAudioEditLayer(),
      17,
    );

    expect(startIntents).toEqual([
      { type: INTENT_TYPES.CHANGE_START_TIME, layerId: 'music-audio', startTime: 13 },
      { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'music-audio', duration: 7 },
      {
        type: INTENT_TYPES.UPDATE_LAYER_PROPS,
        layerId: 'music-audio',
        patch: {
          source: {
            sourceId: 'music-source',
            provider: 'audio-file',
            track: 'audio',
            clipOffset: 5,
            params: { sourceUrl: 'music.mp3' },
          },
        },
      },
    ]);
    expect(endIntents).toEqual([
      { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'music-audio', duration: 7 },
    ]);
  });

  it('splits a linked audio layer into the same canonical video/audio pair ids', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = buildSplitTimelineLayerIntents(
      createVideoManifest(),
      createVideoAudioEditLayer(),
      15,
    );

    expect(result?.createdLayerId).toBe('video-1-split-123-i-audio');
    expect(result?.intents).toEqual(
      expect.arrayContaining([
        { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1-audio', duration: 5 },
        { type: INTENT_TYPES.CHANGE_DURATION, layerId: 'video-1', duration: 5 },
        expect.objectContaining({
          type: INTENT_TYPES.ADD_LAYER,
          manifest: expect.objectContaining({ id: 'video-1-split-123-i-audio' }),
        }),
        expect.objectContaining({
          type: INTENT_TYPES.ADD_LAYER,
          manifest: expect.objectContaining({ id: 'video-1-split-123-i' }),
        }),
      ]),
    );
  });
});
