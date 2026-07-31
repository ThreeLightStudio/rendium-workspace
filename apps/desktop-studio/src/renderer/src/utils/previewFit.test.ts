import { describe, expect, it } from 'vitest';
import { calculatePreviewFitSize } from './previewFit';

describe('calculatePreviewFitSize', () => {
  it('fits a 16:9 canvas by width inside a matching wide viewport', () => {
    const fit = calculatePreviewFitSize({
      viewportWidth: 960,
      viewportHeight: 540,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });

    expect(fit.width).toBe(960);
    expect(fit.height).toBe(540);
    expect(fit.scale).toBe(0.5);
  });

  it('fits a 16:9 canvas by height inside a shallower wide viewport', () => {
    const fit = calculatePreviewFitSize({
      viewportWidth: 1000,
      viewportHeight: 400,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });

    expect(fit.width).toBeCloseTo(711.111);
    expect(fit.height).toBe(400);
    expect(fit.scale).toBeCloseTo(0.37037);
  });

  it('fits a 9:16 canvas as a tall narrow surface inside a landscape viewport', () => {
    const fit = calculatePreviewFitSize({
      viewportWidth: 800,
      viewportHeight: 400,
      canvasWidth: 1080,
      canvasHeight: 1920,
    });

    expect(fit.width).toBe(225);
    expect(fit.height).toBe(400);
    expect(fit.scale).toBeCloseTo(0.208333);
  });

  it('fits a square canvas inside the smaller viewport dimension', () => {
    const fit = calculatePreviewFitSize({
      viewportWidth: 640,
      viewportHeight: 480,
      canvasWidth: 1080,
      canvasHeight: 1080,
    });

    expect(fit.width).toBe(480);
    expect(fit.height).toBe(480);
    expect(fit.scale).toBeCloseTo(0.444444);
  });

  it('falls back to the canvas size when the viewport cannot be measured', () => {
    const fit = calculatePreviewFitSize({
      viewportWidth: 0,
      viewportHeight: Number.NaN,
      canvasWidth: 1080,
      canvasHeight: 1920,
    });

    expect(fit).toEqual({
      width: 1080,
      height: 1920,
      scale: 1,
    });
  });
});
