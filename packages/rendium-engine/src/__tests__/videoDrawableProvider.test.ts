import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MediaReadiness } from '../_contracts';
import { AudioLayer } from '../layers/audio/AudioLayer';
import { VisualLayer } from '../layers/visual/VisualLayer';
import { VideoDrawableProvider } from '../layers/visual/providers/VideoDrawableProvider';

type VideoFrameRequestCallback = (
  now: DOMHighResTimeStamp,
  metadata: VideoFrameCallbackMetadata,
) => void;

type MockVideoElement = {
  currentTime: number;
  paused: boolean;
  readyState: number;
  play: ReturnType<typeof vi.fn<[], Promise<void>>>;
  pause: ReturnType<typeof vi.fn<[], void>>;
  requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

type VideoProviderProbe = {
  _videoElement: HTMLVideoElement | null;
  _sourceUrl: string | null;
  _isLoading: boolean;
  _mediaReadiness: MediaReadiness;
  _hasSource: boolean;
  _videoFrameDirty: boolean;
  _detachVideoElement(): void;
  _loadVideo(url: string): Promise<void>;
  _shouldUploadVideoFrame(): boolean;
};

function createMockVideoElement(options: {
  currentTime?: number;
  paused?: boolean;
  readyState?: number;
  requestVideoFrameCallback?: MockVideoElement['requestVideoFrameCallback'];
  cancelVideoFrameCallback?: MockVideoElement['cancelVideoFrameCallback'];
}): MockVideoElement {
  const video: MockVideoElement = {
    currentTime: options.currentTime ?? 0,
    paused: options.paused ?? true,
    readyState: options.readyState ?? 2,
    play: vi.fn(() => {
      video.paused = false;
      return Promise.resolve();
    }),
    pause: vi.fn(() => {
      video.paused = true;
    }),
  };

  if (options.requestVideoFrameCallback) {
    video.requestVideoFrameCallback = options.requestVideoFrameCallback;
  }
  if (options.cancelVideoFrameCallback) {
    video.cancelVideoFrameCallback = options.cancelVideoFrameCallback;
  }

  return video;
}

function createProviderWithVideo(video: MockVideoElement): {
  layer: VisualLayer;
  provider: VideoDrawableProvider;
} {
  const provider = new VideoDrawableProvider();
  const layer = new VisualLayer('video-layer', provider);
  (provider as unknown as VideoProviderProbe)._videoElement = video as unknown as HTMLVideoElement;
  return { layer, provider };
}

afterEach(() => {
  AudioLayer.setRealtimePlaybackEnabled(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VideoDrawableProvider persistence', () => {
  it('uses persisted source dimensions before video metadata loads', () => {
    const layer = new VisualLayer('video-layer', new VideoDrawableProvider());

    layer.updateConfig({
      sourceWidth: 1280,
      sourceHeight: 720,
      fit: 'contain',
    });

    expect(layer.width).toBe(1280);
    expect(layer.height).toBe(720);
    expect(layer.getConfig()).toMatchObject({
      sourceWidth: 1280,
      sourceHeight: 720,
      fit: 'contain',
    });
  });
});

describe('VideoDrawableProvider GPU resource lifecycle', () => {
  it('destroys retired textures only after submitted GPU work completes', async () => {
    let resolveSubmittedWork!: () => void;
    const submittedWork = new Promise<void>((resolve) => {
      resolveSubmittedWork = resolve;
    });
    const destroy = vi.fn();
    const provider = new VideoDrawableProvider() as unknown as {
      _device: GPUDevice;
      _retireTexture(texture: GPUTexture): void;
      _retiredTextures: GPUTexture[];
    };
    provider._device = {
      queue: {
        onSubmittedWorkDone: vi.fn(() => submittedWork),
      },
    } as unknown as GPUDevice;

    provider._retireTexture({ destroy } as unknown as GPUTexture);

    expect(destroy).not.toHaveBeenCalled();
    expect(provider._retiredTextures).toHaveLength(1);

    resolveSubmittedWork();
    await submittedWork;
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(destroy).toHaveBeenCalledOnce();
    expect(provider._retiredTextures).toHaveLength(0);
  });

  it('recreates the bind group when source texture exists but bind group was cleared', () => {
    const createView = vi.fn(() => ({}));
    const createTexture = vi.fn(() => ({ createView, destroy: vi.fn() }));
    const createBindGroup = vi.fn(() => ({}));
    const getBindGroupLayout = vi.fn(() => ({}));
    const copyExternalImageToTexture = vi.fn();
    const provider = new VideoDrawableProvider() as unknown as {
      _device: GPUDevice;
      _pipeline: GPURenderPipeline;
      _sampler: GPUSampler;
      _uniformBuffer: GPUBuffer;
      _texture: GPUTexture;
      _bindGroup: GPUBindGroup | null;
      _sourceWidth: number;
      _sourceHeight: number;
      _setSource(source: HTMLVideoElement): void;
    };

    provider._device = {
      createTexture,
      createBindGroup,
      queue: {
        copyExternalImageToTexture,
        onSubmittedWorkDone: vi.fn(() => Promise.resolve()),
      },
    } as unknown as GPUDevice;
    provider._pipeline = { getBindGroupLayout } as unknown as GPURenderPipeline;
    provider._sampler = {} as GPUSampler;
    provider._uniformBuffer = {} as GPUBuffer;
    provider._texture = { createView: vi.fn(), destroy: vi.fn() } as unknown as GPUTexture;
    provider._bindGroup = null;
    provider._sourceWidth = 1920;
    provider._sourceHeight = 1080;

    const video = createMockVideoElement({}) as unknown as HTMLVideoElement & {
      videoWidth: number;
      videoHeight: number;
    };
    video.videoWidth = 1920;
    video.videoHeight = 1080;

    vi.stubGlobal('GPUTextureUsage', {
      TEXTURE_BINDING: 1,
      COPY_DST: 2,
      RENDER_ATTACHMENT: 4,
    });

    provider._setSource(video);

    expect(createBindGroup).toHaveBeenCalledOnce();
    expect(copyExternalImageToTexture).toHaveBeenCalledOnce();
    expect(provider._bindGroup).not.toBeNull();
  });
});

describe('VideoDrawableProvider playback sync', () => {
  it('reports video layers as ready only after the configured source has a frame', () => {
    const provider = new VideoDrawableProvider();
    const probe = provider as unknown as VideoProviderProbe;

    expect(provider.isReady()).toBe(true);

    probe._sourceUrl = 'video.mp4';
    probe._isLoading = true;
    probe._mediaReadiness = 'loading';
    probe._hasSource = false;
    expect(provider.isReady()).toBe(false);
    expect(provider.getMediaReadiness()).toBe('loading');

    probe._isLoading = false;
    probe._hasSource = true;
    probe._mediaReadiness = 'ready';
    expect(provider.isReady()).toBe(true);
  });

  it('reports a decoding failure separately from a media load in progress', () => {
    const provider = new VideoDrawableProvider();
    const probe = provider as unknown as VideoProviderProbe;

    probe._sourceUrl = 'unplayable.mov';
    probe._mediaReadiness = 'failed';

    expect(provider.isReady()).toBe(false);
    expect(provider.getMediaReadiness()).toBe('failed');
  });

  it('changes runtime readiness to failed when the reloaded source emits an error', async () => {
    const createElement = vi.spyOn(document, 'createElement');
    createElement.mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = Document.prototype.createElement.call(document, tagName, options);
      if (tagName === 'video') {
        Object.defineProperty(element, 'load', {
          configurable: true,
          value: vi.fn(),
        });
      }
      return element;
    });

    const provider = new VideoDrawableProvider();
    const probe = provider as unknown as VideoProviderProbe;
    const sourceUrl = 'data:video/quicktime;base64,AAAA';
    probe._sourceUrl = sourceUrl;

    const loadPromise = probe._loadVideo(sourceUrl);
    const videoElement = probe._videoElement;
    videoElement?.dispatchEvent(new Event('error'));

    await expect(loadPromise).resolves.toBeUndefined();
    expect(provider.getMediaReadiness()).toBe('failed');
    expect(provider.isReady()).toBe(false);

    provider.dispose();
  });

  it('plays realtime video without seeking for small timeline drift', () => {
    const video = createMockVideoElement({ currentTime: 1.02, paused: true });
    const { layer, provider } = createProviderWithVideo(video);

    provider.update(layer, 1.04, 1 / 60);

    expect(video.play).toHaveBeenCalledOnce();
    expect(video.pause).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(1.02);
  });

  it('corrects realtime video when timeline drift is large', () => {
    const video = createMockVideoElement({ currentTime: 0, paused: false });
    const { layer, provider } = createProviderWithVideo(video);

    provider.update(layer, 1, 1 / 60);

    expect(video.currentTime).toBe(1);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('treats update time as layer-local playback time', () => {
    const video = createMockVideoElement({ currentTime: 0, paused: false });
    const { layer, provider } = createProviderWithVideo(video);
    layer.startTime = 10;

    provider.update(layer, 2, 1 / 60);

    expect(video.currentTime).toBe(2);
  });

  it('ignores stale video loads after the element is detached', async () => {
    const createElement = vi.spyOn(document, 'createElement');
    createElement.mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = Document.prototype.createElement.call(document, tagName, options);
      if (tagName === 'video') {
        Object.defineProperty(element, 'load', {
          configurable: true,
          value: vi.fn(),
        });
      }
      return element;
    });

    const provider = new VideoDrawableProvider();
    const probe = provider as unknown as VideoProviderProbe;
    const sourceUrl = 'data:video/mp4;base64,AAAA';
    probe._sourceUrl = sourceUrl;

    const loadPromise = probe._loadVideo(sourceUrl);
    const staleVideoElement = probe._videoElement;
    expect(staleVideoElement).not.toBeNull();

    probe._sourceUrl = null;
    probe._detachVideoElement();
    staleVideoElement?.dispatchEvent(new Event('loadedmetadata'));

    await expect(loadPromise).resolves.toBeUndefined();
  });

  it('pauses and seeks when preview is scrubbed or stopped', () => {
    const video = createMockVideoElement({ currentTime: 1, paused: false });
    const { layer, provider } = createProviderWithVideo(video);

    provider.update(layer, 1.25, 0);

    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(1.25);
  });

  it('keeps export-style rendering on timeline seek when realtime playback is disabled', () => {
    AudioLayer.setRealtimePlaybackEnabled(false);
    const video = createMockVideoElement({ currentTime: 0, paused: false });
    const { layer, provider } = createProviderWithVideo(video);

    provider.update(layer, 1, 1 / 30);

    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(1);
  });

  it('uploads only dirty frames when requestVideoFrameCallback is available', () => {
    const callbacks: VideoFrameRequestCallback[] = [];
    const requestVideoFrameCallback = vi.fn((nextCallback: VideoFrameRequestCallback) => {
      callbacks.push(nextCallback);
      return 1;
    });
    const video = createMockVideoElement({
      requestVideoFrameCallback,
      cancelVideoFrameCallback: vi.fn(),
    });
    const { provider } = createProviderWithVideo(video);
    const probe = provider as unknown as VideoProviderProbe;

    expect(probe._shouldUploadVideoFrame()).toBe(true);
    provider.update(new VisualLayer('video-layer', provider), 0, 1 / 60);
    expect(requestVideoFrameCallback).toHaveBeenCalledOnce();

    probe._videoFrameDirty = false;
    expect(probe._shouldUploadVideoFrame()).toBe(false);
    const callback = callbacks[0];
    if (!callback) throw new Error('Expected a video frame callback to be registered.');
    callback(0, {} as VideoFrameCallbackMetadata);
    expect(probe._shouldUploadVideoFrame()).toBe(true);
  });
});
