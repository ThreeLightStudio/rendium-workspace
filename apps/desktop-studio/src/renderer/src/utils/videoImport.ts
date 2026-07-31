export const VIDEO_IMPORT_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov';

const VIDEO_IMPORT_FILE_PATTERN = /\.(mp4|m4v|webm|mov)$/i;
const VIDEO_PROBE_TIMEOUT_MS = 8_000;

export type PlayableVideoMetadata = {
  width: number;
  height: number;
  duration: number;
};

export class UnsupportedVideoFileError extends Error {
  public readonly code = 'UNSUPPORTED_VIDEO_FILE';

  public constructor(message = 'The video could not be decoded for playback.') {
    super(message);
    this.name = 'UnsupportedVideoFileError';
  }
}

export function isVideoImportCandidate(fileName: string): boolean {
  return VIDEO_IMPORT_FILE_PATTERN.test(fileName);
}

export function isUnsupportedVideoFileError(error: unknown): error is UnsupportedVideoFileError {
  return error instanceof UnsupportedVideoFileError;
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'loadeddata',
  requiredReadyState: number,
): Promise<void> {
  if (video.readyState >= requiredReadyState) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      video.removeEventListener(eventName, handleReady);
      video.removeEventListener('error', handleError);
      if (timeout !== null) clearTimeout(timeout);
    };
    const handleReady = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(
        new UnsupportedVideoFileError(
          video.error?.message ?? 'The video failed while loading for playback.',
        ),
      );
    };

    video.addEventListener(eventName, handleReady, { once: true });
    video.addEventListener('error', handleError, { once: true });
    timeout = setTimeout(() => {
      cleanup();
      reject(new UnsupportedVideoFileError('Timed out while preparing the video for playback.'));
    }, VIDEO_PROBE_TIMEOUT_MS);
  });
}

/**
 * Probes the exact renderer media path before an imported video is persisted.
 * A successful metadata event is insufficient: a decoded first frame and muted
 * playback must also succeed, which is the same Chromium media capability used
 * by Rendium's preview path.
 */
export async function probePlayableVideo(file: File): Promise<PlayableVideoMetadata> {
  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(file);

  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.position = 'absolute';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';

  try {
    document.body.appendChild(video);
    video.src = objectUrl;
    video.load();

    await waitForVideoEvent(video, 'loadedmetadata', HTMLMediaElement.HAVE_METADATA);
    const metadata = {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    };

    if (
      metadata.width <= 0 ||
      metadata.height <= 0 ||
      !Number.isFinite(metadata.duration) ||
      metadata.duration <= 0
    ) {
      throw new UnsupportedVideoFileError('The video metadata is not usable for editing.');
    }

    await waitForVideoEvent(video, 'loadeddata', HTMLMediaElement.HAVE_CURRENT_DATA);
    await video.play();
    video.pause();

    return metadata;
  } catch (error) {
    if (isUnsupportedVideoFileError(error)) throw error;
    throw new UnsupportedVideoFileError(
      error instanceof Error ? error.message : 'The video could not be decoded for playback.',
    );
  } finally {
    video.pause();
    video.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
