import { describe, expect, it } from 'vitest';
import type { LayerConfig } from '../_contracts';
import {
  isImageFitMode,
  normalizeLayerConfigEntry,
  normalizeLayerConfigPayload,
} from '../_utils/layerConfig';
import { TextDrawableProvider } from '../layers/visual/providers/TextDrawableProvider';

describe('LayerConfig validation', () => {
  it('rejects malformed color tuples', () => {
    expect(() => normalizeLayerConfigPayload({ color: [1, 1, 1] })).toThrow(
      /color has an unsupported value/,
    );
  });

  it('rejects malformed transform vectors', () => {
    expect(() => normalizeLayerConfigEntry('position', { x: 1 })).toThrow(
      /position has an unsupported value/,
    );
  });

  it('narrows image fit modes', () => {
    expect(isImageFitMode('contain')).toBe(true);
    expect(isImageFitMode('stretch')).toBe(false);
  });

  it('keeps invalid provider color tuples out of provider state', () => {
    const provider = new TextDrawableProvider();
    const originalColor = provider.getConfig().color;

    provider.updateConfig(
      {} as never,
      {
        color: [1, 1, 1],
      } as unknown as LayerConfig,
    );

    expect(provider.getConfig().color).toEqual(originalColor);
  });
});
