import { describe, expect, it } from 'vitest';
import { resolveImageLayout } from '../layers/visual/providers/rasterLayout';

describe('resolveImageLayout', () => {
  it('fills the canvas when the source matches the canvas size', () => {
    const layout = resolveImageLayout({
      canvasWidth: 1920,
      canvasHeight: 1080,
      sourceWidth: 1920,
      sourceHeight: 1080,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      fit: 'contain',
    });

    expect(layout).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('centers and contains oversized images within the canvas', () => {
    const layout = resolveImageLayout({
      canvasWidth: 1920,
      canvasHeight: 1080,
      sourceWidth: 4000,
      sourceHeight: 2000,
      position: { x: 10, y: 20 },
      scale: { x: 1, y: 1 },
      fit: 'contain',
    });

    expect(layout.x).toBe(10);
    expect(layout.y).toBe(80);
    expect(layout.width).toBe(1920);
    expect(layout.height).toBe(960);
  });

  it('centers and covers the canvas for landscape images', () => {
    const layout = resolveImageLayout({
      canvasWidth: 1920,
      canvasHeight: 1080,
      sourceWidth: 4000,
      sourceHeight: 2000,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      fit: 'cover',
    });

    expect(layout.x).toBe(-120);
    expect(layout.y).toBe(0);
    expect(layout.width).toBe(2160);
    expect(layout.height).toBe(1080);
  });

  it('centers and covers the canvas for portrait images', () => {
    const layout = resolveImageLayout({
      canvasWidth: 1920,
      canvasHeight: 1080,
      sourceWidth: 900,
      sourceHeight: 1600,
      position: { x: 10, y: 20 },
      scale: { x: 1, y: 1 },
      fit: 'cover',
    });

    expect(layout.x).toBe(10);
    expect(layout.y).toBeCloseTo(-1146.6666666667);
    expect(layout.width).toBe(1920);
    expect(layout.height).toBeCloseTo(3413.3333333333);
  });

  it('falls back to the canvas size for invalid source dimensions in fit modes', () => {
    const layout = resolveImageLayout({
      canvasWidth: 1920,
      canvasHeight: 1080,
      sourceWidth: 0,
      sourceHeight: Number.NaN,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      fit: 'cover',
    });

    expect(layout).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });
});
