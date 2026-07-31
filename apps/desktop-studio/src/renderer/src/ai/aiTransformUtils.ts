import { normalizeTransformFields } from '@rendium/engine';
import type { ILayerManifest } from '@rendium/engine';

type CanonicalTransform = NonNullable<ILayerManifest['transform']>;

export interface NormalizedTransformIntentFields {
  position?: { x: number; y: number };
  scale?: { x: number; y: number };
  rotation?: number;
}

export function normalizeLayerManifestTransform(value: unknown): CanonicalTransform | undefined {
  const normalized = normalizeTransformFields(value);
  if (!normalized) {
    return undefined;
  }

  return {
    position: normalized.position ?? { x: 0, y: 0 },
    scale: normalized.scale ?? { x: 1, y: 1 },
    rotation: normalized.rotation ?? 0,
  };
}

export function normalizeTransformIntentFields(
  value: unknown,
): NormalizedTransformIntentFields | undefined {
  const fields = normalizeTransformFields(value);
  if (!fields) {
    return undefined;
  }

  const result: NormalizedTransformIntentFields = {};
  if (fields.position) {
    result.position = fields.position;
  }
  if (fields.scale) {
    result.scale = fields.scale;
  }
  if (typeof fields.rotation === 'number') {
    result.rotation = fields.rotation;
  }

  return result;
}
