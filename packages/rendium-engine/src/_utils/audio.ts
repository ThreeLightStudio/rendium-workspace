/**
 * Lightweight Fast Fourier Transform (Cooley-Tukey) and Audio Extraction Utilities.
 * Optimized for offline export rendering in Rendium Engine.
 */

export class FastFourierTransform {
  private readonly size: number;
  private readonly sinTable: Float32Array;
  private readonly cosTable: Float32Array;
  private readonly bitRevTable: Uint32Array;

  constructor(size: number) {
    this.size = size;
    this.sinTable = new Float32Array(size);
    this.cosTable = new Float32Array(size);
    this.bitRevTable = new Uint32Array(size);

    for (let i = 0; i < size; i++) {
      const angle = (2 * Math.PI * i) / size;
      this.sinTable[i] = Math.sin(angle);
      this.cosTable[i] = Math.cos(angle);

      let j = 0;
      for (let k = 0; 1 << k < size; k++) {
        if ((i >> k) & 1) {
          j |= 1 << (Math.log2(size) - 1 - k);
        }
      }
      this.bitRevTable[i] = j;
    }
  }

  /**
   * Computes the FFT of a real-valued input.
   * Returns the magnitude of the frequency bins (first half).
   */
  public compute(input: Float32Array): Float32Array {
    const n = this.size;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);

    // Bit-reversal permutation
    for (let i = 0; i < n; i++) {
      real[i] = input[this.bitRevTable[i] ?? 0] ?? 0;
      imag[i] = 0;
    }

    // Cooley-Tukey iteration
    for (let size = 2; size <= n; size <<= 1) {
      const halfSize = size >> 1;
      const step = n / size;

      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const re = real[i + j + halfSize] ?? 0;
          const im = imag[i + j + halfSize] ?? 0;
          const tableIdx = j * step;
          const cos = this.cosTable[tableIdx] ?? 1;
          const sin = this.sinTable[tableIdx] ?? 0;

          const tr = re * cos + im * sin;
          const ti = im * cos - re * sin;

          real[i + j + halfSize] = (real[i + j] ?? 0) - tr;
          imag[i + j + halfSize] = (imag[i + j] ?? 0) - ti;
          real[i + j] = (real[i + j] ?? 0) + tr;
          imag[i + j] = (imag[i + j] ?? 0) + ti;
        }
      }
    }

    // Calculate magnitude (only need half due to symmetry of real input)
    const output = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      const r = real[i] ?? 0;
      const im = imag[i] ?? 0;
      output[i] = Math.sqrt(r * r + im * im) / (n / 2);
    }

    return output;
  }
}

const hanningLUTs = new Map<number, Float32Array>();

function getHanningWindow(size: number): Float32Array {
  let lut = hanningLUTs.get(size);
  if (!lut) {
    lut = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      lut[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    hanningLUTs.set(size, lut);
  }
  return lut;
}

const fftInstances = new Map<number, FastFourierTransform>();

function getFFT(size: number): FastFourierTransform {
  let instance = fftInstances.get(size);
  if (!instance) {
    instance = new FastFourierTransform(size);
    fftInstances.set(size, instance);
  }
  return instance;
}

export interface ExtractFrequencyDataInput {
  buffer: AudioBuffer;
  time: number;
  fftSize?: number;
  alpha?: number;
  prevState?: Float32Array;
  minDecibels?: number;
  maxDecibels?: number;
}

export function extractFrequencyData(input: ExtractFrequencyDataInput): Float32Array {
  const {
    buffer,
    time,
    fftSize = 2048,
    alpha = 0.8,
    prevState,
    minDecibels = -100,
    maxDecibels = -30,
  } = input;
  const sampleRate = buffer.sampleRate;
  const centerIndex = Math.floor(time * sampleRate);

  const samples = new Float32Array(fftSize);
  const channelData = buffer.getChannelData(0);

  const halfFFT = fftSize / 2;
  const start = Math.max(0, centerIndex - halfFFT);
  const end = Math.min(channelData.length, start + fftSize);

  const window = getHanningWindow(fftSize);

  for (let i = 0; i < fftSize; i++) {
    const idx = start + i;
    const val = idx < end ? (channelData[idx] ?? 0) : 0;
    samples[i] = val * (window[i] ?? 1);
  }

  const fft = getFFT(fftSize);
  const magnitudes = fft.compute(samples);

  // Match Web Audio AnalyserNode's dB-shaped output so offline export and live playback respond similarly.
  const dbData = new Float32Array(magnitudes.length);
  for (let i = 0; i < magnitudes.length; i++) {
    const mag = magnitudes[i] ?? 0;
    const db = 20 * Math.log10(Math.max(1e-10, mag));
    const normalized = (db - minDecibels) / (maxDecibels - minDecibels);
    dbData[i] = Math.max(0, Math.min(1, normalized));
  }

  if (!prevState) return dbData;

  const smoothed = new Float32Array(dbData.length);
  for (let i = 0; i < dbData.length; i++) {
    const currentVal = dbData[i] ?? 0;
    const prevVal = prevState[i] ?? 0;
    smoothed[i] = (1 - alpha) * currentVal + alpha * prevVal;
  }

  return smoothed;
}
