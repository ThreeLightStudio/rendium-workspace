import type { ILayerManifest } from '@rendium/engine';

export type VideoAudioManifestLookup = {
  layers: Record<string, ILayerManifest | undefined>;
};

export type LinkedVideoAudioPair = {
  videoLayerId: string;
  audioLayerId: string;
};

const LINKED_AUDIO_SUFFIX = '-audio';

function isVideoVisualLayer(layer: ILayerManifest | undefined): boolean {
  return (
    layer?.kind === 'visual' &&
    layer.source?.provider === 'video' &&
    (layer.source.track === undefined || layer.source.track === 'visual')
  );
}

function isVideoAudioLayer(layer: ILayerManifest | undefined): boolean {
  return (
    layer?.kind === 'audio' && layer.source?.provider === 'video' && layer.source.track === 'audio'
  );
}

/**
 * Resolves only the audio that Studio creates alongside a video import.
 *
 * The layer id convention alone is not enough: both manifests must also be
 * the respective video provider tracks. This keeps ordinary audio layers
 * (including music and voice-over files) independent even when their ids end
 * in `-audio`.
 */
export function resolveLinkedVideoAudioPair(
  manifest: VideoAudioManifestLookup,
  layerId: string,
): LinkedVideoAudioPair | null {
  const selectedLayer = manifest.layers[layerId];
  if (!selectedLayer) return null;

  const videoLayerId = isVideoVisualLayer(selectedLayer)
    ? selectedLayer.id
    : isVideoAudioLayer(selectedLayer) && selectedLayer.id.endsWith(LINKED_AUDIO_SUFFIX)
      ? selectedLayer.id.slice(0, -LINKED_AUDIO_SUFFIX.length)
      : null;
  if (!videoLayerId) return null;

  const videoLayer = manifest.layers[videoLayerId];
  const audioLayerId = `${videoLayerId}${LINKED_AUDIO_SUFFIX}`;
  const audioLayer = manifest.layers[audioLayerId];

  if (!isVideoVisualLayer(videoLayer) || !isVideoAudioLayer(audioLayer)) return null;

  return { videoLayerId, audioLayerId };
}

export function getLinkedVideoAudioLayerId(
  manifest: VideoAudioManifestLookup,
  layerId: string,
): string | null {
  const pair = resolveLinkedVideoAudioPair(manifest, layerId);
  if (!pair) return null;

  if (layerId === pair.videoLayerId) return pair.audioLayerId;
  if (layerId === pair.audioLayerId) return pair.videoLayerId;
  return null;
}
