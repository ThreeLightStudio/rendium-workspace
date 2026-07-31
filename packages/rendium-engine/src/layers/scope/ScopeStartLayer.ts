import type {
  IAppearance,
  IScopeStartLayer,
  ITransform,
  LayerConfig,
  LayerId,
  ScopeRoleType,
  ScopeRuleType,
} from '../../_contracts';
import { createMatrix3 } from '../../_utils/matrix';
import { type BoxGeometryDescriptor, buildTransformMatrix } from '../../_utils/transform';
import { BaseLayer } from '../base/BaseLayer';

const IDENTITY_MATRIX = createMatrix3();

/**
 * Marks the beginning of a scope (group) of layers.
 * Acts as a pure logical container by default.
 * ITransform and IAppearance are optionally injected when the user
 * applies group-level transforms or visibility controls.
 */
export class ScopeStartLayer extends BaseLayer implements IScopeStartLayer {
  public ruleType?: ScopeRuleType;
  public scopeRole?: ScopeRoleType;
  public transform?: ITransform;
  public appearance?: IAppearance;

  constructor(id: LayerId) {
    super(id, 'control');
  }

  // ---------------------------------------------------------------------------
  // Stack-facing accessors (used by Scene.ts)
  // ---------------------------------------------------------------------------

  /**
   * Returns the local transform matrix if a transform component is attached,
   * otherwise returns the identity matrix.
   */
  public get matrix(): Float32Array {
    if (!this.transform) return IDENTITY_MATRIX;
    return this._computeMatrix(this.transform);
  }

  /**
   * Returns the effective opacity for the state-stack push.
   * Falls back to 1.0 when no appearance component is attached.
   */
  public get stackOpacity(): number {
    return this.appearance?.opacity ?? 1.0;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _computeMatrix(transform: ITransform): Float32Array {
    const matrix = buildTransformMatrix(transform, this.getTransformDescriptor());
    transform._localMatrix.set(matrix);

    return transform._localMatrix;
  }

  /**
   * Scope transforms use the same centered pivot model as renderable layers.
   */
  protected getTransformDescriptor(): BoxGeometryDescriptor {
    return {
      bounds: {
        left: 0,
        top: 0,
        width: 1,
        height: 1,
      },
      anchor: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    };
  }

  // ---------------------------------------------------------------------------
  // ILayer lifecycle
  // ---------------------------------------------------------------------------

  public override update(_time: number, _deltaTime: number): void {
    // Scopes may have animations or computed logic in the future
  }

  public override updateConfig(config: LayerConfig): void {
    super.updateConfig(config);
    if (
      config.ruleType === 'freeform' ||
      config.ruleType === 'mutex' ||
      config.ruleType === 'magnetic'
    ) {
      this.ruleType = config.ruleType;
    }
    if (
      config.scopeRole === 'main' ||
      config.scopeRole === 'overlay' ||
      config.scopeRole === 'text' ||
      config.scopeRole === 'composite'
    ) {
      this.scopeRole = config.scopeRole;
    }

    // If spatial config is set, lazily initialise the transform component
    if (
      config.position !== undefined ||
      config.scale !== undefined ||
      config.rotation !== undefined
    ) {
      if (!this.transform) {
        this.transform = {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          _localMatrix: createMatrix3(),
        };
      }
      if (config.position)
        this.transform.position = {
          ...this.transform.position,
          ...config.position,
        };
      if (config.scale) this.transform.scale = { ...this.transform.scale, ...config.scale };
      if (typeof config.rotation === 'number') this.transform.rotation = config.rotation;
    }

    // If optical config is set, lazily initialise the appearance component
    if (config.opacity !== undefined || config.visible !== undefined) {
      if (!this.appearance) {
        this.appearance = { visible: true, opacity: 1 };
      }
      if (typeof config.opacity === 'number') this.appearance.opacity = config.opacity;
      if (typeof config.visible === 'boolean') this.appearance.visible = config.visible;
    }
  }

  public override getConfig(): LayerConfig {
    const config = super.getConfig();
    if (this.ruleType) {
      config.ruleType = this.ruleType;
    }
    if (this.scopeRole) {
      config.scopeRole = this.scopeRole;
    }

    if (this.transform) {
      config.position = { ...this.transform.position };
      config.scale = { ...this.transform.scale };
      config.rotation = this.transform.rotation;
    }

    if (this.appearance) {
      config.opacity = this.appearance.opacity;
      config.visible = this.appearance.visible;
    }

    return config;
  }
}
