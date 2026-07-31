import { describe, expect, it } from 'vitest';
import { transformPoint } from '../_utils/transform';
import { VisualLayer } from '../layers/visual/VisualLayer';
import {
  TextDrawableProvider,
  resolveTextCanvasHeight,
  resolveTextRasterScale,
} from '../layers/visual/providers/TextDrawableProvider';

describe('TextDrawableProvider raster helpers', () => {
  it('defaults text anchor to the top-left for legacy manifests', () => {
    const provider = new TextDrawableProvider();
    expect(provider.anchor).toEqual({ x: 0, y: 0 });
  });

  it('keeps the text quad scaled to its rasterized size', () => {
    const provider = new TextDrawableProvider();
    const layer = new VisualLayer('text-layer', provider);
    layer.position = { x: 400, y: 300 };
    layer.scale = { x: 1, y: 1 };
    layer.rotation = 0;
    provider.anchor = { x: 0.5, y: 0.5 };

    const textProvider = provider as unknown as { _textWidth: number; _textHeight: number };
    textProvider._textWidth = 200;
    textProvider._textHeight = 50;

    const matrix = layer.getLocalMatrix();

    expect(transformPoint({ x: 0, y: 0 }, matrix)).toEqual({
      x: 300,
      y: 275,
    });
    expect(transformPoint({ x: 1, y: 1 }, matrix)).toEqual({
      x: 500,
      y: 325,
    });
  });

  it('scales rasterization with the larger transform axis and DPR', () => {
    expect(resolveTextRasterScale({ x: 0.5, y: 0.75 }, 2)).toBe(1.5);
    expect(resolveTextRasterScale({ x: 1.6, y: 1.2 }, 2)).toBe(3.2);
  });

  it('caps rasterization to avoid runaway texture sizes', () => {
    expect(resolveTextRasterScale({ x: 5, y: 4 }, 2)).toBe(4);
  });

  it('derives a logical canvas height from text metrics', () => {
    expect(
      resolveTextCanvasHeight(
        {
          width: 100,
          actualBoundingBoxAscent: 12,
          actualBoundingBoxDescent: 4,
        },
        24,
        8,
      ),
    ).toBe(24);
  });
});
