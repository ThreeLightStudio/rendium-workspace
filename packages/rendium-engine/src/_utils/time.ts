/**
 * Time and frame conversion utilities.
 */

export interface ContentDurationCandidate {
  startTime?: number;
  duration?: number;
}

export interface ContentDurationOptions<T extends ContentDurationCandidate> {
  shouldSkip?: (item: T) => boolean;
}

/**
 * Calculates the maximum end time across a collection of timeline items.
 *
 * Callers decide which items should be skipped, so the same helper can be used
 * for both scene runtime layers and manifest layers.
 */
export function calculateContentDuration<T extends ContentDurationCandidate>(
  items: Iterable<T | null | undefined>,
  options: ContentDurationOptions<T> = {},
): number {
  let maxEndTime = 0;

  for (const item of items) {
    if (item == null) continue;
    if (options.shouldSkip?.(item)) continue;

    const startTime = item.startTime ?? 0;
    const duration = item.duration ?? 0;
    const endTime = startTime + duration;

    if (Number.isFinite(endTime)) {
      maxEndTime = Math.max(maxEndTime, endTime);
    }
  }

  return maxEndTime;
}

export function secondsToFrames(seconds: number, fps: number): number {
  return Math.floor(seconds * fps);
}

export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}

/**
 * Format time to MM:SS.ms string
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const minsStr = mins.toString().padStart(2, '0');
  const secsStr = secs.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(3, '0');

  return `${minsStr}:${secsStr}.${msStr}`;
}
