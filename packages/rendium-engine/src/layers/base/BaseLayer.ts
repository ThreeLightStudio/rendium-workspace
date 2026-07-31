import type { ILayer, LayerConfig, LayerId, LayerKind } from '../../_contracts';

/**
 * Abstract base class carrying only temporal properties.
 * Does NOT hold GPU resources, spatial transforms, or visual appearance.
 * Non-visual layers (AudioLayer, ScopeEndLayer) extend this directly.
 */
export abstract class BaseLayer implements ILayer {
  public readonly id: LayerId;
  public readonly kind: LayerKind;
  public isProjectAnchor = false;
  public isInfinite = false;
  public isSystem = false;
  public name?: string;

  public startTime = 0;
  public duration = 0;

  constructor(id: LayerId, kind: LayerKind) {
    this.id = id;
    this.kind = kind;
  }

  /**
   * Update layer state based on current time.
   * All layers — visual or not — are updated on  every tick when temporally active.
   */
  public abstract update(
    time: number,
    deltaTime: number,
    getAudioData?: (id: string) => Float32Array,
  ): void;

  /**
   * Update temporal properties from a partial config object.
   * Subclasses should call super.updateConfig() then handle their own fields.
   */
  public updateConfig(config: LayerConfig): void {
    if (typeof config.startTime === 'number') this.startTime = config.startTime;
    if (typeof config.duration === 'number') this.duration = config.duration;
    if (typeof config.name === 'string') this.name = config.name;
    if (typeof config.isProjectAnchor === 'boolean') this.isProjectAnchor = config.isProjectAnchor;
    if (typeof config.isInfinite === 'boolean') this.isInfinite = config.isInfinite;
    if (typeof config.isSystem === 'boolean') this.isSystem = config.isSystem;
  }

  /**
   * Returns temporal configuration only.
   * Subclasses merge their own properties on top of this.
   */
  public getConfig(): LayerConfig {
    const config: LayerConfig = {
      id: this.id,
      kind: this.kind,
      startTime: this.startTime,
      duration: this.duration,
      isProjectAnchor: this.isProjectAnchor,
    };

    if (this.name) {
      config.name = this.name;
    }
    if (this.isInfinite) {
      config.isInfinite = true;
    }
    if (this.isSystem) {
      config.isSystem = true;
    }

    return config;
  }

  /**
   * Release any held resources.
   * Base implementation is a no-op; subclasses override as needed.
   */
  public dispose(): void {
    // No-op at base level
  }
}
