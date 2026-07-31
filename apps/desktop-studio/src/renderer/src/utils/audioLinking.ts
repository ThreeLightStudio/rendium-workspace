import type { LayerConfig } from '@rendium/engine';

/**
 * Builds a timing patch from a linked audio source.
 *
 * Spectrum-like layers should seed their local timing only once when the link
 * is created, not keep following the source on every render or selection change.
 */
export function buildLinkedAudioTimingPatch(
  source?: Pick<LayerConfig, 'startTime' | 'duration'> | null,
): Partial<LayerConfig> {
  if (!source) return {};
  return {
    startTime: source.startTime,
    duration: source.duration,
  };
}
