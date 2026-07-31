// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isVideoImportCandidate,
  probePlayableVideo,
  UnsupportedVideoFileError,
} from './videoImport';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});

describe('video import candidates', () => {
  it('recognizes MOV as a video candidate without promising that every MOV can play', () => {
    expect(isVideoImportCandidate('Screen Recording 2026-07-25 at 10.00.00.mov')).toBe(true);
    expect(isVideoImportCandidate('capture.MOV')).toBe(true);
    expect(isVideoImportCandidate('unsupported.avi')).toBe(false);
  });
});

describe('probePlayableVideo', () => {
  it('requires metadata, a decoded frame, and muted playback before accepting a MOV', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      HTMLMediaElement.HAVE_CURRENT_DATA,
    );
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1920);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(1080);
    vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(3.25);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:mov'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });

    await expect(
      probePlayableVideo(new File(['video'], 'Screen Recording.mov', { type: 'video/quicktime' })),
    ).resolves.toEqual({ width: 1920, height: 1080, duration: 3.25 });

    expect(play).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mov');
  });

  it('rejects a MOV that raises a media error before a first frame is decoded', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function load(
      this: HTMLMediaElement,
    ): void {
      queueMicrotask(() => this.dispatchEvent(new Event('error')));
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:broken-mov'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });

    await expect(
      probePlayableVideo(new File(['broken'], 'broken.mov', { type: 'video/quicktime' })),
    ).rejects.toBeInstanceOf(UnsupportedVideoFileError);
  });
});
