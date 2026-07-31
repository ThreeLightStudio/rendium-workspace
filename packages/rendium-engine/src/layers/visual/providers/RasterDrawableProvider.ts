import {
  IMAGE_CONFIG,
  type ImageFitMode,
  type LayerConfig,
  type RenderContext,
  SCENE_CONFIG,
} from '../../../_contracts';
import { isImageFitMode, isLayerConfigColorTuple } from '../../../_utils/layerConfig';
import { createMatrix3, multiply } from '../../../_utils/matrix';
import { buildTransformMatrix } from '../../../_utils/transform';
import type { VisualDrawableProvider } from '../VisualDrawableProvider';
import type { VisualLayer } from '../VisualLayer';
import { resolveImageLayout } from './rasterLayout';

const SHADER_SOURCE = `
struct Uniforms {
	modelMatrix: mat4x4<f32>,
	opacity: f32,
	_pad1: f32,
	_pad2: vec2<f32>,
	color: vec4<f32>,
	_extra_pad: array<vec4<f32>, 10>, // Pad to 256 bytes (64 floats)
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
	let textureColor = textureSample(sourceTexture, textureSampler, texCoord);
	let placeholderColor = vec3<f32>(0.72, 0.72, 0.72);
	let compositedRgb = placeholderColor * (1.0 - textureColor.a) + textureColor.rgb * textureColor.a;
	return vec4<f32>(compositedRgb * uniforms.color.rgb, uniforms.opacity * uniforms.color.a);
}
`;

export const IMAGE_PLACEHOLDER_TEXTURE_SIZE = 64;

export function createImagePlaceholderTextureData(
  size = IMAGE_PLACEHOLDER_TEXTURE_SIZE,
): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(new ArrayBuffer(size * size * 4));
  const border = Math.max(2, Math.floor(size / 16));
  const lineWidth = Math.max(2, Math.floor(size / 18));
  const checkerSize = Math.max(4, Math.floor(size / 8));
  const iconLeft = Math.floor(size * 0.24);
  const iconRight = Math.floor(size * 0.76);
  const iconTop = Math.floor(size * 0.26);
  const iconBottom = Math.floor(size * 0.74);
  const sunCx = Math.floor(size * 0.64);
  const sunCy = Math.floor(size * 0.38);
  const sunRadius = Math.max(3, Math.floor(size * 0.07));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const checker = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2;
      let r = checker === 0 ? 80 : 100;
      let g = checker === 0 ? 88 : 110;
      let b = checker === 0 ? 105 : 130;

      const isBorder = x < border || y < border || x >= size - border || y >= size - border;
      const isFrame =
        x >= iconLeft &&
        x <= iconRight &&
        y >= iconTop &&
        y <= iconBottom &&
        (x - iconLeft < lineWidth ||
          iconRight - x < lineWidth ||
          y - iconTop < lineWidth ||
          iconBottom - y < lineWidth);
      const sunDistance = Math.hypot(x - sunCx, y - sunCy);
      const isSun = sunDistance <= sunRadius;
      const mountainY =
        iconBottom -
        lineWidth -
        Math.abs(x - Math.floor(size * 0.43)) * 0.56 -
        Math.max(0, x - Math.floor(size * 0.53)) * 0.14;
      const isMountain =
        x >= iconLeft + lineWidth &&
        x <= iconRight - lineWidth &&
        y >= mountainY &&
        y <= iconBottom - lineWidth;

      if (isBorder || isFrame) {
        r = 160;
        g = 220;
        b = 255;
      } else if (isSun) {
        r = 255;
        g = 250;
        b = 200;
      } else if (isMountain) {
        r = 120;
        g = 190;
        b = 230;
      }

      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }

  return data;
}

function isGpuTexture(source: ImageBitmap | GPUTexture): source is GPUTexture {
  return typeof GPUTexture !== 'undefined' && source instanceof GPUTexture;
}

function isBindableImageSource(source: unknown): source is ImageBitmap | GPUTexture {
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return true;
  }
  if (typeof GPUTexture !== 'undefined' && source instanceof GPUTexture) {
    return true;
  }
  if (!source || typeof source !== 'object') {
    return false;
  }

  const maybeBitmap = source as { width?: unknown; height?: unknown };
  return (
    typeof maybeBitmap.width === 'number' &&
    Number.isFinite(maybeBitmap.width) &&
    typeof maybeBitmap.height === 'number' &&
    Number.isFinite(maybeBitmap.height)
  );
}

export class RasterDrawableProvider implements VisualDrawableProvider {
  public readonly providerKind = 'raster';

  private _device: GPUDevice | null = null;
  private _pipeline: GPURenderPipeline | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _bindGroup: GPUBindGroup | null = null;
  private _texture: GPUTexture | null = null;
  private _sampler: GPUSampler | null = null;
  private _defaultTexture: GPUTexture | null = null;
  private _canvasWidth = Number(SCENE_CONFIG.DEFAULT_RESOLUTION.width);
  private _canvasHeight = Number(SCENE_CONFIG.DEFAULT_RESOLUTION.height);

  public imageSource: ImageBitmap | GPUTexture | null = null;
  public sourceUrl: string | null = null;
  public color: [number, number, number, number] = [1, 1, 1, 1];
  public fit: ImageFitMode = IMAGE_CONFIG.DEFAULT_FIT;
  private _hasImage = false;
  private _sourceWidth = 0;
  private _sourceHeight = 0;
  private _persistedSourceWidth = 0;
  private _persistedSourceHeight = 0;
  private _loadToken = 0;

  public initialize(host: VisualLayer): void {
    host.opacity = IMAGE_CONFIG.DEFAULT_OPACITY;
    host.scale = { ...IMAGE_CONFIG.DEFAULT_SCALE };
  }

  public getIntrinsicSize(): { width: number; height: number } {
    return {
      width: this._sourceWidth || this._persistedSourceWidth || this._canvasWidth,
      height: this._sourceHeight || this._persistedSourceHeight || this._canvasHeight,
    };
  }

  public async setup(
    _host: VisualLayer,
    device: GPUDevice,
    format: GPUTextureFormat,
  ): Promise<void> {
    if (this._device && this._device !== device) {
      this._uniformBuffer?.destroy();
      this._texture?.destroy();
      this._defaultTexture?.destroy();
      this._bindGroup = null;
    }

    this._device = device;

    // Standardized to 256 bytes (64 floats)
    this._uniformBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    const placeholderSize = IMAGE_PLACEHOLDER_TEXTURE_SIZE;
    this._defaultTexture = device.createTexture({
      size: [placeholderSize, placeholderSize],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    const placeholderData = createImagePlaceholderTextureData(placeholderSize);
    device.queue.writeTexture(
      { texture: this._defaultTexture },
      placeholderData,
      { bytesPerRow: placeholderSize * 4 },
      [placeholderSize, placeholderSize],
    );

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

    // [FIX] Ensure we recreate textures for the new device
    if (this.imageSource && isBindableImageSource(this.imageSource)) {
      this._setImage(this.imageSource);
    } else if (this.sourceUrl) {
      this._updateBindGroup(); // Instant placeholder while loading
      void this._loadImageFromSourceUrl(this.sourceUrl);
    } else {
      this._updateBindGroup();
    }
  }

  public update(_host: VisualLayer, _time: number, _deltaTime: number): void {}

  public draw(host: VisualLayer, context: RenderContext): void {
    if (!this._pipeline || !this._bindGroup || !this._uniformBuffer) {
      return;
    }

    this._canvasWidth = context.resolution.width;
    this._canvasHeight = context.resolution.height;

    const layout = resolveImageLayout({
      canvasWidth: this._canvasWidth,
      canvasHeight: this._canvasHeight,
      sourceWidth: this.getIntrinsicSize().width,
      sourceHeight: this.getIntrinsicSize().height,
      position: host.position,
      scale: host.scale,
      fit: this.fit,
    });

    const finalMatrix = createMatrix3();
    const layoutScale = {
      x: Math.max(1, Math.abs(layout.width)) * (layout.width < 0 ? -1 : 1),
      y: Math.max(1, Math.abs(layout.height)) * (layout.height < 0 ? -1 : 1),
    };
    const localMatrix = buildTransformMatrix(
      {
        position: { x: layout.x, y: layout.y },
        scale: layoutScale,
        rotation: host.rotation,
      },
      {
        bounds: {
          left: 0,
          top: 0,
          width: 1,
          height: 1,
        },
        anchor: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      },
    );

    multiply(finalMatrix, context.state.matrix, localMatrix);

    this._updateUniforms(context.device, finalMatrix, context.state.opacity);

    context.passEncoder.setPipeline(this._pipeline);
    context.passEncoder.setBindGroup(0, this._bindGroup);
    context.passEncoder.draw(6);
  }

  public updateConfig(_host: VisualLayer, config: LayerConfig): void {
    const hasRuntimeSourcePatch = config.imageSource !== undefined || config.source !== undefined;

    if (config.sourceUrl !== undefined) {
      const previousSourceUrl = this.sourceUrl;
      const sourceUrlChanged = config.sourceUrl !== previousSourceUrl;

      if (sourceUrlChanged) {
        this._persistedSourceWidth = 0;
        this._persistedSourceHeight = 0;
      }
      this.sourceUrl = config.sourceUrl;
      if (!this.sourceUrl) {
        this._loadToken++;
        this.imageSource = null;
        this._setImage(null);
      } else if (hasRuntimeSourcePatch) {
        if (sourceUrlChanged) {
          this._loadToken++;
        }
        this._updateBindGroup();
      } else {
        const hasBindableRuntimeSource = isBindableImageSource(this.imageSource);
        const shouldLoadSourceUrl = sourceUrlChanged || !hasBindableRuntimeSource;

        if (shouldLoadSourceUrl) {
          if (sourceUrlChanged) {
            this.imageSource = null;
            this._setImage(null);
            this._updateBindGroup(); // Instant placeholder while loading
            void this._loadImageFromSourceUrl(this.sourceUrl);
          } else {
            this._updateBindGroup();
          }
        }
      }
    }

    if (config.imageSource !== undefined || config.source !== undefined) {
      const rawSource = config.imageSource ?? config.source;
      if (typeof rawSource === 'string') {
        if (rawSource !== this.sourceUrl) {
          this._persistedSourceWidth = 0;
          this._persistedSourceHeight = 0;
          this.sourceUrl = rawSource;
          this.imageSource = null;
          this._setImage(null);
          this._updateBindGroup(); // Instant placeholder while loading
          void this._loadImageFromSourceUrl(rawSource);
        }
      } else if (rawSource && typeof rawSource === 'object') {
        this.imageSource = rawSource as ImageBitmap | GPUTexture | null;
        if (isBindableImageSource(this.imageSource)) {
          this._setImage(this.imageSource);
        } else {
          this._updateBindGroup();
        }
      }
    }
    if (isImageFitMode(config.fit)) {
      this.fit = config.fit;
    }
    if (Number.isFinite(config.sourceWidth) && Number(config.sourceWidth) > 0) {
      this._persistedSourceWidth = Number(config.sourceWidth);
    }
    if (Number.isFinite(config.sourceHeight) && Number(config.sourceHeight) > 0) {
      this._persistedSourceHeight = Number(config.sourceHeight);
    }
    if (isLayerConfigColorTuple(config.color)) {
      this.color = config.color;
    }
  }

  private async _loadImageFromSourceUrl(sourceUrl: string): Promise<void> {
    const token = ++this._loadToken;
    try {
      const bitmap = await this._loadBitmap(sourceUrl);
      if (token !== this._loadToken) {
        return;
      }
      this.imageSource = bitmap;
      this._setImage(bitmap);
    } catch (error) {
      if (token !== this._loadToken) {
        return;
      }
      console.error(
        '[RasterDrawableProvider] Failed to load image from sourceUrl:',
        sourceUrl,
        error,
      );
      this.imageSource = null;
      this._setImage(null);
    }
  }

  private async _loadBitmap(sourceUrl: string): Promise<ImageBitmap> {
    const bytes = await this._readSourceBytes(sourceUrl);
    const blob = new Blob([bytes]);
    return createImageBitmap(blob);
  }

  private async _readSourceBytes(sourceUrl: string): Promise<ArrayBuffer> {
    if (/^(data:|blob:|file:|https?:)/i.test(sourceUrl)) {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
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

    return await api.readFileAsArrayBuffer(sourceUrl);
  }

  private _setImage(source: ImageBitmap | GPUTexture | null): void {
    if (!this._device || !this._pipeline) return;

    if (!source) {
      this._hasImage = false;
      this._sourceWidth = 0;
      this._sourceHeight = 0;
      this._updateBindGroup();
      return;
    }

    if (this._texture && !isGpuTexture(source)) {
      this._texture.destroy();
    }

    if (isGpuTexture(source)) {
      this._texture = source;
      this._sourceWidth = source.width;
      this._sourceHeight = source.height;
    } else {
      // It's an ImageBitmap (or so we think)
      this._sourceWidth = Math.max(1, source.width);
      this._sourceHeight = Math.max(1, source.height);

      if (!Number.isFinite(this._sourceWidth) || !Number.isFinite(this._sourceHeight)) {
        console.warn('[RasterDrawableProvider] Invalid ImageBitmap dimensions:', source);
        this._hasImage = false;
        this._updateBindGroup();
        return;
      }

      this._texture = this._device.createTexture({
        size: [this._sourceWidth, this._sourceHeight],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this._device.queue.copyExternalImageToTexture({ source }, { texture: this._texture }, [
        this._sourceWidth,
        this._sourceHeight,
      ]);
    }

    this._hasImage = true;
    this._updateBindGroup();
  }

  private _updateBindGroup(): void {
    if (!this._device || !this._pipeline || !this._sampler || !this._uniformBuffer) return;

    const textureView =
      this._hasImage && this._texture
        ? this._texture.createView()
        : this._defaultTexture?.createView();

    if (!textureView) return;

    this._bindGroup = this._device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
        { binding: 1, resource: this._sampler },
        { binding: 2, resource: textureView },
      ],
    });
  }

  private _updateUniforms(device: GPUDevice, matrix: Float32Array, stackOpacity: number): void {
    if (!this._uniformBuffer) return;

    // Convert 3x3 to 4x4
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

    const data = new Float32Array(64); // 256 bytes (64 floats)
    data.set(m4x4, 0);
    data[16] = stackOpacity;
    // 17, 18, 19 are padding
    data.set(this.color, 20);
    // 24, 25, 26, 27 are extra padding

    device.queue.writeBuffer(this._uniformBuffer, 0, data);
  }

  public dispose(): void {
    this._uniformBuffer?.destroy();
    this._texture?.destroy();
    this._defaultTexture?.destroy();
    this._device = null;
  }

  public getConfig(): Partial<LayerConfig> {
    const config: LayerConfig = {
      imageSource: this.imageSource,
      fit: this.fit,
      color: [...this.color],
    };

    if (this.sourceUrl !== null) {
      config.sourceUrl = this.sourceUrl;
    }
    if (this._persistedSourceWidth > 0) {
      config.sourceWidth = this._persistedSourceWidth;
    }
    if (this._persistedSourceHeight > 0) {
      config.sourceHeight = this._persistedSourceHeight;
    }

    return config;
  }
}
