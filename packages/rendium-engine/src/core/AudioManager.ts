/**
 * AudioManager - Decoupled Audio processing for Rendium Engine.
 * Manages AudioContext, AnalyserNodes and track playback synchronization.
 */

export class AudioManager {
  private _context: AudioContext | null = null;
  private _tracks = new Map<
    string,
    {
      source: AudioBufferSourceNode | null;
      analyser: AnalyserNode;
      gain: GainNode;
      buffer: AudioBuffer;
      muted: boolean;
    }
  >();

  public get tracks() {
    return this._tracks;
  }

  public get context(): AudioContext | null {
    return this._context;
  }

  private _fftData = new Float32Array(2048);

  /**
   * Lazy-initialize AudioContext (requires user gesture).
   */
  public async resume(): Promise<void> {
    if (!this._context) {
      const AudioContextClass =
        (window as { AudioContext?: typeof AudioContext }).AudioContext ||
        (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (AudioContextClass) {
        this._context = new AudioContextClass();
      }
    }
    if (this._context?.state === 'suspended') {
      await this._context.resume();
    }
  }

  /**
   * Registers a new audio source from an ArrayBuffer.
   */
  public async register(id: string, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    await this.resume();
    if (!this._context) throw new Error('AudioContext not initialized');

    const audioBuffer = await this._context.decodeAudioData(arrayBuffer);
    const analyser = this._context.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.8;

    const gain = this._context.createGain();
    gain.connect(this._context.destination);
    analyser.connect(gain);

    this._tracks.set(id, {
      source: null,
      analyser,
      gain,
      buffer: audioBuffer,
      muted: false,
    });

    return audioBuffer;
  }

  /**
   * Unregisters an audio source and cleans up nodes.
   */
  public unregister(id: string): void {
    const track = this._tracks.get(id);
    if (track) {
      track.source?.stop();
      track.source?.disconnect();
      track.analyser.disconnect();
      track.gain.disconnect();
      this._tracks.delete(id);
    }
  }

  /**
   * Updates tracks according to current time and playback state.
   * Currently handles simple 1:1 playback sync.
   */
  public update(time: number, isPlaying: boolean): void {
    if (!this._context || this._context.state !== 'running') return;

    for (const [_id, track] of this._tracks) {
      if (isPlaying) {
        if (!track.source) {
          // Create source and start at normalized 'time'
          track.source = this._context.createBufferSource();
          track.source.buffer = track.buffer;
          track.source.connect(track.analyser);

          // If 'time' exceeds duration, it won't play (standard behavior)
          if (time < track.buffer.duration) {
            track.source.start(0, time);
          }
        }
      } else {
        if (track.source) {
          track.source.stop();
          track.source.disconnect();
          track.source = null;
        }
      }
    }
  }

  /**
   * Toggles mute for a specific track.
   */
  public setMuted(id: string, muted: boolean): void {
    const track = this._tracks.get(id);
    if (track) {
      track.muted = muted;
      track.gain.gain.value = muted ? 0 : 1;
    }
  }

  /**
   * Returns frequency data for a specific track.
   */
  public getFFT(id: string): Float32Array {
    const track = this._tracks.get(id);
    if (track) {
      track.analyser.getFloatFrequencyData(this._fftData);
      // Convert to 0..1 normalized amplitudes (rough approximation)
      const normalized = new Float32Array(this._fftData.length);
      for (let i = 0; i < this._fftData.length; i++) {
        const db = this._fftData[i];
        if (db === undefined) continue;
        const val = (db + 140) / 140; // -140dB to 0dB -> 0 to 1
        normalized[i] = Math.max(0, Math.min(1, val));
      }
      return normalized;
    }
    return new Float32Array(2048).fill(0);
  }

  public get sampleRate(): number {
    return this._context?.sampleRate ?? 44100;
  }

  /**
   * Global cleanup.
   */
  public dispose(): void {
    for (const id of this._tracks.keys()) {
      this.unregister(id);
    }
    this._context?.close();
    this._context = null;
  }
}
