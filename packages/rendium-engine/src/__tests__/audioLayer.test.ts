import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioLayer } from '../layers/audio/AudioLayer';

describe('AudioLayer persistence', () => {
beforeEach(() => {
  AudioLayer.setRealtimePlaybackEnabled(true);
  Object.assign(AudioLayer as unknown as Record<string, unknown>, { _sharedContext: null });
});

afterEach(() => {
  AudioLayer.setRealtimePlaybackEnabled(true);
  Object.assign(AudioLayer as unknown as Record<string, unknown>, { _sharedContext: null });
  vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('includes sourceUrl in serialized config', () => {
    const layer = new AudioLayer('audio-layer');
    layer.sourceUrl = '/mock/path/Music/example.wav';

    expect(layer.getConfig().sourceUrl).toBe('/mock/path/Music/example.wav');
  });

  it('stores sourceUrl when updated through config', () => {
    const layer = new AudioLayer('audio-layer');

    layer.updateConfig({
      sourceUrl: '/mock/path/Music/example.wav',
    });

    expect(layer.sourceUrl).toBe('/mock/path/Music/example.wav');
    expect(layer.getConfig().sourceUrl).toBe('/mock/path/Music/example.wav');
  });

  it('treats a missing audio track from a video as ready silent media', async () => {
    const decodeAudioData = vi.fn().mockRejectedValue(new Error('No audio track'));
    Object.assign(AudioLayer as unknown as Record<string, unknown>, {
      _sharedContext: { state: 'running', decodeAudioData },
    });
    vi.stubGlobal('api', { readFileAsArrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) });

    const layer = new AudioLayer('video-audio-layer', true);
    layer.sourceUrl = 'rendium-asset://project-1/files/silent.mov';

    await layer.initAudio();

    expect(decodeAudioData).toHaveBeenCalledTimes(1);
    expect(layer.mediaReadiness).toBe('ready');
    expect(layer.isSetup).toBe(true);
  });

  it('stops waiting for an undecodable video audio track', async () => {
    vi.useFakeTimers();
    const decodeAudioData = vi.fn(() => new Promise<AudioBuffer>(() => undefined));
    Object.assign(AudioLayer as unknown as Record<string, unknown>, {
      _sharedContext: { state: 'running', decodeAudioData },
    });
    vi.stubGlobal('api', { readFileAsArrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) });

    const layer = new AudioLayer('video-audio-layer', true);
    layer.sourceUrl = 'rendium-asset://project-1/files/silent.mov';

    const initialization = layer.initAudio();
    await vi.advanceTimersByTimeAsync(8_000);
    await initialization;

    expect(decodeAudioData).toHaveBeenCalledTimes(1);
    expect(layer.mediaReadiness).toBe('ready');
    expect(layer.isSetup).toBe(true);
    vi.useRealTimers();
  });

  it('surfaces a failed standalone audio source', async () => {
    const decodeAudioData = vi.fn().mockRejectedValue(new Error('Unsupported audio codec'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.assign(AudioLayer as unknown as Record<string, unknown>, {
      _sharedContext: { state: 'running', decodeAudioData },
    });
    vi.stubGlobal('api', { readFileAsArrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) });

    const layer = new AudioLayer('audio-layer');
    layer.sourceUrl = 'rendium-asset://project-1/files/unsupported.wav';

    await layer.initAudio();

    expect(layer.mediaReadiness).toBe('failed');
    expect(layer.isSetup).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      'AudioLayer: Failed to load/decode audio',
      expect.any(Error),
    );
  });

  it('suspends realtime playback during export and resumes afterward', async () => {
    const createBufferSource = vi.fn(() => ({
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }));
    const createGain = vi.fn(() => ({
      gain: {
        value: 1,
        setTargetAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }));
    const createAnalyser = vi.fn(() => ({
      fftSize: 4096,
      smoothingTimeConstant: 0.8,
      frequencyBinCount: 2048,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteFrequencyData: vi.fn(),
    }));

    class MockAudioContext {
      public state: AudioContextState = 'running';
      public currentTime = 0;
      public sampleRate = 44100;
      public destination = {};

      public resume = vi.fn(async () => {
        this.state = 'running';
      });

      public suspend = vi.fn(async () => {
        this.state = 'suspended';
      });

      public decodeAudioData = vi.fn();
      public createBufferSource = createBufferSource;
      public createGain = createGain;
      public createAnalyser = createAnalyser;
    }

    vi.stubGlobal('AudioContext', MockAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext as unknown as typeof AudioContext);

    await AudioLayer.resumeSharedContext();
    const suspended = await AudioLayer.suspendSharedContext();
    expect(suspended).toBe(true);

    const layer = new AudioLayer('audio-layer');
    Object.assign(layer as unknown as Record<string, unknown>, {
      _isSetup: true,
      _buffer: { duration: 2, sampleRate: 44100, numberOfChannels: 2 } as unknown as AudioBuffer,
      startTime: 0,
      duration: 2,
      clipOffset: 0,
      muted: false,
      volume: 1,
    });

    AudioLayer.setRealtimePlaybackEnabled(false);
    layer.update(1, 1 / 60);
    expect(createBufferSource).not.toHaveBeenCalled();

    AudioLayer.setRealtimePlaybackEnabled(true);
    await AudioLayer.resumeSharedContext();
    layer.update(1, 1 / 60);
    expect(createBufferSource).toHaveBeenCalledTimes(1);
  });

  it('treats update time as layer-local playback time', async () => {
    class MockAudioContext {
      public state: AudioContextState = 'running';
      public currentTime = 0;
      public createBufferSource = vi.fn();
      public createGain = vi.fn();
      public createAnalyser = vi.fn();
      public resume = vi.fn(async () => undefined);
      public suspend = vi.fn(async () => undefined);
    }

    vi.stubGlobal('AudioContext', MockAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext as unknown as typeof AudioContext);

    await AudioLayer.resumeSharedContext();

    const layer = new AudioLayer('audio-layer');
    Object.assign(layer as unknown as Record<string, unknown>, {
      _isSetup: true,
      _buffer: { duration: 12, sampleRate: 44100, numberOfChannels: 2 } as unknown as AudioBuffer,
      startTime: 10,
      duration: 5,
      clipOffset: 3,
      muted: false,
      volume: 1,
    });
    const startPlayback = vi
      .spyOn(
        layer as unknown as {
          _startPlayback: (offset: number, elapsed: number) => void;
        },
        '_startPlayback',
      )
      .mockImplementation(() => undefined);

    layer.update(2, 1 / 60);

    expect(startPlayback).toHaveBeenCalledWith(5, 2);
  });

  it('logs unexpected stop cleanup errors with layer context', () => {
    const cleanupError = new Error('disconnect failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const layer = new AudioLayer('audio-layer');

    Object.assign(layer as unknown as Record<string, unknown>, {
      _sourceNode: {
        stop: vi.fn(() => {
          throw cleanupError;
        }),
        disconnect: vi.fn(),
      },
    });

    layer.dispose();

    expect(consoleError).toHaveBeenCalledWith('[AudioLayer] Failed to stop playback cleanly', {
      layerId: 'audio-layer',
      stage: 'immediate',
      error: cleanupError,
    });
  });

  it('keeps already-stopped cleanup errors quiet', () => {
    const alreadyStoppedError = new Error('already stopped');
    alreadyStoppedError.name = 'InvalidStateError';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const layer = new AudioLayer('audio-layer');

    Object.assign(layer as unknown as Record<string, unknown>, {
      _sourceNode: {
        stop: vi.fn(() => {
          throw alreadyStoppedError;
        }),
        disconnect: vi.fn(),
      },
    });

    layer.dispose();

    expect(consoleError).not.toHaveBeenCalled();
  });
});
