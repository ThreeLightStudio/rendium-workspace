import {
  type AudioSpectrumContract,
  type BandFrame,
  DEFAULT_AUDIO_SPECTRUM_CONTRACT,
  type ISpectrumProcessor,
} from '../_contracts';

const SMOOTHING_REFERENCE_FPS = 60;
const MIN_MAGNITUDE = 1e-10;

export interface SpectrumProcessorDynamics {
  attackSmoothing?: number;
  releaseSmoothing?: number;
}

interface NormalizedSpectrumProcessorDynamics {
  attackSmoothing: number;
  releaseSmoothing: number;
}

export class SpectrumProcessor implements ISpectrumProcessor {
  private _contract: AudioSpectrumContract;
  private _dynamics: NormalizedSpectrumProcessorDynamics;
  private _startBins: Int32Array;
  private _endBins: Int32Array;
  private _interpLowBins: Int32Array;
  private _interpHighBins: Int32Array;
  private _interpFractions: Float32Array;
  private _workingEnergies: Float32Array;
  private _smoothedEnergies: Float32Array;
  private _frame: BandFrame;
  private _timestamp = 0;
  private _hasPreviousFrame = false;

  public constructor(
    contract: Partial<AudioSpectrumContract> = {},
    dynamics: SpectrumProcessorDynamics = {},
  ) {
    this._contract = this._normalizeContract({
      ...DEFAULT_AUDIO_SPECTRUM_CONTRACT,
      ...contract,
    });
    this._dynamics = {
      attackSmoothing: clampSmoothing(dynamics.attackSmoothing ?? 0.35),
      releaseSmoothing: clampSmoothing(dynamics.releaseSmoothing ?? 0.82),
    };

    this._startBins = new Int32Array(this._contract.bandCount);
    this._endBins = new Int32Array(this._contract.bandCount);
    this._interpLowBins = new Int32Array(this._contract.bandCount);
    this._interpHighBins = new Int32Array(this._contract.bandCount);
    this._interpFractions = new Float32Array(this._contract.bandCount);
    this._workingEnergies = new Float32Array(this._contract.bandCount);
    this._smoothedEnergies = new Float32Array(this._contract.bandCount);
    this._frame = { energies: this._smoothedEnergies, timestamp: this._timestamp };

    this._recalculateBandBoundaries();
  }

  public get contract(): AudioSpectrumContract {
    return this._contract;
  }

  public process(rawFftData: Float32Array, deltaTime: number): BandFrame {
    const expectedBinCount = this._contract.fftSize / 2;
    if (rawFftData.length !== expectedBinCount) {
      throw new Error(
        `SpectrumProcessor expected ${expectedBinCount} FFT bins, received ${rawFftData.length}.`,
      );
    }

    this._aggregateBands(rawFftData);
    this._smoothBands(deltaTime);

    if (Number.isFinite(deltaTime) && deltaTime > 0) {
      this._timestamp += deltaTime;
    }
    this._frame.timestamp = this._timestamp;
    return this._frame;
  }

  public setBandCount(count: number): void {
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error(`SpectrumProcessor bandCount must be a positive integer. Received ${count}.`);
    }

    if (count === this._contract.bandCount) return;

    this._contract = { ...this._contract, bandCount: count };
    this._startBins = new Int32Array(count);
    this._endBins = new Int32Array(count);
    this._interpLowBins = new Int32Array(count);
    this._interpHighBins = new Int32Array(count);
    this._interpFractions = new Float32Array(count);
    this._workingEnergies = new Float32Array(count);
    this._smoothedEnergies = new Float32Array(count);
    this._frame = { energies: this._smoothedEnergies, timestamp: this._timestamp };
    this._hasPreviousFrame = false;

    this._recalculateBandBoundaries();
  }

  private _aggregateBands(rawFftData: Float32Array): void {
    const { minDecibels, maxDecibels } = this._contract;
    const decibelRange = maxDecibels - minDecibels;

    for (let bandIndex = 0; bandIndex < this._contract.bandCount; bandIndex++) {
      const startBin = this._startBins[bandIndex] ?? 0;
      const endBin = this._endBins[bandIndex] ?? -1;
      let rms = 0;

      if (endBin >= startBin) {
        let sumSquares = 0;
        let binCount = 0;
        for (let binIndex = startBin; binIndex <= endBin; binIndex++) {
          const magnitude = rawFftData[binIndex] ?? 0;
          sumSquares += magnitude * magnitude;
          binCount++;
        }
        rms = binCount > 0 ? Math.sqrt(sumSquares / binCount) : 0;
      } else {
        const lowBin = this._interpLowBins[bandIndex] ?? 0;
        const highBin = this._interpHighBins[bandIndex] ?? lowBin;
        const fraction = this._interpFractions[bandIndex] ?? 0;
        const lowMagnitude = rawFftData[lowBin] ?? 0;
        const highMagnitude = rawFftData[highBin] ?? lowMagnitude;
        rms = lowMagnitude + (highMagnitude - lowMagnitude) * fraction;
      }

      const decibels = 20 * Math.log10(Math.max(MIN_MAGNITUDE, rms));
      this._workingEnergies[bandIndex] = clamp01((decibels - minDecibels) / decibelRange);
    }
  }

  private _smoothBands(deltaTime: number): void {
    if (!this._hasPreviousFrame) {
      this._smoothedEnergies.set(this._workingEnergies);
      this._hasPreviousFrame = true;
      return;
    }

    for (let i = 0; i < this._contract.bandCount; i++) {
      const current = this._workingEnergies[i] ?? 0;
      const previous = this._smoothedEnergies[i] ?? 0;
      const smoothing =
        current >= previous ? this._dynamics.attackSmoothing : this._dynamics.releaseSmoothing;
      const adjustedSmoothing = getTimeAdjustedSmoothing(smoothing, deltaTime);
      this._smoothedEnergies[i] = previous * adjustedSmoothing + current * (1 - adjustedSmoothing);
    }
  }

  private _recalculateBandBoundaries(): void {
    switch (this._contract.scale) {
      case 'mel':
        this._recalculateMelBandBoundaries();
        return;
      case 'octave':
      case 'log':
        throw new Error(
          `SpectrumProcessor scale "${this._contract.scale}" is not implemented yet.`,
        );
      default:
        throw new Error(`Unsupported spectrum scale: ${String(this._contract.scale)}`);
    }
  }

  private _recalculateMelBandBoundaries(): void {
    const { bandCount, fftSize, maxFrequency, minFrequency, sampleRate } = this._contract;
    const binCount = fftSize / 2;
    const maxBinIndex = binCount - 1;
    const nyquist = sampleRate / 2;
    const minMel = hzToMel(minFrequency);
    const maxMel = hzToMel(maxFrequency);

    for (let bandIndex = 0; bandIndex < bandCount; bandIndex++) {
      const startFrequency = melToHz(minMel + (maxMel - minMel) * (bandIndex / bandCount));
      const endFrequency = melToHz(minMel + (maxMel - minMel) * ((bandIndex + 1) / bandCount));
      const startBinFloat = frequencyToBin(startFrequency, nyquist, binCount);
      const endBinFloat = frequencyToBin(endFrequency, nyquist, binCount);
      const startBin = Math.max(0, Math.min(maxBinIndex, Math.ceil(startBinFloat)));
      const endBin = Math.max(0, Math.min(maxBinIndex, Math.floor(endBinFloat)));

      this._startBins[bandIndex] = startBin;
      this._endBins[bandIndex] = endBin;

      const centerBin = Math.max(0, Math.min(maxBinIndex, (startBinFloat + endBinFloat) * 0.5));
      const lowBin = Math.floor(centerBin);
      const highBin = Math.min(maxBinIndex, lowBin + 1);
      this._interpLowBins[bandIndex] = lowBin;
      this._interpHighBins[bandIndex] = highBin;
      this._interpFractions[bandIndex] = centerBin - lowBin;
    }
  }

  private _normalizeContract(contract: AudioSpectrumContract): AudioSpectrumContract {
    if (
      !Number.isInteger(contract.fftSize) ||
      contract.fftSize <= 0 ||
      contract.fftSize % 2 !== 0
    ) {
      throw new Error('AudioSpectrumContract fftSize must be a positive even integer.');
    }
    if (!Number.isFinite(contract.sampleRate) || contract.sampleRate <= 0) {
      throw new Error('AudioSpectrumContract sampleRate must be a positive number.');
    }
    if (!Number.isInteger(contract.bandCount) || contract.bandCount <= 0) {
      throw new Error('AudioSpectrumContract bandCount must be a positive integer.');
    }
    if (!Number.isFinite(contract.minFrequency) || contract.minFrequency < 0) {
      throw new Error('AudioSpectrumContract minFrequency must be a finite non-negative number.');
    }
    if (
      !Number.isFinite(contract.maxFrequency) ||
      contract.maxFrequency <= contract.minFrequency ||
      contract.maxFrequency > contract.sampleRate / 2
    ) {
      throw new Error(
        'AudioSpectrumContract maxFrequency must be above minFrequency and at or below Nyquist.',
      );
    }
    if (
      !Number.isFinite(contract.minDecibels) ||
      !Number.isFinite(contract.maxDecibels) ||
      contract.maxDecibels <= contract.minDecibels
    ) {
      throw new Error('AudioSpectrumContract maxDecibels must be greater than minDecibels.');
    }

    return { ...contract };
  }
}

export function getTimeAdjustedSpectrumSmoothing(smoothing: number, deltaTime: number): number {
  return getTimeAdjustedSmoothing(smoothing, deltaTime);
}

function getTimeAdjustedSmoothing(smoothing: number, deltaTime: number): number {
  const normalizedSmoothing = clampSmoothing(smoothing);
  if (!Number.isFinite(deltaTime) || deltaTime <= 0) return normalizedSmoothing;
  return normalizedSmoothing ** (deltaTime * SMOOTHING_REFERENCE_FPS);
}

function clampSmoothing(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999, Math.max(0, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function hzToMel(frequency: number): number {
  return 2595 * Math.log10(1 + frequency / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

function frequencyToBin(frequency: number, nyquist: number, binCount: number): number {
  return (frequency / nyquist) * binCount;
}
