import { type LayerConfig, type RenderContext, SPECTRUM_CONFIG } from '../../../_contracts';
import { isLayerConfigColorTuple } from '../../../_utils/layerConfig';
import { createMatrix3, multiply } from '../../../_utils/matrix';
import type { BoxGeometryDescriptor } from '../../../_utils/transform';
import type { VisualDrawableProvider } from '../VisualDrawableProvider';
import type { VisualLayer } from '../VisualLayer';

export const SPECTRUM_SHADER_SOURCE = `
struct Uniforms {
	modelMatrix: mat4x4<f32>,
	bandCount: f32,
	barGap: f32,
	minHeight: f32,
	maxHeight: f32,
	color: vec4<f32>,
	fftSize: f32,
	gain: f32,
	sampleRate: f32,
	opacity: f32,
	minFrequency: f32,
	maxFrequency: f32,
	spectralTilt: f32,
	normalizationPeak: f32,
	gradientMode: f32,
	colorLow: vec4<f32>,
	colorHigh: vec4<f32>,
	_extra_pad: array<vec4<f32>, 5>, // Pad to 256 bytes (64 floats)
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(0) @binding(1)
var<storage, read> audioData: array<f32>;

struct VertexInput {
	@location(0) quadPos: vec2<f32>,
	@location(1) bandIndex: f32,
};

struct VertexOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) color: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
	let totalBands = uniforms.bandCount;
	let normalizedIndex = input.bandIndex / totalBands;
	
	// Mel Scale Mapping (User defined range)
	let f_min = uniforms.minFrequency;
	let f_max = uniforms.maxFrequency;
	let m_min = 2595.0 * log(1.0 + f_min / 700.0) / 2.302585;
	let m_max = 2595.0 * log(1.0 + f_max / 700.0) / 2.302585;
	
	let m = mix(m_min, m_max, normalizedIndex);
	let f = 700.0 * (exp((m / 2595.0) * 2.302585) - 1.0);
	
	// Convert frequency to FFT bin index
	let fftBinIndex = f / (uniforms.sampleRate / 2.0) * (uniforms.fftSize / 2.0);
	
	// Sub-bin Linear Interpolation
	let lowIndex = u32(fftBinIndex);
	let highIndex = min(u32(fftBinIndex + 1.0), u32(uniforms.fftSize / 2.0 - 1.0));
	let fractPart = fract(fftBinIndex);
	
	let ampLow = audioData[lowIndex];
	let ampHigh = audioData[highIndex];
	
	// Apply Spectral Tilt (1kHz Reference)
	// amplitude = amplitude * pow(max(f, 1.0) / 1000.0, uniforms.spectralTilt)
	var amplitude = mix(ampLow, ampHigh, fractPart) * uniforms.gain;
	amplitude = amplitude * pow(max(f, 1.0) / 1000.0, uniforms.spectralTilt);
	amplitude = amplitude / max(uniforms.normalizationPeak, 1.0);
	let kneeStart = 0.82;
	if (amplitude > kneeStart) {
		let kneeRange = 1.0 - kneeStart;
		let over = amplitude - kneeStart;
		amplitude = kneeStart + kneeRange * (over / (over + kneeRange));
	}
	amplitude = clamp(amplitude, 0.0, 1.0);
	
	let height = mix(uniforms.minHeight, uniforms.maxHeight, amplitude);

	// Band X in 0..1 range (modelMatrix handles pixel-space -> NDC transform)
	let bandX = (input.bandIndex + 0.5) / totalBands;
	let bandHalfWidth = (1.0 - uniforms.barGap) / totalBands;

	let x = bandX + (input.quadPos.x - 0.5) * bandHalfWidth;
	let y = input.quadPos.y * height;

	let worldPos = uniforms.modelMatrix * vec4<f32>(x, y, 0.0, 1.0);

	var output: VertexOutput;
	output.position = worldPos;
	
	var baseColor = uniforms.color;
	if (uniforms.gradientMode > 0.5) {
		baseColor = mix(uniforms.colorLow, uniforms.colorHigh, normalizedIndex);
	}
	
	output.color = vec4<f32>(baseColor.rgb, baseColor.a * uniforms.opacity);
	return output;
}

@fragment
fn fs_main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
	return color;
}
`;

const SMOOTHING_REFERENCE_FPS = 60;

function clampSmoothing(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999, Math.max(0, value));
}

export function getTimeAdjustedSmoothing(smoothing: number, deltaTime: number): number {
  const normalizedSmoothing = clampSmoothing(smoothing);
  if (!Number.isFinite(deltaTime) || deltaTime <= 0) return normalizedSmoothing;
  return normalizedSmoothing ** (deltaTime * SMOOTHING_REFERENCE_FPS);
}

export class SpectrumDrawableProvider implements VisualDrawableProvider {
  public readonly providerKind = 'generated-visual';

  private _bandCount: number = SPECTRUM_CONFIG.DEFAULT_BAND_COUNT;
  private _barGap: number = SPECTRUM_CONFIG.DEFAULT_BAR_GAP;
  private _minHeight: number = SPECTRUM_CONFIG.DEFAULT_MIN_HEIGHT;
  private _maxHeight: number = SPECTRUM_CONFIG.DEFAULT_MAX_HEIGHT;
  private _color: [number, number, number, number] = [...SPECTRUM_CONFIG.DEFAULT_COLOR];
  private _gain: number = SPECTRUM_CONFIG.DEFAULT_GAIN;
  private _smoothing: number = SPECTRUM_CONFIG.DEFAULT_SMOOTHING;
  private _minFrequency: number = SPECTRUM_CONFIG.DEFAULT_MIN_FREQUENCY;
  private _maxFrequency: number = SPECTRUM_CONFIG.DEFAULT_MAX_FREQUENCY;
  private _spectralTilt: number = SPECTRUM_CONFIG.DEFAULT_SPECTRAL_TILT;
  private _gradientMode: boolean = SPECTRUM_CONFIG.DEFAULT_GRADIENT_MODE;
  private _colorLow: [number, number, number, number] = [...SPECTRUM_CONFIG.DEFAULT_COLOR_LOW];
  private _colorHigh: [number, number, number, number] = [...SPECTRUM_CONFIG.DEFAULT_COLOR_HIGH];
  private _linkedAudioId: string | null = null;

  // Public getters keep provider-level tests and config snapshots observable.
  public get bandCount(): number {
    return this._bandCount;
  }
  public get barGap(): number {
    return this._barGap;
  }
  public get minHeight(): number {
    return this._minHeight;
  }
  public get maxHeight(): number {
    return this._maxHeight;
  }
  public get color(): [number, number, number, number] {
    return this._color;
  }
  public get gain(): number {
    return this._gain;
  }
  public get smoothing(): number {
    return this._smoothing;
  }
  public get linkedAudioId(): string | null {
    return this._linkedAudioId;
  }
  public get minFrequency(): number {
    return this._minFrequency;
  }
  public get maxFrequency(): number {
    return this._maxFrequency;
  }
  public get spectralTilt(): number {
    return this._spectralTilt;
  }
  public get gradientMode(): boolean {
    return this._gradientMode;
  }
  public get colorLow(): [number, number, number, number] {
    return this._colorLow;
  }
  public get colorHigh(): [number, number, number, number] {
    return this._colorHigh;
  }

  private _pipeline: GPURenderPipeline | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _audioBuffer: GPUBuffer | null = null;
  private _vertexBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _instanceBuffer: GPUBuffer | null = null;
  private _bindGroup: GPUBindGroup | null = null;
  private _smoothedData = new Float32Array(2048);
  private _normalizationPeak = 1;
  private _device: GPUDevice | null = null;

  public getIntrinsicSize(): { width: number; height: number } {
    return { width: 1, height: Math.max(1e-6, Math.abs(this._maxHeight)) };
  }

  public getTransformDescriptor(): BoxGeometryDescriptor {
    return {
      bounds: {
        left: 0,
        top: 0,
        width: 1,
        height: Math.max(1e-6, Math.abs(this._maxHeight)),
      },
      anchor: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    };
  }

  public async setup(
    _host: VisualLayer,
    device: GPUDevice,
    format: GPUTextureFormat,
  ): Promise<void> {
    this._device = device;

    // 1. Vertex Buffer (Unit Quad)
    const quadVertices = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    this._vertexBuffer = device.createBuffer({
      size: quadVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this._vertexBuffer.getMappedRange()).set(quadVertices);
    this._vertexBuffer.unmap();

    // 2. Index Buffer
    const quadIndices = new Uint16Array([0, 1, 2, 2, 3, 0]);
    this._indexBuffer = device.createBuffer({
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this._indexBuffer.getMappedRange()).set(quadIndices);
    this._indexBuffer.unmap();

    // 3. Create initial instance and audio buffers
    this._reallocateBuffers(device);

    // 4. Uniform Buffer = 256 bytes (64 floats)
    this._uniformBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shaderModule = device.createShaderModule({ code: SPECTRUM_SHADER_SOURCE });
    this._pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [{ format: 'float32x2', offset: 0, shaderLocation: 0 }],
          },
          {
            arrayStride: 4,
            stepMode: 'instance',
            attributes: [{ format: 'float32', offset: 0, shaderLocation: 1 }],
          },
        ],
      },
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

    this._updateBindGroup();
  }

  public update(
    _host: VisualLayer,
    _time: number,
    _deltaTime: number,
    getAudioData?: (id: string) => Float32Array,
  ): void {
    if (!this._device || !this._audioBuffer || !getAudioData || !this._linkedAudioId) return;

    const audioData = getAudioData(this._linkedAudioId);
    const smoothing = getTimeAdjustedSmoothing(this._smoothing, _deltaTime);
    let peak = 0;
    for (let i = 0; i < 2048; i++) {
      const val = audioData[i] ?? 0;
      this._smoothedData[i] = (this._smoothedData[i] ?? 0) * smoothing + val * (1 - smoothing);
      peak = Math.max(peak, this._smoothedData[i] ?? 0);
    }
    this._normalizationPeak = this._getNormalizationPeak(peak);

    this._device.queue.writeBuffer(this._audioBuffer, 0, this._smoothedData);
  }

  public draw(host: VisualLayer, context: RenderContext): void {
    if (
      !this._pipeline ||
      !this._bindGroup ||
      !this._vertexBuffer ||
      !this._indexBuffer ||
      !this._instanceBuffer
    )
      return;

    const finalMatrix = createMatrix3();
    multiply(finalMatrix, context.state.matrix, host.getLocalMatrix());

    this._updateUniforms(
      context.device,
      finalMatrix,
      host.opacity * context.state.opacity,
      context.sampleRate,
    );

    context.passEncoder.setPipeline(this._pipeline);
    context.passEncoder.setBindGroup(0, this._bindGroup);
    context.passEncoder.setVertexBuffer(0, this._vertexBuffer);
    context.passEncoder.setVertexBuffer(1, this._instanceBuffer);
    context.passEncoder.setIndexBuffer(this._indexBuffer, 'uint16');
    context.passEncoder.drawIndexed(6, this._bandCount);
  }

  public updateConfig(_host: VisualLayer, config: LayerConfig): void {
    if (typeof config.linkedAudioId === 'string') this._linkedAudioId = config.linkedAudioId;
    if (typeof config.bandCount === 'number') {
      this._bandCount = config.bandCount;
      if (this._device) {
        this._reallocateBuffers(this._device);
        this._updateBindGroup();
      }
    }
    if (typeof config.barGap === 'number') this._barGap = config.barGap;
    if (typeof config.minHeight === 'number') {
      this._minHeight = Math.max(SPECTRUM_CONFIG.DEFAULT_MIN_HEIGHT, config.minHeight);
    }
    if (typeof config.maxHeight === 'number') this._maxHeight = config.maxHeight;
    if (typeof config.smoothing === 'number') this._smoothing = clampSmoothing(config.smoothing);
    if (typeof config.gain === 'number') this._gain = config.gain;
    if (isLayerConfigColorTuple(config.color)) {
      this._color = config.color;
    }
    if (typeof config.minFrequency === 'number') this._minFrequency = config.minFrequency;
    if (typeof config.maxFrequency === 'number') this._maxFrequency = config.maxFrequency;
    if (typeof config.spectralTilt === 'number') this._spectralTilt = config.spectralTilt;
    if (typeof config.gradientMode === 'boolean') this._gradientMode = config.gradientMode;
    if (isLayerConfigColorTuple(config.colorLow)) this._colorLow = config.colorLow;
    if (isLayerConfigColorTuple(config.colorHigh)) this._colorHigh = config.colorHigh;
  }

  private _reallocateBuffers(device: GPUDevice): void {
    this._instanceBuffer?.destroy();
    const bandIndices = new Float32Array(this._bandCount);
    for (let i = 0; i < this._bandCount; i++) bandIndices[i] = i;
    this._instanceBuffer = device.createBuffer({
      size: bandIndices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this._instanceBuffer.getMappedRange()).set(bandIndices);
    this._instanceBuffer.unmap();

    this._audioBuffer?.destroy();
    this._audioBuffer = device.createBuffer({
      size: 2048 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private _updateBindGroup(): void {
    if (!this._device || !this._pipeline || !this._uniformBuffer || !this._audioBuffer) return;
    this._bindGroup = this._device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
        { binding: 1, resource: { buffer: this._audioBuffer } },
      ],
    });
  }

  private _updateUniforms(
    device: GPUDevice,
    matrix: Float32Array,
    stackOpacity: number,
    sampleRate: number,
  ): void {
    if (!this._uniformBuffer) return;

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
    data[16] = this._bandCount;
    data[17] = this._barGap;
    data[18] = this._minHeight;
    data[19] = this._maxHeight;
    data.set(this._color, 20);
    data[24] = 4096; // fftSize
    data[25] = this._gain;
    data[26] = sampleRate;
    data[27] = stackOpacity;
    data[28] = this._minFrequency;
    data[29] = this._maxFrequency;
    data[30] = this._spectralTilt;
    data[31] = this._normalizationPeak;
    data[32] = this._gradientMode ? 1.0 : 0.0;
    data.set(this._colorLow, 36);
    data.set(this._colorHigh, 40);

    device.queue.writeBuffer(this._uniformBuffer, 0, data);
  }

  private _getNormalizationPeak(peak: number): number {
    const safePeak = Number.isFinite(peak) ? Math.max(0, peak) : 0;
    const safeGain = Number.isFinite(this._gain) ? Math.max(0, this._gain) : 0;
    const referenceFrequency =
      this._spectralTilt >= 0 ? Math.max(1, this._maxFrequency) : Math.max(1, this._minFrequency);
    const tiltPeak = (referenceFrequency / 1000) ** this._spectralTilt;
    const safeTiltPeak = Number.isFinite(tiltPeak) ? Math.max(0, tiltPeak) : 1;

    return Math.max(1, safePeak * safeGain * safeTiltPeak);
  }

  public dispose(): void {
    this._uniformBuffer?.destroy();
    this._audioBuffer?.destroy();
    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._instanceBuffer?.destroy();
    this._device = null;
  }

  public getConfig(): Partial<LayerConfig> {
    const config: LayerConfig = {};
    config.bandCount = this._bandCount;
    config.barGap = this._barGap;
    config.minHeight = this._minHeight;
    config.maxHeight = this._maxHeight;
    config.smoothing = this._smoothing;
    config.gain = this._gain;
    config.color = [...this._color];

    if (this._linkedAudioId) {
      config.linkedAudioId = this._linkedAudioId;
    }
    config.minFrequency = this._minFrequency;
    config.maxFrequency = this._maxFrequency;
    config.spectralTilt = this._spectralTilt;
    config.gradientMode = this._gradientMode;
    config.colorLow = [...this._colorLow];
    config.colorHigh = [...this._colorHigh];

    return config;
  }
}
