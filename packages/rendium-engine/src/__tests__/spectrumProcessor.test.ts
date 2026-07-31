import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_SPECTRUM_CONTRACT } from '../_contracts';
import { SpectrumProcessor } from '../_utils/spectrumProcessor';

const TEST_CONTRACT = {
  ...DEFAULT_AUDIO_SPECTRUM_CONTRACT,
  fftSize: 16,
  sampleRate: 16000,
  bandCount: 4,
  minFrequency: 0,
  maxFrequency: 8000,
  minDecibels: -100,
  maxDecibels: 0,
  scale: 'mel' as const,
};

function createFftBins(fill = 0): Float32Array {
  return new Float32Array(TEST_CONTRACT.fftSize / 2).fill(fill);
}

describe('SpectrumProcessor', () => {
  it('returns a mel-scaled BandFrame with the configured band count', () => {
    const processor = new SpectrumProcessor(TEST_CONTRACT, {
      attackSmoothing: 0,
      releaseSmoothing: 0,
    });

    const frame = processor.process(createFftBins(1), 1 / 60);

    expect(frame.energies).toHaveLength(TEST_CONTRACT.bandCount);
    expect(frame.timestamp).toBeCloseTo(1 / 60);
    expect(Array.from(frame.energies).every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('aggregates a single FFT peak into the band covering that frequency range', () => {
    const processor = new SpectrumProcessor(TEST_CONTRACT, {
      attackSmoothing: 0,
      releaseSmoothing: 0,
    });
    const bins = createFftBins();
    bins[4] = 1;

    const frame = processor.process(bins, 1 / 60);
    const values = Array.from(frame.energies);
    const peak = Math.max(...values);

    expect(peak).toBeGreaterThan(0.9);
    expect(values.indexOf(peak)).toBe(3);
  });

  it('normalizes silent input to zero', () => {
    const processor = new SpectrumProcessor(TEST_CONTRACT, {
      attackSmoothing: 0,
      releaseSmoothing: 0,
    });

    const frame = processor.process(createFftBins(), 1 / 60);

    expect(Array.from(frame.energies)).toEqual([0, 0, 0, 0]);
  });

  it('uses attack smoothing for rising energy and release smoothing for falling energy', () => {
    const processor = new SpectrumProcessor(TEST_CONTRACT, {
      attackSmoothing: 0.5,
      releaseSmoothing: 0.9,
    });
    const silent = createFftBins();
    const loud = createFftBins(1);

    processor.process(silent, 1 / 60);
    const rising = processor.process(loud, 1 / 60);
    const risingEnergy = rising.energies[0] ?? 0;
    const falling = processor.process(silent, 1 / 60);
    const fallingEnergy = falling.energies[0] ?? 0;

    expect(risingEnergy).toBeCloseTo(0.5);
    expect(fallingEnergy).toBeCloseTo(0.45);
  });

  it('updates boundaries and output storage when band count changes', () => {
    const processor = new SpectrumProcessor(TEST_CONTRACT, {
      attackSmoothing: 0,
      releaseSmoothing: 0,
    });

    processor.setBandCount(6);
    const frame = processor.process(createFftBins(1), 1 / 60);

    expect(processor.contract.bandCount).toBe(6);
    expect(frame.energies).toHaveLength(6);
  });

  it('fails fast when raw FFT data does not match the contract bin count', () => {
    const processor = new SpectrumProcessor(TEST_CONTRACT);

    expect(() => processor.process(new Float32Array(4), 1 / 60)).toThrow(
      'SpectrumProcessor expected 8 FFT bins',
    );
  });
});
