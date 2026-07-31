import type { LayerConfig, LayerId } from '../../_contracts';
import { BaseLayer } from '../base/BaseLayer';

/**
 * Marks the end of a scope (group) of layers.
 * Pure control-flow element: no GPU resources, no transform, no appearance.
 */
export class ScopeEndLayer extends BaseLayer {
  public readonly targetScopeId: LayerId;

  constructor(id: LayerId, targetScopeId: LayerId) {
    super(id, 'control');
    this.targetScopeId = targetScopeId;
  }

  public override update(_time: number, _deltaTime: number): void {
    // No-op: ScopeEnd carries no state to update
  }

  public override getConfig(): LayerConfig {
    const config = super.getConfig();
    config.targetScopeId = this.targetScopeId;
    return config;
  }
}
