import { EngineSelectors, type ILayerManifest, type JsonValue } from '@rendium/engine';
import { createTextLayerManifest } from './canonicalLayer';

export const TEXT_LAYER_CENTER_ANCHOR = { x: 0.5, y: 0.5 } as const;

export interface BuildCenteredTextLayerManifestOptions {
  id: string;
  text: string;
  duration: number;
  canvasWidth: number;
  canvasHeight: number;
  name?: string;
  startTime?: number;
  targetScopeId?: string;
  params?: Record<string, JsonValue>;
  appearance?: {
    visible: boolean;
    opacity: number;
  };
}

export function getCanvasCenterFromSnapshot(snapshot: { width: number; height: number }): {
  x: number;
  y: number;
} {
  return EngineSelectors.getCanvasCenterFromSnapshot(snapshot);
}

export function buildCenteredTextLayerManifest(
  options: BuildCenteredTextLayerManifestOptions,
): ILayerManifest {
  const center = EngineSelectors.getCanvasCenter(options.canvasWidth, options.canvasHeight);
  const manifest = createTextLayerManifest({
    id: options.id,
    text: options.text,
    name: options.name ?? resolveTextLayerName(options.text),
    startTime: options.startTime ?? 0,
    duration: options.duration,
    canvasWidth: options.canvasWidth,
    canvasHeight: options.canvasHeight,
    appearance: options.appearance,
  });

  return {
    ...manifest,
    transform: {
      position: center,
      scale: { x: 1, y: 1 },
      rotation: 0,
    },
    source: {
      ...manifest.source,
      sourceId: manifest.source?.sourceId ?? `text:${options.id}`,
      provider: 'text',
      track: 'visual',
      params: {
        ...(manifest.source?.params ?? {}),
        ...(options.params ?? {}),
      },
    },
  };
}

function resolveTextLayerName(text: string): string {
  return text.slice(0, 24) || 'Text Layer';
}
