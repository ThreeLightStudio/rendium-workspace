import { describe, expect, it } from 'vitest';
import { extractFrequencyData } from '../_utils/audio';

function createAudioBuffer(samples: number[], sampleRate = 8): AudioBuffer {
  const channelData = new Float32Array(samples);

  return {
    sampleRate,
    length: channelData.length,
    duration: channelData.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => channelData,
  } as unknown as AudioBuffer;
}

describe('audio analysis utilities', () => {
  it('extracts deterministic normalized frequency data', () => {
    const buffer = createAudioBuffer([1, 1, 1, 1, 1, 1, 1, 1]);

    const first = extractFrequencyData({
      buffer,
      time: 0.5,
      fftSize: 8,
      minDecibels: -100,
      maxDecibels: 0,
    });
    const second = extractFrequencyData({
      buffer,
      time: 0.5,
      fftSize: 8,
      minDecibels: -100,
      maxDecibels: 0,
    });

    expect(first.length).toBe(4);
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(first[0]).toBeGreaterThan(first[1] ?? 0);
    expect(Array.from(first).every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('normalizes silence to zero in the configured dB range', () => {
    const buffer = createAudioBuffer([0, 0, 0, 0, 0, 0, 0, 0]);

    const result = extractFrequencyData({
      buffer,
      time: 0.5,
      fftSize: 8,
      minDecibels: -100,
      maxDecibels: -30,
    });

    expect(Array.from(result)).toEqual([0, 0, 0, 0]);
  });

  it('applies smoothing against the previous frequency state', () => {
    const buffer = createAudioBuffer([0, 0, 0, 0, 0, 0, 0, 0]);
    const prevState = new Float32Array([1, 1, 1, 1]);

    const result = extractFrequencyData({
      buffer,
      time: 0.5,
      fftSize: 8,
      alpha: 0.5,
      prevState,
    });

    expect(Array.from(result)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('pads out-of-range timestamps with silence', () => {
    const buffer = createAudioBuffer([0, 0, 0, 0, 0, 0, 0, 0]);

    const beforeStart = extractFrequencyData({ buffer, time: -1, fftSize: 8 });
    const afterEnd = extractFrequencyData({ buffer, time: 10, fftSize: 8 });

    expect(Array.from(beforeStart)).toEqual([0, 0, 0, 0]);
    expect(Array.from(afterEnd)).toEqual([0, 0, 0, 0]);
  });
});
