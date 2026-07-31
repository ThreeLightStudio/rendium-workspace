import {
  IMAGE_CONFIG,
  type ImageFitMode,
  type LayerConfig,
  type MediaReadiness,
  type RenderContext,
} from '../../../_contracts';
import { isImageFitMode } from '../../../_utils/layerConfig';
import { createMatrix3, multiply } from '../../../_utils/matrix';
import { buildTransformMatrix } from '../../../_utils/transform';
import { AudioLayer } from '../../audio/AudioLayer';
import type { VisualDrawableProvider } from '../VisualDrawableProvider';
import type { VisualLayer } from '../VisualLayer';
import { resolveImageLayout } from './rasterLayout';

const PAUSED_SYNC_TOLERANCE_SECONDS = 1 / 120;
const PLAYBACK_DRIFT_TOLERANCE_SECONDS = 0.25;
const VIDEO_LOAD_TIMEOUT_MS = 8_000;

type VideoFrameRequestCallback = (
  now: DOMHighResTimeStamp,
  metadata: VideoFrameCallbackMetadata,
) => void;

type FrameAwareVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const SHADER_SOURCE = `
struct Uniforms {
	modelMatrix: mat4x4<f32>,
	opacity: f32,
	_pad1: f32,
	_pad2: f32,
	_pad3: f32,
	_extra_pad: array<vec4<f32>, 11>, // Pad to 256 bytes (64 floats)
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(0) @binding(1)
var textureSampler: sampler;

@group(0) @binding(2)
var sourceTexture: texture_2d<f32>;

struct VertexOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) texCoord: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
	var pos = vec2<f32>(0.0, 0.0);
	var texCoord = vec2<f32>(0.0, 0.0);
	
	switch (vertexIndex) {
		case 0u: { pos = vec2<f32>(0.0, 0.0); texCoord = vec2<f32>(0.0, 0.0); }
		case 1u: { pos = vec2<f32>(1.0, 0.0); texCoord = vec2<f32>(1.0, 0.0); }
		case 2u: { pos = vec2<f32>(0.0, 1.0); texCoord = vec2<f32>(0.0, 1.0); }
		case 3u: { pos = vec2<f32>(1.0, 0.0); texCoord = vec2<f32>(1.0, 0.0); }
		case 4u: { pos = vec2<f32>(1.0, 1.0); texCoord = vec2<f32>(1.0, 1.0); }
		case 5u: { pos = vec2<f32>(0.0, 1.0); texCoord = vec2<f32>(0.0, 1.0); }
		default: {}
	}
	
	let worldPos = uniforms.modelMatrix * vec4<f32>(pos, 0.0, 1.0);
	
	var output: VertexOutput;
	output.position = worldPos;
	output.texCoord = texCoord;
	return output;
}

@fragment
fn fs_main(@location(0) texCoord: vec2<f32>) -> @location(0) vec4<f32> {
	let color = textureSample(sourceTexture, textureSampler, texCoord);
	return vec4<f32>(color.rgb, color.a * uniforms.opacity);
}
`;

export class VideoDrawableProvider implements VisualDrawableProvider {
  public readonly providerKind = 'video';

  private _device: GPUDevice | null = null;
  private _pipeline: GPURenderPipeline | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _bindGroup: GPUBindGroup | null = null;
  private _texture: GPUTexture | null = null;
  private _retiredTextures: GPUTexture[] = [];
  private _retiredBuffers: GPUBuffer[] = [];
  private _sampler: GPUSampler | null = null;

  private _hasSource = false;
  private _sourceWidth = 0;
  private _sourceHeight = 0;
  private _persistedSourceWidth = 0;
  private _persistedSourceHeight = 0;
  private _source: VideoFrame | ImageBitmap | HTMLVideoElement | null = null;
  private _videoElement: HTMLVideoElement | null = null;
  private _sourceUrl: string | null = null;
  private _objectUrl: string | null = null;
  private _isLoading = false;
  private _mediaReadiness: MediaReadiness = 'ready';
  private _loadRevision = 0;
  private _isVideoPlaying = false;
  private _videoFrameDirty = true;
  private _videoFrameCallbackHandle: number | null = null;
  private _pendingVideoFrame: Promise<void> | null = null;
  private _needsVideoFramePreparation = false;
  public fit: ImageFitMode = IMAGE_CONFIG.DEFAULT_FIT;

  public getIntrinsicSize(): { width: number; height: number } {
    return {
      width: this._sourceWidth || this._persistedSourceWidth || 1,
      height: this._sourceHeight || this._persistedSourceHeight || 1,
    };
  }

  public isReady(): boolean {
    return this.getMediaReadiness() === 'ready';
  }

  public getMediaReadiness(): MediaReadiness {
    return this._sourceUrl ? this._mediaReadiness : 'ready';
  }

  public async setup(
    _host: VisualLayer,
    device: GPUDevice,
    format: GPUTextureFormat,
  ): Promise<void> {
    if (this._device && this._device !== device) {
      if (this._uniformBuffer) this._retireBuffer(this._uniformBuffer);
      this._uniformBuffer = null;
      if (this._texture) this._retireTexture(this._texture);
      this._texture = null;
      this._bindGroup = null;
      this._hasSource = false;
    }

    this._device = device;
    this._bindGroup = null;

    // Standardized to 256 bytes (64 floats)
    this._uniformBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    const shaderModule = device.createShaderModule({ code: SHADER_SOURCE });
    this._pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    if (this._source) {
      this._setSource(this._source);
    } else if (this._sourceUrl) {
      void this._loadVideo(this._sourceUrl);
    }
  }

  public update(host: VisualLayer, time: number, deltaTime: number): void {
    if (!this._videoElement || this._isLoading) return;

    const elapsed = time;
    const desiredTime = Math.max(0, (host.clipOffset ?? 0) + elapsed);

    if (deltaTime > 0 && AudioLayer.isRealtimePlaybackEnabled()) {
      this._syncPlayingVideo(desiredTime);
    } else {
      this._syncPausedVideo(desiredTime);
    }
  }

  public draw(host: VisualLayer, context: RenderContext): void {
    // If we have a video element, we need to upload its current frame to the texture
    if (
      this._videoElement &&
      this._videoElement.readyState >= 2 &&
      this._shouldUploadVideoFrame()
    ) {
      this._setSource(this._videoElement);
      this._videoFrameDirty = false;
    }

    if (!this._hasSource || !this._pipeline || !this._bindGroup || !this._uniformBuffer) return;

    const size = this.getIntrinsicSize();
    const layout = resolveImageLayout({
      canvasWidth: context.resolution.width,
      canvasHeight: context.resolution.height,
      sourceWidth: size.width,
      sourceHeight: size.height,
      position: host.position,
      scale: host.scale,
      fit: this.fit,
    });
    const layoutScale = {
      x: Math.max(1e-6, Math.abs(layout.width)) * (Math.sign(host.scale.x) || 1),
      y: Math.max(1e-6, Math.abs(layout.height)) * (Math.sign(host.scale.y) || 1),
    };
    const localMatrix = buildTransformMatrix(
      {
        position: { x: layout.x, y: layout.y },
        scale: layoutScale,
        rotation: host.rotation,
      },
      {
        bounds: { left: 0, top: 0, width: 1, height: 1 },
        anchor: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      },
    );
    const finalMatrix = createMatrix3();
    multiply(finalMatrix, context.state.matrix, localMatrix);
    this._updateUniforms(context.device, finalMatrix, host.opacity * context.state.opacity);

    context.passEncoder.setPipeline(this._pipeline);
    context.passEncoder.setBindGroup(0, this._bindGroup);
    context.passEncoder.draw(6);
  }

  public updateConfig(_host: VisualLayer, config: LayerConfig): void {
    if (isImageFitMode(config.fit)) {
      this.fit = config.fit;
    }
    if (Number.isFinite(config.sourceWidth) && Number(config.sourceWidth) > 0) {
      this._persistedSourceWidth = Number(config.sourceWidth);
    }
    if (Number.isFinite(config.sourceHeight) && Number(config.sourceHeight) > 0) {
      this._persistedSourceHeight = Number(config.sourceHeight);
    }

    if (config.sourceUrl !== undefined && config.sourceUrl !== this._sourceUrl) {
      this._clearSource();
      this._detachVideoElement();
      this._sourceUrl = config.sourceUrl;
      this._mediaReadiness = this._sourceUrl ? 'loading' : 'ready';
      if (this._sourceUrl) {
        void this._loadVideo(this._sourceUrl);
      } else {
        this._isLoading = false;
      }
    }

    if (config.source !== undefined) {
      const source = config.source;
      if (source === null) {
        this._source = null;
        this._clearSource();
      } else if (source && typeof source === 'object') {
        this._source = source as VideoFrame | ImageBitmap | HTMLVideoElement;
        this._setSource(this._source);
      }
    }
  }

  private _syncPlayingVideo(desiredTime: number): void {
    const videoElement = this._videoElement;
    if (!videoElement) return;

    const drift = Math.abs(videoElement.currentTime - desiredTime);
    if (drift > PLAYBACK_DRIFT_TOLERANCE_SECONDS) {
      videoElement.currentTime = desiredTime;
      this._videoFrameDirty = true;
    }

    if (videoElement.paused) {
      void videoElement.play().catch(() => {
        this._isVideoPlaying = false;
      });
    }
    this._isVideoPlaying = true;
    this._ensureVideoFrameCallback();
  }

  private _syncPausedVideo(desiredTime: number): void {
    const videoElement = this._videoElement;
    if (!videoElement) return;

    if (this._isVideoPlaying || !videoElement.paused) {
      videoElement.pause();
      this._isVideoPlaying = false;
    }

    if (Math.abs(videoElement.currentTime - desiredTime) > PAUSED_SYNC_TOLERANCE_SECONDS) {
      videoElement.currentTime = desiredTime;
      this._needsVideoFramePreparation = true;
      this._videoFrameDirty = true;
    }
  }

  public async prepareFrame(): Promise<void> {
    if (!this._needsVideoFramePreparation || !this._videoElement) return;

    const pendingVideoFrame = this._waitForPausedVideoFrame(
      this._videoElement as FrameAwareVideoElement,
    );
    this._pendingVideoFrame = pendingVideoFrame;
    await pendingVideoFrame;
    if (this._pendingVideoFrame === pendingVideoFrame) {
      this._pendingVideoFrame = null;
    }
    this._needsVideoFramePreparation = false;
    this._videoFrameDirty = true;
  }

  private async _waitForPausedVideoFrame(videoElement: FrameAwareVideoElement): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (timeout !== null) globalThis.clearTimeout(timeout);
        videoElement.removeEventListener('seeked', settle);
        videoElement.removeEventListener('error', settle);
        resolve();
      };
      timeout = globalThis.setTimeout(settle, 500);

      videoElement.addEventListener('seeked', settle, { once: true });
      videoElement.addEventListener('error', settle, { once: true });
    });

    await this._waitForVideoFrame(videoElement);
    this._videoFrameDirty = true;
  }

  private async _waitForVideoFrame(videoElement: FrameAwareVideoElement): Promise<void> {
    if (!videoElement.requestVideoFrameCallback) {
      await new Promise<void>((resolve) => {
        if (typeof globalThis.requestAnimationFrame === 'function') {
          globalThis.requestAnimationFrame(() => resolve());
        } else {
          globalThis.setTimeout(resolve, 0);
        }
      });
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (timeout !== null) globalThis.clearTimeout(timeout);
        resolve();
      };
      timeout = globalThis.setTimeout(settle, 250);
      videoElement.requestVideoFrameCallback(() => settle());
    });
  }

  private _shouldUploadVideoFrame(): boolean {
    if (!this._videoElement) return false;

    const videoElement = this._videoElement as FrameAwareVideoElement;
    return !videoElement.requestVideoFrameCallback || this._videoFrameDirty;
  }

  private _ensureVideoFrameCallback(): void {
    if (!this._videoElement || this._videoFrameCallbackHandle !== null) return;

    const videoElement = this._videoElement as FrameAwareVideoElement;
    if (!videoElement.requestVideoFrameCallback) return;

    this._videoFrameCallbackHandle = videoElement.requestVideoFrameCallback(() => {
      this._videoFrameCallbackHandle = null;
      this._videoFrameDirty = true;
      this._ensureVideoFrameCallback();
    });
  }

  private _cancelVideoFrameCallback(): void {
    if (!this._videoElement || this._videoFrameCallbackHandle === null) return;

    const videoElement = this._videoElement as FrameAwareVideoElement;
    videoElement.cancelVideoFrameCallback?.(this._videoFrameCallbackHandle);
    this._videoFrameCallbackHandle = null;
  }

  private _detachVideoElement(): void {
    this._loadRevision++;
    this._cancelVideoFrameCallback();
    if (this._videoElement && !this._videoElement.paused) {
      this._videoElement.pause();
    }
    this._isVideoPlaying = false;
    this._videoFrameDirty = true;
    this._videoElement?.parentNode?.removeChild(this._videoElement);
    this._videoElement = null;
    this._revokeObjectUrl();
  }

  private async _loadVideo(url: string): Promise<void> {
    const loadRevision = ++this._loadRevision;
    this._isLoading = true;
    this._mediaReadiness = 'loading';
    try {
      if (!this._videoElement) {
        this._videoElement = document.createElement('video');
        this._videoElement.muted = true;
        this._videoElement.preload = 'auto';
        this._videoElement.playsInline = true;

        // Ensure it is attached to DOM so Chromium decodes it properly
        this._videoElement.style.position = 'absolute';
        this._videoElement.style.width = '1px';
        this._videoElement.style.height = '1px';
        this._videoElement.style.opacity = '0';
        this._videoElement.style.pointerEvents = 'none';
        document.body.appendChild(this._videoElement);
      }

      this._cancelVideoFrameCallback();
      if (!this._videoElement.paused) {
        this._videoElement.pause();
      }
      this._isVideoPlaying = false;
      this._videoFrameDirty = true;

      const videoElement = this._videoElement;
      if (!videoElement) return;

      let finalUrl = url;
      if (!/^(data:|blob:|file:|https?:)/i.test(url)) {
        // Handle custom app protocol via API if needed, or assume it's a file path
        // For now, let's try to fetch it as a blob if it fails direct assignment
        try {
          const bytes = await this._readSourceBytes(url);
          if (!this._isCurrentLoad(videoElement, url, loadRevision)) return;
          const ext = url.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase() || '';
          let mimeType = 'video/mp4';
          if (ext === 'webm') mimeType = 'video/webm';
          else if (ext === 'ogg' || ext === 'ogv') mimeType = 'video/ogg';
          else if (ext === 'mov') mimeType = 'video/quicktime';
          else if (ext === 'mkv') mimeType = 'video/x-matroska';

          const blob = new Blob([bytes], { type: mimeType });
          finalUrl = URL.createObjectURL(blob);
        } catch (err) {
          console.error('[VideoDrawableProvider] Failed to read source bytes:', err);
        }
      }

      if (!this._isCurrentLoad(videoElement, url, loadRevision)) {
        if (finalUrl !== url) URL.revokeObjectURL(finalUrl);
        return;
      }
      this._revokeObjectUrl();
      this._objectUrl = finalUrl !== url ? finalUrl : null;
      videoElement.src = finalUrl;
      videoElement.load();
      await this._waitForVideoReady(videoElement, 'loadedmetadata');
      if (!this._isCurrentLoad(videoElement, url, loadRevision)) return;

      this._sourceWidth = videoElement.videoWidth;
      this._sourceHeight = videoElement.videoHeight;
      await this._waitForVideoReady(videoElement, 'loadeddata');
      if (!this._isCurrentLoad(videoElement, url, loadRevision)) return;

      // Force initial texture allocation
      this._videoFrameDirty = true;
      if (this._device && videoElement.readyState >= 2) {
        this._setSource(videoElement);
        this._videoFrameDirty = false;
      }
      this._ensureVideoFrameCallback();
      if (this._device && !this._hasSource) {
        throw new Error('The decoded first frame could not be uploaded to the preview texture.');
      }
      if (this._device) {
        this._mediaReadiness = 'ready';
      }
    } catch (err) {
      console.error('[VideoDrawableProvider] Failed to load video:', err);
      if (this._isCurrentLoad(this._videoElement, url, loadRevision)) {
        this._hasSource = false;
        this._mediaReadiness = 'failed';
      }
    } finally {
      if (this._loadRevision === loadRevision) {
        this._isLoading = false;
      }
    }
  }

  private _isCurrentLoad(
    videoElement: HTMLVideoElement | null,
    url: string,
    loadRevision: number,
  ): boolean {
    return (
      this._videoElement === videoElement &&
      this._sourceUrl === url &&
      this._loadRevision === loadRevision
    );
  }

  private _revokeObjectUrl(): void {
    if (!this._objectUrl) return;
    URL.revokeObjectURL(this._objectUrl);
    this._objectUrl = null;
  }

  private async _waitForVideoReady(
    videoElement: HTMLVideoElement,
    eventName: 'loadedmetadata' | 'loadeddata',
  ): Promise<void> {
    const requiredReadyState = eventName === 'loadedmetadata' ? 1 : 2;
    if (videoElement.readyState >= requiredReadyState) return;

    await new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;
      const cleanup = () => {
        videoElement.removeEventListener(eventName, handleReady);
        videoElement.removeEventListener('error', handleError);
        if (timeout !== null) globalThis.clearTimeout(timeout);
      };
      const handleReady = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(videoElement.error ?? new Error(`Video failed before ${eventName}.`));
      };

      videoElement.addEventListener(eventName, handleReady, { once: true });
      videoElement.addEventListener('error', handleError, { once: true });
      timeout = globalThis.setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out while waiting for ${eventName}.`));
      }, VIDEO_LOAD_TIMEOUT_MS);
    });
  }

  private async _readSourceBytes(url: string): Promise<ArrayBuffer> {
    const api = (
      globalThis as typeof globalThis & {
        api?: { readFileAsArrayBuffer: (filePath: string) => Promise<ArrayBuffer> };
      }
    ).api;

    if (!api?.readFileAsArrayBuffer) {
      const resp = await fetch(url);
      return await resp.arrayBuffer();
    }

    return await api.readFileAsArrayBuffer(url);
  }

  private _setSource(source: VideoFrame | ImageBitmap | HTMLVideoElement): void {
    if (!this._device || !this._pipeline || !this._sampler || !this._uniformBuffer) return;

    const { width, height } = this._resolveSourceSize(source);
    if (width <= 0 || height <= 0) {
      this._clearSource();
      return;
    }

    const sizeChanged = width !== this._sourceWidth || height !== this._sourceHeight;
    this._sourceWidth = width;
    this._sourceHeight = height;

    if (sizeChanged || !this._texture || !this._bindGroup) {
      if (this._texture) {
        this._retireTexture(this._texture);
      }

      this._texture = this._device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });

      this._bindGroup = this._device.createBindGroup({
        layout: this._pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this._uniformBuffer } },
          { binding: 1, resource: this._sampler },
          { binding: 2, resource: this._texture.createView() },
        ],
      });
    }

    if (!this._texture) return;

    this._device.queue.copyExternalImageToTexture({ source }, { texture: this._texture }, [
      width,
      height,
    ]);

    this._hasSource = true;
  }

  private _retireTexture(texture: GPUTexture): void {
    this._retiredTextures.push(texture);

    const device = this._device;
    const destroyTexture = () => {
      const index = this._retiredTextures.indexOf(texture);
      if (index < 0) return;

      this._retiredTextures.splice(index, 1);
      texture.destroy();
    };

    if (!device) {
      destroyTexture();
      return;
    }

    void device.queue.onSubmittedWorkDone().then(destroyTexture, destroyTexture);
  }

  private _retireBuffer(buffer: GPUBuffer): void {
    this._retiredBuffers.push(buffer);

    const device = this._device;
    const destroyBuffer = () => {
      const index = this._retiredBuffers.indexOf(buffer);
      if (index < 0) return;

      this._retiredBuffers.splice(index, 1);
      buffer.destroy();
    };

    if (!device) {
      destroyBuffer();
      return;
    }

    void device.queue.onSubmittedWorkDone().then(destroyBuffer, destroyBuffer);
  }

  private _clearSource(): void {
    if (this._texture) this._retireTexture(this._texture);
    this._texture = null;
    this._bindGroup = null;
    this._hasSource = false;
    this._sourceWidth = 0;
    this._sourceHeight = 0;
    this._videoFrameDirty = true;
  }

  private _resolveSourceSize(source: VideoFrame | ImageBitmap | HTMLVideoElement): {
    width: number;
    height: number;
  } {
    const readDimension = (...candidates: unknown[]): number => {
      for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
          return candidate;
        }
      }

      return 0;
    };

    if ('displayWidth' in source) {
      return {
        width: readDimension(source.displayWidth),
        height: readDimension(source.displayHeight),
      };
    }

    if ('videoWidth' in source && 'videoHeight' in source) {
      return {
        width: readDimension(source.videoWidth, source.width),
        height: readDimension(source.videoHeight, source.height),
      };
    }

    return {
      width: readDimension(source.width),
      height: readDimension(source.height),
    };
  }

  private _updateUniforms(device: GPUDevice, matrix: Float32Array, stackOpacity: number): void {
    if (!this._uniformBuffer) return;

    // Convert 3x3 to 4x4
    // Input matrix is [m0, m1, m2, m3, m4, m5, m6, m7, m8]
    const [i0 = 0, i1 = 0, _i2 = 0, i3 = 0, i4 = 0, _i5 = 0, i6 = 0, i7 = 0, _i8 = 0] = matrix;
    const m4x4 = new Float32Array(16);
    m4x4[0] = i0;
    m4x4[1] = i1;
    m4x4[2] = 0;
    m4x4[3] = 0;
    m4x4[4] = i3;
    m4x4[5] = i4;
    m4x4[6] = 0;
    m4x4[7] = 0;
    m4x4[8] = 0;
    m4x4[9] = 0;
    m4x4[10] = 1;
    m4x4[11] = 0;
    m4x4[12] = i6;
    m4x4[13] = i7;
    m4x4[14] = 0;
    m4x4[15] = 1;

    const uniformData = new Float32Array(64); // 256 bytes (64 floats)
    uniformData.set(m4x4, 0);
    uniformData[16] = stackOpacity;
    // 17, 18, 19 + 20-27 are padding/extra_pad

    device.queue.writeBuffer(this._uniformBuffer, 0, uniformData);
  }

  public dispose(): void {
    if (this._uniformBuffer) this._retireBuffer(this._uniformBuffer);
    if (this._texture) this._retireTexture(this._texture);
    this._detachVideoElement();
    this._source = null;
    this._uniformBuffer = null;
    this._texture = null;
    this._bindGroup = null;
    this._hasSource = false;
    this._device = null;
  }

  public getConfig(): Partial<LayerConfig> {
    const config: LayerConfig = {
      fit: this.fit,
    };
    if (this._sourceUrl !== null) {
      config.sourceUrl = this._sourceUrl;
    }
    if (this._persistedSourceWidth > 0) {
      config.sourceWidth = this._persistedSourceWidth;
    } else if (this._sourceWidth > 0) {
      config.sourceWidth = this._sourceWidth;
    }
    if (this._persistedSourceHeight > 0) {
      config.sourceHeight = this._persistedSourceHeight;
    } else if (this._sourceHeight > 0) {
      config.sourceHeight = this._sourceHeight;
    }
    return config;
  }
}
