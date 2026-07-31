import type { IAudioLayer, IRenderableLayer } from '@rendium/engine';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isAudioRuntimeLayer(value: unknown): value is IAudioLayer {
  return (
    isObject(value) &&
    (typeof value.sourceUrl === 'string' || value.sourceUrl === null) &&
    isFiniteNumber(value.volume) &&
    typeof value.muted === 'boolean' &&
    isFiniteNumber(value.clipOffset) &&
    (value.audioBuffer === null || typeof value.audioBuffer === 'object') &&
    typeof value.getFrequencyData === 'function'
  );
}

export function isRenderableRuntimeLayer(value: unknown): value is IRenderableLayer {
  return (
    isObject(value) &&
    isObject(value.appearance) &&
    isFiniteNumber(value.opacity) &&
    typeof value.visible === 'boolean' &&
    typeof value.isSetupFor === 'function' &&
    typeof value.setup === 'function' &&
    typeof value.draw === 'function'
  );
}
