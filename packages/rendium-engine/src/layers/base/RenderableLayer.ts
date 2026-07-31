import type {
  IAppearance,
  IRenderableLayer,
  ITransform,
  LayerConfig,
  RenderContext,
} from '../../_contracts';
import { createMatrix3 } from '../../_utils/matrix';
import { type BoxGeometryDescriptor, buildTransformMatrix } from '../../_utils/transform';
import { BaseLayer } from './BaseLayer';

/**
 * Abstract base for all layers that produce GPU output.
 *
 * Owns:
 *  - ITransform component (position, scale, rotation, matrix)
 *  - IAppearance component (visible, opacity)
 *  - GPU device/format references
 *
 * Exposes flat getter/setter shortcuts (`layer.position`, `layer.opacity`, …)
 * so existing code outside the engine core requires no changes.
 *
 * JSON serialization via getConfig() / updateConfig() remains flat,
 * keeping the wire format backward-compatible.
 */
export abstract class RenderableLayer extends BaseLayer implements IRenderableLayer {
  // -----------------------------------------------------------------------
  // Component objects (ITransform + IAppearance)
  // -----------------------------------------------------------------------
  public readonly transform: ITransform = {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    _localMatrix: createMatrix3(),
  };

  public readonly appearance: IAppearance = {
    visible: true,
    opacity: 1,
  };

  // -----------------------------------------------------------------------
  // GPU resources
  // -----------------------------------------------------------------------
  protected _device: GPUDevice | null = null;
  protected _format: GPUTextureFormat | null = null;

  // -----------------------------------------------------------------------
  // Flat getter / setter shortcuts (syntactic sugar — permanent DX aid)
  // -----------------------------------------------------------------------

  public get position(): { x: number; y: number } {
    return this.transform.position;
  }
  public set position(v: { x: number; y: number }) {
    this.transform.position = v;
  }

  public get scale(): { x: number; y: number } {
    return this.transform.scale;
  }
  public set scale(v: { x: number; y: number }) {
    this.transform.scale = v;
  }

  public get rotation(): number {
    return this.transform.rotation;
  }
  public set rotation(v: number) {
    this.transform.rotation = v;
  }

  public get opacity(): number {
    return this.appearance.opacity;
  }
  public set opacity(v: number) {
    this.appearance.opacity = v;
  }

  public get visible(): boolean {
    return this.appearance.visible;
  }
  public set visible(v: boolean) {
    this.appearance.visible = v;
  }

  // -----------------------------------------------------------------------
  // Intrinsic dimensions (override in subclasses if needed)
  // -----------------------------------------------------------------------
  public get width(): number {
    return 1;
  }
  public get height(): number {
    return 1;
  }

  // -----------------------------------------------------------------------
  // GPU setup state
  // -----------------------------------------------------------------------
  public isSetupFor(device: GPUDevice): boolean {
    return this._device === device;
  }

  public get isSetup(): boolean {
    return this._device !== null;
  }

  public get isReady(): boolean {
    return this.isSetup;
  }

  // -----------------------------------------------------------------------
  // Transform helpers
  // -----------------------------------------------------------------------

  /**
   * Describes the local box used to build the layer transform.
   *
   * The default implementation treats the layer as a top-left anchored box
   * rotated around its visual center.
   */
  protected getTransformDescriptor(): BoxGeometryDescriptor {
    return {
      bounds: {
        left: 0,
        top: 0,
        width: Math.max(1e-6, this.width),
        height: Math.max(1e-6, this.height),
      },
      anchor: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    };
  }

  /**
   * Returns a freshly-computed local transform matrix using the shared
   * pivot-aware helper.
   * Result is cached back into transform._localMatrix.
   */
  public getLocalMatrix(): Float32Array {
    const matrix = buildTransformMatrix(this.transform, this.getTransformDescriptor());
    this.transform._localMatrix.set(matrix);

    return this.transform._localMatrix;
  }

  // -----------------------------------------------------------------------
  // GPU lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialize GPU resources.
   * Subclasses MUST call super.setup() first.
   */
  public async setup(device: GPUDevice, format: GPUTextureFormat): Promise<void> {
    this._device = device;
    this._format = format;
  }

  /** Draw the layer using the provided render context. */
  public abstract draw(context: RenderContext): void;

  // -----------------------------------------------------------------------
  // Config — flat JSON, backward-compatible
  // -----------------------------------------------------------------------

  public override updateConfig(config: LayerConfig): void {
    super.updateConfig(config); // temporal fields

    // Spatial
    if (config.position)
      this.transform.position = {
        ...this.transform.position,
        ...config.position,
      };
    if (config.scale) this.transform.scale = { ...this.transform.scale, ...config.scale };
    if (typeof config.rotation === 'number') this.transform.rotation = config.rotation;

    // Optical
    if (typeof config.visible === 'boolean') this.appearance.visible = config.visible;
    if (typeof config.opacity === 'number') this.appearance.opacity = config.opacity;
  }

  public override getConfig(): LayerConfig {
    const base = super.getConfig(); // temporal fields
    return {
      ...base,
      visible: this.appearance.visible,
      opacity: this.appearance.opacity,
      position: { ...this.transform.position },
      scale: { ...this.transform.scale },
      rotation: this.transform.rotation,
    };
  }

  // -----------------------------------------------------------------------
  // Dispose
  // -----------------------------------------------------------------------

  public override dispose(): void {
    this._device = null;
    this._format = null;
  }
}
