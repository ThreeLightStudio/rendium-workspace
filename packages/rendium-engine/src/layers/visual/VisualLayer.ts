import type { LayerConfig, LayerId, MediaReadiness, RenderContext } from '../../_contracts';
import type { BoxGeometryDescriptor } from '../../_utils/transform';
import { RenderableLayer } from '../base/RenderableLayer';
import type { VisualDrawableProvider } from './VisualDrawableProvider';

export class VisualLayer extends RenderableLayer {
  public readonly visualProvider: VisualDrawableProvider;

  /**
   * Offset (in seconds) applied to the media source's internal timeline.
   * Mirrors {@link AudioLayer.clipOffset}: providers like VideoDrawableProvider
   * read this to seek into the source at the layer's startTime.
   */
  public clipOffset = 0;

  constructor(id: LayerId, provider: VisualDrawableProvider) {
    super(id, 'visual');
    this.visualProvider = provider;
    this.visualProvider.initialize?.(this);
  }

  public override get width(): number {
    return this.visualProvider.getIntrinsicSize?.(this).width ?? super.width;
  }

  public override get height(): number {
    return this.visualProvider.getIntrinsicSize?.(this).height ?? super.height;
  }

  public override get isReady(): boolean {
    return super.isReady && (this.visualProvider.isReady?.(this) ?? true);
  }

  public get mediaReadiness(): MediaReadiness {
    if (!super.isReady) return 'loading';
    return this.visualProvider.getMediaReadiness?.(this) ?? (this.isReady ? 'ready' : 'loading');
  }

  protected override getTransformDescriptor(): BoxGeometryDescriptor {
    return this.visualProvider.getTransformDescriptor?.(this) ?? super.getTransformDescriptor();
  }

  public override getLocalMatrix(): Float32Array {
    return this.visualProvider.getLocalMatrix?.(this) ?? super.getLocalMatrix();
  }

  public override async setup(device: GPUDevice, format: GPUTextureFormat): Promise<void> {
    await super.setup(device, format);
    await this.visualProvider.setup(this, device, format);
  }

  public override update(
    time: number,
    deltaTime: number,
    getAudioData?: (id: string) => Float32Array,
  ): void {
    this.visualProvider.update(this, time, deltaTime, getAudioData);
  }

  public async prepareFrame(): Promise<void> {
    await this.visualProvider.prepareFrame?.(this);
  }

  public override draw(context: RenderContext): void {
    this.visualProvider.draw(this, context);
  }

  public override updateConfig(config: LayerConfig): void {
    super.updateConfig(config);

    if (typeof config.clipOffset === 'number') {
      this.clipOffset = config.clipOffset;
    }

    this.visualProvider.updateConfig(this, config);
  }

  public override getConfig(): LayerConfig {
    return {
      ...super.getConfig(),
      ...this.visualProvider.getConfig?.(this),
      clipOffset: this.clipOffset,
    };
  }

  public override dispose(): void {
    this.visualProvider.dispose();
    super.dispose();
  }
}
