import { describe, expect, it } from 'vitest';
import { SPECTRUM_CONFIG } from '../_contracts';
import type { VisualLayer } from '../layers/visual/VisualLayer';
import {
  SPECTRUM_SHADER_SOURCE,
  SpectrumDrawableProvider,
  getTimeAdjustedSmoothing,
} from '../layers/visual/providers/SpectrumDrawableProvider';

describe('SpectrumDrawableProvider', () => {
  it('hydrates empty configs from the product spectrum defaults', () => {
    const provider = new SpectrumDrawableProvider();

    expect(provider.getConfig()).toMatchObject({
      bandCount: SPECTRUM_CONFIG.DEFAULT_BAND_COUNT,
      barGap: SPECTRUM_CONFIG.DEFAULT_BAR_GAP,
      minHeight: SPECTRUM_CONFIG.DEFAULT_MIN_HEIGHT,
      maxHeight: SPECTRUM_CONFIG.DEFAULT_MAX_HEIGHT,
      smoothing: SPECTRUM_CONFIG.DEFAULT_SMOOTHING,
      gain: SPECTRUM_CONFIG.DEFAULT_GAIN,
      color: SPECTRUM_CONFIG.DEFAULT_COLOR,
      minFrequency: SPECTRUM_CONFIG.DEFAULT_MIN_FREQUENCY,
      maxFrequency: SPECTRUM_CONFIG.DEFAULT_MAX_FREQUENCY,
      spectralTilt: SPECTRUM_CONFIG.DEFAULT_SPECTRAL_TILT,
      gradientMode: SPECTRUM_CONFIG.DEFAULT_GRADIENT_MODE,
      colorLow: SPECTRUM_CONFIG.DEFAULT_COLOR_LOW,
      colorHigh: SPECTRUM_CONFIG.DEFAULT_COLOR_HIGH,
    });
  });

  it('keeps a visible idle baseline when old manifests hydrate minHeight as zero', () => {
    const provider = new SpectrumDrawableProvider();

    provider.updateConfig({} as VisualLayer, { minHeight: 0 });

    expect(provider.minHeight).toBe(SPECTRUM_CONFIG.DEFAULT_MIN_HEIGHT);
    expect(provider.getConfig()).toMatchObject({
      minHeight: SPECTRUM_CONFIG.DEFAULT_MIN_HEIGHT,
    });
  });

  it('normalizes smoothing by elapsed time instead of export frame rate', () => {
    expect(getTimeAdjustedSmoothing(0.8, 1 / 60)).toBeCloseTo(0.8);
    expect(getTimeAdjustedSmoothing(0.8, 1 / 30)).toBeCloseTo(0.8 ** 2);
    expect(getTimeAdjustedSmoothing(0.8, 1 / 120)).toBeCloseTo(Math.sqrt(0.8));
  });

  it('uses maxHeight as the rendered layout area height', () => {
    const provider = new SpectrumDrawableProvider();

    provider.updateConfig({} as VisualLayer, { maxHeight: 0.35 });

    expect(provider.getIntrinsicSize()).toEqual({ width: 1, height: 0.35 });
    expect(provider.getTransformDescriptor().bounds?.height).toBe(0.35);
  });

  it('clamps boosted amplitudes so maxHeight remains the visual ceiling', () => {
    expect(SPECTRUM_SHADER_SOURCE).toContain(
      'amplitude = amplitude / max(uniforms.normalizationPeak, 1.0);',
    );
    expect(SPECTRUM_SHADER_SOURCE).toContain('let kneeStart = 0.82;');
    expect(SPECTRUM_SHADER_SOURCE).toContain('amplitude = clamp(amplitude, 0.0, 1.0);');
    expect(SPECTRUM_SHADER_SOURCE).toContain(
      'let height = mix(uniforms.minHeight, uniforms.maxHeight, amplitude);',
    );
  });
});
