import { type LayerConfig, type RenderContext, TEXT_CONFIG } from '../../../_contracts';
import { isLayerConfigColorTuple } from '../../../_utils/layerConfig';
import { createMatrix3, multiply } from '../../../_utils/matrix';
import { type BoxGeometryDescriptor, buildTransformMatrix } from '../../../_utils/transform';
import type { VisualDrawableProvider } from '../VisualDrawableProvider';
import type { VisualLayer } from '../VisualLayer';

export type TextMetricsLike = Pick<TextMetrics, 'width'> &
  Partial<
    Pick<
      TextMetrics,
      | 'actualBoundingBoxAscent'
      | 'actualBoundingBoxDescent'
      | 'fontBoundingBoxAscent'
      | 'fontBoundingBoxDescent'
    >
  >;

export function resolveTextCanvasHeight(
  metrics: TextMetricsLike,
  fontSize: number,
  padding: number,
): number {
  const actualHeight =
    typeof metrics.actualBoundingBoxAscent === 'number' &&
    typeof metrics.actualBoundingBoxDescent === 'number'
      ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      : typeof metrics.fontBoundingBoxAscent === 'number' &&
          typeof metrics.fontBoundingBoxDescent === 'number'
        ? metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent
        : fontSize * 1.4;

  return Math.ceil(actualHeight + padding);
}

const MAX_TEXT_RASTER_SCALE = 4;

export function resolveTextRasterScale(
  scale: { x: number; y: number },
  devicePixelRatio: number = globalThis.devicePixelRatio || 1,
): number {
  const magnitude = Math.max(Math.abs(scale.x), Math.abs(scale.y));
  const rasterScale = magnitude * Math.max(1, devicePixelRatio || 1);
  return Math.max(1, Math.min(MAX_TEXT_RASTER_SCALE, rasterScale));
}

const SHADER_SOURCE = `
struct Uniforms {
	modelMatrix: mat4x4<f32>,
	color: vec4<f32>,
	opacity: f32,
	_pad1: f32,
	_pad2: f32,
	_pad3: f32,
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
	@location(1) color: vec4<f32>,
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
	output.color = uniforms.color;
	return output;
}

@fragment
fn fs_main(@location(0) texCoord: vec2<f32>, @location(1) color: vec4<f32>) -> @location(0) vec4<f32> {
	let textureColor = textureSample(sourceTexture, textureSampler, texCoord);
	return vec4<f32>(textureColor.rgb * color.rgb, textureColor.a * color.a * uniforms.opacity);
}
`;

export class TextDrawableProvider implements VisualDrawableProvider {
  public readonly providerKind = 'text';

  public text = 'Text';
  public fontFamily: string = TEXT_CONFIG.DEFAULT_FONT_FAMILY;
  public fontSize: number = TEXT_CONFIG.DEFAULT_FONT_SIZE;
  public fontWeight: string | number = 'bold';
  public color: [number, number, number, number] = [...TEXT_CONFIG.DEFAULT_COLOR];
  public align: 'left' | 'center' | 'right' = TEXT_CONFIG.DEFAULT_ALIGN;
  public outlineColor: [number, number, number, number] = [...TEXT_CONFIG.DEFAULT_OUTLINE_COLOR];
  public outlineWidth: number = TEXT_CONFIG.DEFAULT_OUTLINE_WIDTH;
  public anchor: { x: number; y: number } = { ...TEXT_CONFIG.DEFAULT_ANCHOR };

  private _pipeline: GPURenderPipeline | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _bindGroup: GPUBindGroup | null = null;
  private _texture: GPUTexture | null = null;
  private _sampler: GPUSampler | null = null;
  private _dirty = true;
  private _textWidth = 0;
  private _textHeight = 0;
  private _rasterScale = 1;
  private _device: GPUDevice | null = null;

  public getIntrinsicSize(): { width: number; height: number } {
    return { width: this._textWidth || 100, height: this._textHeight || 30 };
  }

  private _buildTextMatrix(host: VisualLayer): Float32Array {
    const textWidth = Math.max(1e-6, this._textWidth || 100);
    const textHeight = Math.max(1e-6, this._textHeight || 30);

    return buildTransformMatrix(
      {
        position: host.position,
        scale: {
          x: textWidth * host.scale.x,
          y: textHeight * host.scale.y,
        },
        rotation: host.rotation,
      },
      {
        // Text is rasterized into a unit quad; the actual pixel size is baked
        // into the transform scale so the rendered quad matches the texture.
        bounds: {
          left: 0,
          top: 0,
          width: 1,
          height: 1,
        },
        anchor: { x: this.anchor.x, y: this.anchor.y },
        pivot: { x: 0.5, y: 0.5 },
      },
    );
  }

  public getTransformDescriptor(): BoxGeometryDescriptor {
    return {
      bounds: {
        left: 0,
        top: 0,
        width: Math.max(1e-6, this.getIntrinsicSize().width),
        height: Math.max(1e-6, this.getIntrinsicSize().height),
      },
      anchor: { x: this.anchor.x, y: this.anchor.y },
      pivot: { x: 0.5, y: 0.5 },
    };
  }

  public getLocalMatrix(host: VisualLayer): Float32Array {
    const matrix = this._buildTextMatrix(host);
    host.transform._localMatrix.set(matrix);
    return host.transform._localMatrix;
  }

  public async setup(
    _host: VisualLayer,
    device: GPUDevice,
    format: GPUTextureFormat,
  ): Promise<void> {
    if (this._device && this._device !== device) {
      this._uniformBuffer?.destroy();
      this._texture?.destroy();
      this._bindGroup = null;
    }

    this._device = device;

    // [FIX] Force re-render of text on next update
    this._dirty = true;

    // Standardized to 256 bytes (64 floats) to ensure platform compatibility
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
  }

  public update(host: VisualLayer, _time: number, _deltaTime: number): void {
    const desiredRasterScale = resolveTextRasterScale(host.scale);
    if (Math.abs(desiredRasterScale - this._rasterScale) > 0.05) {
      this._dirty = true;
    }

    if (this._dirty && this._device) {
      this._renderText(host);
      this._dirty = false;
    }
  }

  public draw(host: VisualLayer, context: RenderContext): void {
    if (!this._pipeline || !this._bindGroup || !this._uniformBuffer) return;

    const finalMatrix = createMatrix3();
    const localMatrix = this._buildTextMatrix(host);

    multiply(finalMatrix, context.state.matrix, localMatrix);

    this._updateUniforms(context.device, finalMatrix, host.opacity * context.state.opacity);

    context.passEncoder.setPipeline(this._pipeline);
    context.passEncoder.setBindGroup(0, this._bindGroup);
    context.passEncoder.draw(6);
  }

  public updateConfig(_host: VisualLayer, config: LayerConfig): void {
    if (typeof config.text === 'string') {
      this.text = config.text;
      this._dirty = true;
    }
    if (typeof config.fontSize === 'number') {
      this.fontSize = config.fontSize;
      this._dirty = true;
    }
    if (typeof config.fontFamily === 'string') {
      this.fontFamily = config.fontFamily;
      this._dirty = true;
    }
    if (typeof config.fontWeight === 'string' || typeof config.fontWeight === 'number') {
      this.fontWeight = config.fontWeight;
      this._dirty = true;
    }
    if (isLayerConfigColorTuple(config.color)) {
      this.color = config.color;
    }
    if (config.align) {
      this.align = config.align;
      this._dirty = true;
    }
    if (isLayerConfigColorTuple(config.outlineColor)) {
      this.outlineColor = config.outlineColor;
      this._dirty = true;
    }
    if (typeof config.outlineWidth === 'number') {
      this.outlineWidth = config.outlineWidth;
      this._dirty = true;
    }
    if (config.anchor && typeof config.anchor === 'object') {
      const anchor = config.anchor as { x?: unknown; y?: unknown };
      if (typeof anchor.x === 'number' && typeof anchor.y === 'number') {
        this.anchor = { x: anchor.x, y: anchor.y };
        this._dirty = true;
      }
    }
  }

  private _renderText(host: VisualLayer): void {
    if (!this._device || !this._pipeline || !this._sampler || !this._uniformBuffer) return;

    const desiredRasterScale = resolveTextRasterScale(host.scale);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    const metrics = ctx.measureText(this.text);
    const textWidth = Math.ceil(metrics.width);

    // Add padding for outline width to avoid clipping
    const padding = this.outlineWidth * 2 + 16;
    this._textWidth = textWidth + padding;
    this._textHeight = resolveTextCanvasHeight(metrics, this.fontSize, padding);
    this._rasterScale = desiredRasterScale;

    const rasterWidth = Math.max(1, Math.ceil(this._textWidth * desiredRasterScale));
    const rasterHeight = Math.max(1, Math.ceil(this._textHeight * desiredRasterScale));
    canvas.width = rasterWidth;
    canvas.height = rasterHeight;

    const resizedCtx = canvas.getContext('2d');
    if (!resizedCtx) return;

    resizedCtx.scale(desiredRasterScale, desiredRasterScale);
    resizedCtx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    resizedCtx.textAlign = this.align;
    resizedCtx.textBaseline = 'middle';

    const centerX = this._textWidth / 2;
    const centerY = this._textHeight / 2;

    // 1. Draw Outline (if width > 0)
    if (this.outlineWidth > 0) {
      const [r, g, b, a] = this.outlineColor;
      resizedCtx.strokeStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
      resizedCtx.lineWidth = this.outlineWidth;
      resizedCtx.strokeText(this.text, centerX, centerY);
    }

    // 2. Draw Fill
    resizedCtx.fillStyle = 'white'; // White fill, color uniform multipliers in shader
    resizedCtx.fillText(this.text, centerX, centerY);

    if (this._texture) this._texture.destroy();
    this._texture = this._device.createTexture({
      size: [rasterWidth, rasterHeight],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this._device.queue.copyExternalImageToTexture({ source: canvas }, { texture: this._texture }, [
      rasterWidth,
      rasterHeight,
    ]);

    this._bindGroup = this._device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
        { binding: 1, resource: this._sampler },
        { binding: 2, resource: this._texture.createView() },
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
    data.set(this.color, 16);
    data[20] = stackOpacity;

    device.queue.writeBuffer(this._uniformBuffer, 0, data);
  }

  public dispose(): void {
    this._uniformBuffer?.destroy();
    this._texture?.destroy();
    this._device = null;
  }

  public getConfig(): Partial<LayerConfig> {
    const config: LayerConfig = {};
    config.text = this.text;
    config.fontFamily = this.fontFamily;
    config.fontSize = this.fontSize;
    config.fontWeight = this.fontWeight;
    config.color = [...this.color];
    config.align = this.align;
    config.outlineColor = [...this.outlineColor];
    config.outlineWidth = this.outlineWidth;
    config.anchor = { ...this.anchor };
    return config;
  }
}
