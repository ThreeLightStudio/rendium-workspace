import {
  AUDIO_CONFIG,
  type IAudioLayer,
  type LayerConfig,
  type LayerId,
  type MediaReadiness,
} from '../../_contracts';
import { extractFrequencyData } from '../../_utils/audio';
import { BaseLayer } from '../base/BaseLayer';

const AUDIO_DECODE_TIMEOUT_MS = 8_000;

/**
 * AudioLayer - Manages time-synchronized audio playback.
 * Does NOT render to GPU — extends BaseLayer directly.
 * Mute/volume is controlled via `muted` and `volume` properties,
 * NOT via `visible` (which no longer exists on non-renderable layers).
 */
export class AudioLayer extends BaseLayer implements IAudioLayer {
  private static _sharedContext: AudioContext | null = null;
  private static _realtimePlaybackEnabled = true;
  public static get sharedSampleRate(): number {
    return AudioLayer._sharedContext?.sampleRate ?? 44100;
  }

  public static isRealtimePlaybackEnabled(): boolean {
    return AudioLayer._realtimePlaybackEnabled;
  }

  public static setRealtimePlaybackEnabled(enabled: boolean): void {
    AudioLayer._realtimePlaybackEnabled = enabled;
  }

  public static async resumeSharedContext(): Promise<void> {
    if (!AudioLayer._sharedContext) {
      const audioGlobal = globalThis as typeof globalThis & {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextClass =
        audioGlobal.AudioContext || audioGlobal.webkitAudioContext;

      if (AudioContextClass) {
        AudioLayer._sharedContext = new AudioContextClass();
      }
    }

    if (AudioLayer._sharedContext?.state === 'suspended') {
      await AudioLayer._sharedContext.resume();
    }
  }

  public static async suspendSharedContext(): Promise<boolean> {
    if (!AudioLayer._sharedContext || AudioLayer._sharedContext.state !== 'running') {
      return false;
    }

    await AudioLayer._sharedContext.suspend();
    return true;
  }

  private _buffer: AudioBuffer | null = null;
  private _sourceNode: AudioBufferSourceNode | null = null;
  private _gainNode: GainNode | null = null;
  private _analyserNode: AnalyserNode | null = null;
  private _freqArray: Uint8Array | null = null;
  private _lastFreqData: Uint8Array | null = null;

  // Offline Export State
  private _lastOfflineExportTime = -1;
  private _lastOfflineFreqData: Float32Array | null = null;
  private _offlineUint8Result: Uint8Array | null = null;

  private _isLoading = false;
  private _isSetup = false;
  private _mediaReadiness: MediaReadiness = 'ready';
  private _lastPlayTime = 0;
  private _expectedOffset = 0;

  /**
   * AbortController for cancelling in-flight fetch/decode operations.
   * A new controller is created each time _loadAudio() is initiated.
   * Calling dispose() aborts this, preventing post-dispose callbacks from
   * firing and causing IllegalStateError or memory leaks.
   */
  private _loadAbortController: AbortController | null = null;

  public volume: number = AUDIO_CONFIG.DEFAULT_VOLUME;
  public muted: boolean = AUDIO_CONFIG.DEFAULT_MUTED;
  public clipOffset: number = AUDIO_CONFIG.DEFAULT_CLIP_OFFSET;
  public sourceUrl: string | null = null;
  public onMetadataLoad?: () => void;

  public get audioBuffer(): AudioBuffer | null {
    return this._buffer;
  }

  public get isSetup(): boolean {
    return this._isSetup && !this._isLoading && this.mediaReadiness === 'ready';
  }

  public get mediaReadiness(): MediaReadiness {
    return this.sourceUrl ? this._mediaReadiness : 'ready';
  }

  constructor(
    id: LayerId,
    private readonly _allowMissingAudio = false,
  ) {
    super(id, 'audio');
  }

  // ---------------------------------------------------------------------------
  // Audio-specific setup (no GPU device needed)
  // ---------------------------------------------------------------------------

  /**
   * Initialise the Web Audio context and load audio data.
   * Called separately from GPU setup since AudioLayer is non-renderable.
   */
  public async initAudio(): Promise<void> {
    try {
      await AudioLayer.resumeSharedContext();
      this._isSetup = true;

      if (this.sourceUrl && !this._buffer) {
        await this._loadAudio(this.sourceUrl);
      }
    } catch (error) {
      this._mediaReadiness = this._allowMissingAudio ? 'ready' : 'failed';
      console.error('AudioLayer: Failed to initialize audio', error);
    }
  }

  private async _loadAudio(url: string): Promise<void> {
    if (!AudioLayer._sharedContext) {
      this._mediaReadiness = this._allowMissingAudio ? 'ready' : 'failed';
      return;
    }

    // Cancel any previously in-flight load before starting a new one.
    // This handles rapid url-change scenarios (e.g. updateConfig called twice).
    this._loadAbortController?.abort();
    const controller = new AbortController();
    this._loadAbortController = controller;

    this._isLoading = true;
    this._mediaReadiness = 'loading';
    try {
      const arrayBuffer = await this._readSourceBytes(url, controller.signal);

      // Guard: dispose() may have been called while arrayBuffer was downloading.
      // If the signal is aborted at this point, do NOT proceed to decodeAudioData
      // because the AudioContext may already be in a closed/invalid state.
      if (controller.signal.aborted) return;

      this._buffer = await this._decodeAudioDataWithTimeout(arrayBuffer);

      // Final abort check: dispose() could have fired during the async decode call.
      if (controller.signal.aborted) {
        // Decoded buffer is orphaned — release the reference immediately.
        this._buffer = null;
        return;
      }

      // Adjust duration based on audio buffer if not explicitly set (or if it's the old 10s default)
      if (this.duration === 0 || Math.abs(this.duration - 10) < 1e-6) {
        this.duration = this._buffer.duration;
      }
      this._mediaReadiness = 'ready';
      this.onMetadataLoad?.();
    } catch (error) {
      // AbortError is the expected outcome when dispose() cancels the load;
      // suppress it to avoid noise in the console.
      if (error instanceof Error && error.name === 'AbortError') return;
      this._mediaReadiness = this._allowMissingAudio ? 'ready' : 'failed';
      if (!this._allowMissingAudio) {
        console.error('AudioLayer: Failed to load/decode audio', error);
      }
    } finally {
      this._isLoading = false;
      // Clear the reference only if this controller is still the active one
      // (a subsequent _loadAudio call may have replaced it already).
      if (this._loadAbortController === controller) {
        this._loadAbortController = null;
      }
    }
  }

  private async _readSourceBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (/^(data:|blob:|file:|https?:)/i.test(url)) {
      const response = await fetch(url, signal ? { signal } : undefined);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
      }
      return await response.arrayBuffer();
    }

    const api = (
      globalThis as typeof globalThis & {
        api?: { readFileAsArrayBuffer: (filePath: string) => Promise<ArrayBuffer> };
      }
    ).api;

    if (!api?.readFileAsArrayBuffer) {
      throw new Error('Renderer API does not expose readFileAsArrayBuffer');
    }

    return await api.readFileAsArrayBuffer(url);
  }

  private async _decodeAudioDataWithTimeout(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const context = AudioLayer._sharedContext;
    if (!context) {
      throw new Error('Audio context is unavailable');
    }

    return await new Promise<AudioBuffer>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        reject(new Error(`Audio decoding timed out after ${AUDIO_DECODE_TIMEOUT_MS}ms`));
      }, AUDIO_DECODE_TIMEOUT_MS);

      context.decodeAudioData(arrayBuffer).then(
        (buffer) => {
          globalThis.clearTimeout(timeout);
          resolve(buffer);
        },
        (error: unknown) => {
          globalThis.clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }

  public override update(time: number, _deltaTime: number): void {
    if (!AudioLayer._realtimePlaybackEnabled) return;
    if (!this.isSetup || !AudioLayer._sharedContext || !this._buffer) return;

    const ctx = AudioLayer._sharedContext;
    const elapsed = time;
    const offset = this.clipOffset + elapsed;
    // Muting is now controlled by `muted` / `volume`, not `visible`
    const inRange = elapsed >= 0 && elapsed < this.duration;

    // Stop playback immediately if the engine is paused (deltaTime === 0)
    // or if we are out of range.
    if (!inRange || _deltaTime <= 0) {
      if (this._sourceNode) {
        this._stopPlayback();
      }
      return;
    }

    if (!this._sourceNode) {
      this._startPlayback(offset, elapsed);
    } else {
      // Desync check (0.1s tolerance)
      const actualPosition = ctx.currentTime - this._lastPlayTime + this._expectedOffset;
      if (Math.abs(actualPosition - offset) > 0.1) {
        this._stopPlayback();
        this._startPlayback(offset, elapsed);
      }
    }

    // Update volume/mute state via GainNode
    if (this._gainNode) {
      const targetGain = this.muted ? 0 : this.volume;
      this._gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
    }
  }

  private _startPlayback(offset: number, elapsed: number): void {
    const ctx = AudioLayer._sharedContext;
    if (!ctx || !this._buffer) return;

    this._sourceNode = ctx.createBufferSource();
    this._sourceNode.buffer = this._buffer;

    this._gainNode = ctx.createGain();
    this._gainNode.gain.value = this.muted ? 0 : this.volume;

    // Reuse existing AnalyserNode if already created (preserves across stop/start cycles)
    if (!this._analyserNode) {
      this._analyserNode = ctx.createAnalyser();
      this._analyserNode.fftSize = 4096;
      this._analyserNode.smoothingTimeConstant = 0.8;
      this._freqArray = new Uint8Array(this._analyserNode.frequencyBinCount);
    }

    this._sourceNode.connect(this._gainNode);
    this._gainNode.connect(this._analyserNode);
    this._analyserNode.connect(ctx.destination);

    // Calculate remaining duration for the Web Audio scheduler
    const remainingDuration = Math.max(0, this.duration - elapsed);

    this._sourceNode.start(0, offset, remainingDuration);
    this._lastPlayTime = ctx.currentTime;
    this._expectedOffset = offset;
  }

  private static _isExpectedStopCleanupError(error: unknown): boolean {
    // InvalidStateError is expected when stop() races a source node that already stopped.
    return error instanceof Error && error.name === 'InvalidStateError';
  }

  private _handleStopCleanupError(error: unknown, stage: 'immediate' | 'delayed'): void {
    if (AudioLayer._isExpectedStopCleanupError(error)) {
      return;
    }

    console.error('[AudioLayer] Failed to stop playback cleanly', {
      layerId: this.id,
      stage,
      error,
    });
  }

  private _stopPlayback(): void {
    const ctx = AudioLayer._sharedContext;

    if (this._sourceNode) {
      try {
        // Fade out quickly (50ms) to prevent pops
        if (this._gainNode && ctx) {
          const now = ctx.currentTime;
          this._gainNode.gain.cancelScheduledValues(now);
          this._gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

          const currentNode = this._sourceNode;
          const currentGain = this._gainNode;

          setTimeout(() => {
            try {
              currentNode.stop();
              currentNode.disconnect();
              currentGain.disconnect();
            } catch (error) {
              this._handleStopCleanupError(error, 'delayed');
            }
          }, 60); // Stop after fade-out
        } else {
          this._sourceNode.stop();
          this._sourceNode.disconnect();
        }
      } catch (error) {
        this._handleStopCleanupError(error, 'immediate');
      }
      this._sourceNode = null;
      this._gainNode = null;
      // Preserve _analyserNode and _freqArray for paused/scrubbed frequency queries
    }
  }

  public getFrequencyData(time?: number): Uint8Array | null {
    // --- Path A: Offline Export / Step-by-Step Rendering ---
    if (time !== undefined && this._buffer) {
      // Cache check: Avoid redundant FFT if requested for the same timestamp twice (e.g. multiple spectrums)
      if (this._lastOfflineExportTime === time && this._offlineUint8Result) {
        return this._offlineUint8Result;
      }

      // Perform offline FFT extraction with Hanning Window and EMA Smoothing
      const frequencyInput = {
        buffer: this._buffer,
        time,
        fftSize: 2048,
        alpha: 0.8,
      };
      const floatResult = extractFrequencyData(
        this._lastOfflineFreqData
          ? { ...frequencyInput, prevState: this._lastOfflineFreqData }
          : frequencyInput,
      );

      // Convert Float32 (0-1 approx) back to Uint8 (0-255) for IAudioLayer parity
      if (!this._offlineUint8Result) {
        this._offlineUint8Result = new Uint8Array(floatResult.length);
      }

      for (let i = 0; i < floatResult.length; i++) {
        // Scale normalized 0.0-1.0 (dB range) to 0-255 for Uint8 parity
        const val = (floatResult[i] ?? 0) * 255;
        this._offlineUint8Result[i] = val;
      }

      // Update state for next frame's smoothing and cache
      this._lastOfflineFreqData = floatResult;
      this._lastOfflineExportTime = time;

      return this._offlineUint8Result;
    }

    // --- Path B: Real-time Playback (Existing Logic) ---
    if (!this._analyserNode || !this._freqArray) {
      // Return cached data if available, otherwise zeros
      return this._lastFreqData ?? null;
    }

    // Capture current frequency data
    this._analyserNode.getByteFrequencyData(this._freqArray as unknown as Uint8Array<ArrayBuffer>);

    // Cache the latest data for use when playback is paused
    if (this._lastFreqData) {
      this._lastFreqData.set(this._freqArray);
    } else {
      this._lastFreqData = new Uint8Array(this._freqArray);
    }

    return this._freqArray;
  }

  public override updateConfig(config: LayerConfig): void {
    super.updateConfig(config);

    if (config.sourceUrl !== undefined && config.sourceUrl !== this.sourceUrl) {
      this.sourceUrl = config.sourceUrl;
      this._buffer = null;
      this._mediaReadiness = this.sourceUrl ? 'loading' : 'ready';
      if (this.sourceUrl) {
        void this.initAudio();
      }
    }

    if (typeof config.volume === 'number') {
      this.volume = config.volume;
    }

    if (typeof config.muted === 'boolean') {
      this.muted = config.muted;
    }

    if (typeof config.clipOffset === 'number') {
      const oldOffset = this.clipOffset;
      this.clipOffset = config.clipOffset;

      // If offset changed significantly, restart playback
      if (Math.abs(this.clipOffset - oldOffset) > 0.01 && this._sourceNode) {
        this._stopPlayback();
        // The next update() will trigger _startPlayback with new offset
      }
    }
  }

  public override dispose(): void {
    // Abort any in-flight fetch/decode.  This must happen BEFORE super.dispose()
    // so that the signal is raised while '_sharedContext' is still accessible
    // inside the async _loadAudio continuation — preventing IllegalStateError.
    this._loadAbortController?.abort();
    this._loadAbortController = null;

    super.dispose();
    this._stopPlayback();
    this._analyserNode = null;
    this._freqArray = null;
    this._lastFreqData = null;
    this._buffer = null;
    this._isSetup = false;
  }

  public override getConfig(): LayerConfig {
    const config = super.getConfig();
    config.volume = this.volume;
    config.muted = this.muted;
    config.clipOffset = this.clipOffset;

    if (this.sourceUrl) {
      config.sourceUrl = this.sourceUrl;
    }

    return config;
  }
}
