import {
  AudioLayer,
  BACKGROUND_CONFIG,
  type EncoderConfig,
  type IAudioLayer,
  type IExportPipeline,
  type IScene,
  engineStore,
} from '@rendium/engine';
import { Muxer, StreamTarget } from 'mp4-muxer';
import { getStudioLayerType } from '../utils/canonicalLayer';
import { isAudioRuntimeLayer, isRenderableRuntimeLayer } from '../utils/runtimeLayerGuards';

/**
 * WebGL/Audio Canvas 캡처 -> mp4-muxer 클라이언트 사이드 인코딩 시퀀스 메커니즘:
 *
 * 1. [초기화 - prepare()]
 *    - 출력해상도, 코덱 파라미터, 하드웨어 가속 여부 설정.
 *    - StreamTarget 객체를 생성하여 IPC 채널(`writeExportChunk`)을 통해 청크 바이너리를 일렉트론 메인 프로세스로 실시간 스트리밍.
 *    - `mp4-muxer` 인스턴스 초기화 (AAC 오디오 트랙 및 AVC/H.264 비디오 트랙 바인딩).
 *    - VideoEncoder 및 AudioEncoder 설정 완료.
 *
 * 2. [비디오 프레임 레코딩 - recordFrame()]
 *    - 매 프레임 GPU 렌더 텍스처(GPUTexture)를 GPUDevice 명령을 사용해 Staging Buffer로 복사 (copyTextureToBuffer).
 *    - Staging Buffer 데이터를 CPU로 맵핑(mapAsync)하여 픽셀 어레이(Uint8Array) 획득.
 *    - BGRA/RGBA 포맷으로 마이크로초 단위의 고정밀 타임스탬프와 함께 `VideoFrame` 객체 생성.
 *    - VideoEncoder에 `VideoFrame` 전달 및 인코딩 요청 (일정 주기마다 Key Frame 인젝션).
 *    - 인코더 출력이 트리거되면 `mp4-muxer`에 Video Chunk 주입.
 *
 * 3. [오디오 트랙 레믹스 및 인코딩 - encodeAudioBuffer()]
 *    - 타임라인 내의 모든 Audio Layer를 스캔하여 오디오 주파수 소스 버퍼 캐시.
 *    - 100ms 단위 청크 루프로 다중 채널 오디오 데이터(Stereo 44.1kHz 기준)를 선형적으로 보간 및 합성(Mixing & Interpolation).
 *    - 합성된 파형 데이터를 기반으로 `AudioData` 객체를 정밀 마이크로초 단위의 타임스탬프와 함께 구성.
 *    - AudioEncoder에 `AudioData` 인코딩 요청.
 *    - 인코더 출력이 트리거되면 `mp4-muxer`에 Audio Chunk 주입.
 *
 * 4. [인코딩 종료 - finalize()]
 *    - 비디오/오디오 인코더를 플러시(flush)하여 잔여 청크를 모두 처리.
 *    - `mp4-muxer.finalize()`를 호출하여 MP4 파일 포맷의 메타데이터 헤더와 인덱스 테이블(MOOV)을 최종 빌드하고 완료.
 */
export class WebCodecsPipeline implements IExportPipeline {
  private encoder: VideoEncoder | null = null;
  private audioEncoder: AudioEncoder | null = null;
  private muxer: Muxer<StreamTarget> | null = null;
  private device: GPUDevice | null = null;
  private resolution = { width: 0, height: 0 };
  private frameCount = 0;

  public onProgress: ((frameIndex: number, totalFrames: number) => void) | null = null;
  public totalFrames = 0;

  public sourceFilePath: string | null = null;
  public exportId = '';

  // Removed setAudio in favor of timeline-aware mixing in encodeAudioBuffer

  async prepare(
    config: EncoderConfig,
    resolution: { width: number; height: number },
    device: GPUDevice,
    audioConfig?: { sampleRate: number; numberOfChannels: number },
  ): Promise<void> {
    this.device = device;
    this.resolution = resolution;
    this.frameCount = 0;

    const expectedVideoChunks = this.totalFrames;
    const expectedAudioChunks = audioConfig
      ? Math.ceil(this.totalFrames * 1.5) // Heuristic for muxer
      : 0;

    const target = new StreamTarget({
      onData: (data, position) => {
        if (!this.exportId) return;
        const chunkBuffer = data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength,
        ) as ArrayBuffer;
        window.api.writeExportChunk(this.exportId, chunkBuffer, position).catch((err: Error) => {
          console.error('[WebCodecsPipeline] IPC write chunk failed:', err);
        });
      },
      chunked: true,
      chunkSize: 8 * 1024 * 1024,
    });

    this.muxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width: resolution.width,
        height: resolution.height,
      },
      audio: audioConfig
        ? {
            codec: 'aac',
            numberOfChannels: audioConfig.numberOfChannels,
            sampleRate: audioConfig.sampleRate,
          }
        : undefined,
      fastStart: {
        expectedVideoChunks,
        expectedAudioChunks,
      },
    });

    const muxer = this.muxer;
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta ?? undefined);
      },
      error: (err) => {
        console.error('[WebCodecsPipeline] VideoEncoder error:', err);
      },
    });

    this.encoder.configure({
      codec: config.codec || 'avc1.640028',
      width: resolution.width,
      height: resolution.height,
      bitrate: config.bitrate,
      framerate: config.fps,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    });

    if (audioConfig) {
      this.audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          muxer.addAudioChunk(chunk, meta ?? undefined);
        },
        error: (err) => {
          console.error('[WebCodecsPipeline] AudioEncoder error:', err);
        },
      });

      this.audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: audioConfig.sampleRate,
        numberOfChannels: audioConfig.numberOfChannels,
        bitrate: 192_000,
      });
    }
  }

  private async prepareSceneFrame(scene: { layers: unknown[] }): Promise<void> {
    const pendingFrames = scene.layers
      .map((layer) => {
        const maybeLayerWithPrepareFrame = layer as { prepareFrame?: () => Promise<void> };
        return maybeLayerWithPrepareFrame.prepareFrame?.();
      })
      .filter((promise): promise is Promise<void> => Boolean(promise));

    if (pendingFrames.length > 0) {
      await Promise.all(pendingFrames);
    }
  }

  async recordFrame(texture: GPUTexture, timestamp: number): Promise<void> {
    if (!this.encoder || !this.device) {
      throw new Error('[WebCodecsPipeline] Pipeline이 초기화되지 않았습니다.');
    }

    const { width, height } = this.resolution;

    const bytesPerPixel = 4;
    const unpaddedBytesPerRow = width * bytesPerPixel;
    const alignedBytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256;

    const stagingBuffer = this.device.createBuffer({
      size: alignedBytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture },
      {
        buffer: stagingBuffer,
        bytesPerRow: alignedBytesPerRow,
        rowsPerImage: height,
      },
      { width, height, depthOrArrayLayers: 1 },
    );
    this.device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedData = stagingBuffer.getMappedRange();

    let pixelData: Uint8Array;
    if (alignedBytesPerRow === unpaddedBytesPerRow) {
      pixelData = new Uint8Array(mappedData.slice(0));
    } else {
      pixelData = new Uint8Array(unpaddedBytesPerRow * height);
      const src = new Uint8Array(mappedData);
      for (let row = 0; row < height; row++) {
        pixelData.set(
          src.subarray(row * alignedBytesPerRow, row * alignedBytesPerRow + unpaddedBytesPerRow),
          row * unpaddedBytesPerRow,
        );
      }
    }

    stagingBuffer.unmap();
    stagingBuffer.destroy();

    const isBGRA = texture.format.startsWith('bgra');
    const timestampMicroseconds = Math.round(timestamp * 1_000_000);
    const frame = new VideoFrame(pixelData, {
      format: isBGRA ? 'BGRA' : 'RGBA',
      codedWidth: width,
      codedHeight: height,
      timestamp: timestampMicroseconds,
    });

    const isKeyFrame = this.frameCount % 60 === 0;
    this.encoder.encode(frame, { keyFrame: isKeyFrame });
    frame.close();

    this.frameCount++;

    if (this.onProgress && this.totalFrames > 0) {
      this.onProgress(this.frameCount, this.totalFrames);
    }
  }

  private async encodeAudioBuffer(maxDuration: number, scene: IScene): Promise<void> {
    if (!this.audioEncoder) return;

    // [FIX] Standardized to 44.1kHz (source parity) for maximum fidelity
    const targetSampleRate = 44100;
    const numberOfChannels = 2; // Stereo
    const totalSamplesCount = Math.floor(maxDuration * targetSampleRate);

    // [OPTIM] 100ms chunk for stable encoder throughput
    const samplesPerChunk = Math.floor(targetSampleRate * 0.1);

    console.log(
      `[WebCodecsPipeline] Audio Mixer: Initiating Sample-Counter Indexing (${totalSamplesCount} samples)`,
    );

    const audioLayers = scene.layers.filter(
      (layer): layer is IAudioLayer =>
        getStudioLayerType(layer) === 'audio' && isAudioRuntimeLayer(layer),
    );

    // Pre-cache channel buffers
    const layerDataMap = new Map<string, Float32Array[]>();
    for (const layer of audioLayers) {
      if (layer.audioBuffer) {
        const channels: Float32Array[] = [];
        for (let ch = 0; ch < layer.audioBuffer.numberOfChannels; ch++) {
          channels.push(layer.audioBuffer.getChannelData(ch));
        }
        layerDataMap.set(layer.id, channels);
      }
    }

    for (
      let chunkStartSample = 0;
      chunkStartSample < totalSamplesCount;
      chunkStartSample += samplesPerChunk
    ) {
      const chunkSamples = Math.min(samplesPerChunk, totalSamplesCount - chunkStartSample);
      const interleavedData = new Float32Array(chunkSamples * numberOfChannels);

      // Mixing Process: Layer by Layer
      for (const layer of audioLayers) {
        const buffer = layer.audioBuffer;
        const channels = layerDataMap.get(layer.id);
        if (!buffer || !channels || layer.muted || layer.volume <= 0) continue;

        const sourceBufferRate = buffer.sampleRate;
        const resampleRatio = sourceBufferRate / targetSampleRate;

        // Global Timeline boundaries (integer sample counts)
        const layerStartGlobal = Math.round(layer.startTime * targetSampleRate);
        const layerDurationGlobal = Math.round(layer.duration * targetSampleRate);
        const layerEndGlobal = layerStartGlobal + layerDurationGlobal;
        const chunkEndGlobal = chunkStartSample + chunkSamples;

        // Bounds check: if layer is not in this chunk, skip
        if (chunkEndGlobal <= layerStartGlobal || chunkStartSample >= layerEndGlobal) continue;

        // Intersection range
        const mixStartGlobal = Math.max(chunkStartSample, layerStartGlobal);
        const mixEndGlobal = Math.min(chunkEndGlobal, layerEndGlobal);
        const mixCount = mixEndGlobal - mixStartGlobal;

        // Relative starting points
        const destStartOffset = mixStartGlobal - chunkStartSample;
        const layerRelativeSample = mixStartGlobal - layerStartGlobal;

        // [DDA] Setup stepping source index to avoid repeated division in inner loop
        // Starting sourceIndex: from project timeline -> layer local timeline -> source clip local
        const clipOffsetSamples = layer.clipOffset * sourceBufferRate;
        let sourceIndex = clipOffsetSamples + layerRelativeSample * resampleRatio;
        const vol = layer.volume;

        for (let i = 0; i < mixCount; i++) {
          const i1 = Math.floor(sourceIndex);
          if (i1 < 0 || i1 >= buffer.length) {
            sourceIndex += resampleRatio;
            continue;
          }

          const i2 = Math.min(i1 + 1, buffer.length - 1);
          const fract = sourceIndex - i1;

          // Optimized Lerp: a + (b - a) * t
          const destIdx = (destStartOffset + i) * numberOfChannels;

          // Assuming stereo mix (numberOfChannels = 2)
          for (let ch = 0; ch < numberOfChannels; ch++) {
            const chData = channels[ch < channels.length ? ch : 0];
            if (!chData) continue;

            const s1 = chData[i1] ?? 0;
            const s2 = chData[i2] ?? 0;
            // [ lerp(s1, s2, fract) ]
            const sample = s1 + (s2 - s1) * fract;

            // Accumulate samples (Clipping/Soft-limit deferred to next phase)
            interleavedData[destIdx + ch] += sample * vol;
          }

          sourceIndex += resampleRatio; // Atomic step forward
        }
      }

      // [PRECISION] Use high-precision microseconds for A/V sync stability
      // (chunkStartSample * 1_000_000) / targetSampleRate ensures no accumulation drift
      const timestampUs = Math.round((chunkStartSample * 1_000_000) / targetSampleRate);

      const data = new AudioData({
        format: 'f32',
        sampleRate: targetSampleRate,
        numberOfFrames: chunkSamples,
        numberOfChannels: numberOfChannels,
        timestamp: timestampUs,
        data: interleavedData,
      });

      this.audioEncoder.encode(data);
      data.close();

      // Yield for UI responsiveness (periodically)
      if (chunkStartSample % (samplesPerChunk * 20) === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  async finalize(): Promise<void> {
    if (this.encoder) {
      await this.encoder.flush();
      this.encoder.close();
    }

    if (this.audioEncoder) {
      await this.audioEncoder.flush();
      this.audioEncoder.close();
    }

    if (this.muxer) {
      this.muxer.finalize();
    }

    await window.api.finalizeExport(this.exportId);

    this.encoder = null;
    this.audioEncoder = null;
    this.muxer = null;
    this.exportId = '';
  }

  async abort(): Promise<void> {
    if (this.encoder && this.encoder.state !== 'closed') {
      try {
        this.encoder.close();
      } catch {}
    }
    if (this.audioEncoder && this.audioEncoder.state !== 'closed') {
      try {
        this.audioEncoder.close();
      } catch {}
    }

    if (this.exportId) {
      try {
        await window.api.abortExport(this.exportId);
      } catch {}
    }

    this.encoder = null;
    this.audioEncoder = null;
    this.muxer = null;
    this.exportId = '';
  }

  public async exportVideo(
    scene: IScene,
    options: {
      width: number;
      height: number;
      duration: number;
      fps: number;
      bitrate?: number;
      clearColor?: [number, number, number, number];
      onProgress?: (progress: number) => void;
    },
  ): Promise<void> {
    const {
      width,
      height,
      duration,
      fps,
      bitrate = 10_000_000,
      clearColor = (engineStore.getManifest().projectSettings.canvas.backgroundColor ??
        BACKGROUND_CONFIG.DEFAULT_COLOR) as [number, number, number, number],
      onProgress,
    } = options;

    const exportResponse = await window.api.prepareExport();
    if (!exportResponse.success || !exportResponse.exportId) {
      const errorMsg = exportResponse.error || 'User canceled or unknown error';
      throw new Error(`Failed to start export session: ${errorMsg}`);
    }
    this.exportId = exportResponse.exportId;

    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) throw new Error('WebGPU device not found');

    const renderTexture = device.createTexture({
      size: [width, height],
      format: 'bgra8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    this.totalFrames = Math.ceil(duration * fps);
    this.onProgress = (frame, total) => onProgress?.(frame / total);

    // [AUDIO] Detect if any audio layers exist to enable the audio track
    const hasAudio = scene.layers.some((l) => getStudioLayerType(l) === 'audio');
    const audioConfig = hasAudio ? { sampleRate: 44100, numberOfChannels: 2 } : undefined;

    await this.prepare(
      {
        codec: 'avc1.640028',
        bitrate,
        width,
        height,
        fps,
      },
      { width, height },
      device,
      audioConfig,
    );

    const wasRealtimePlaybackEnabled = AudioLayer.isRealtimePlaybackEnabled();
    const shouldResumeSharedContext = await AudioLayer.suspendSharedContext();

    AudioLayer.setRealtimePlaybackEnabled(false);

    try {
      // [FIX] Force setup for all layers with the new export device
      for (const layer of scene.layers) {
        if (!isRenderableRuntimeLayer(layer)) continue;
        if (!layer.isSetupFor(device)) {
          try {
            await layer.setup(device, 'bgra8unorm');
          } catch (err) {
            console.error(`[WebCodecsPipeline] Failed to setup layer ${layer.id} for export:`, err);
          }
        }
      }

      // [FIX] Ensure all "dirty" states (like text rendering) are processed before first frame
      scene.update(0, 0);

      // [AUDIO] Start audio encoding process (timeline-synchronized)
      if (this.audioEncoder) {
        await this.encodeAudioBuffer(duration, scene);
      }

      for (let i = 0; i < this.totalFrames; i++) {
        const currentTime = i / fps;
        const getAudioData = (audioId: string): Float32Array => {
          const layer = scene.getLayerById(audioId);
          if (!isAudioRuntimeLayer(layer)) return new Float32Array(2048);
          const freqData = layer.getFrequencyData(currentTime);
          if (!freqData) return new Float32Array(2048);
          const normalized = new Float32Array(freqData.length);
          for (let i = 0; i < freqData.length; i++) {
            normalized[i] = freqData[i] / 255;
          }
          return normalized;
        };
        scene.update(currentTime, 1 / fps, getAudioData);
        await this.prepareSceneFrame(scene);

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: renderTexture.createView(),
              clearValue: {
                r: clearColor[0],
                g: clearColor[1],
                b: clearColor[2],
                a: clearColor[3],
              },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });

        scene.draw({
          device,
          format: 'bgra8unorm',
          passEncoder,
          currentTime,
          deltaTime: 1 / fps,
          resolution: { width: scene.width, height: scene.height },
          viewportResolution: { width, height },
          sampleRate: audioConfig?.sampleRate ?? 44100,
        });

        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);

        await this.recordFrame(renderTexture, currentTime);
      }

      await this.finalize();
    } finally {
      AudioLayer.setRealtimePlaybackEnabled(wasRealtimePlaybackEnabled);
      if (shouldResumeSharedContext) {
        try {
          await AudioLayer.resumeSharedContext();
        } catch (err) {
          console.error(
            '[WebCodecsPipeline] Failed to resume shared audio context after export:',
            err,
          );
        }
      }
    }
  }
}
