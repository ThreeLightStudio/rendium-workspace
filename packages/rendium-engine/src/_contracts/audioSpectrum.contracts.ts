export type SpectrumBandScale = 'mel' | 'octave' | 'log';

export interface AudioSpectrumContract {
  fftSize: number;
  sampleRate: number;
  bandCount: number;
  minFrequency: number;
  maxFrequency: number;
  minDecibels: number;
  maxDecibels: number;
  scale: SpectrumBandScale;
}

export interface BandFrame {
  energies: Float32Array;
  timestamp: number;
}

export interface ISpectrumProcessor {
  readonly contract: AudioSpectrumContract;
  process(rawFftData: Float32Array, deltaTime: number): BandFrame;
  setBandCount(count: number): void;
}

export const DEFAULT_AUDIO_SPECTRUM_CONTRACT: AudioSpectrumContract = {
  fftSize: 4096,
  sampleRate: 44100,
  bandCount: 96,
  minFrequency: 20,
  maxFrequency: 8000,
  minDecibels: -100,
  maxDecibels: -30,
  scale: 'mel',
};
