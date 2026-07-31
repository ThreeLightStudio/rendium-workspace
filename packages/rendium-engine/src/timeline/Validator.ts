import type { ILayer } from '../_contracts';
import { calculateDepths } from '../_utils/brackets';

/**
 * Validates the nesting of scopes in a flattened layer list.
 *
 * @param layers The flat list of layers
 * @throws Error if scopes are improperly balanced or nested
 */
export function validateScopes(layers: ILayer[]): void {
  calculateDepths(
    layers,
    (layer) => layer.kind === 'control' && 'matrix' in layer,
    (layer) => layer.kind === 'control' && 'targetScopeId' in layer,
  );
}

/**
 * Performs a full validation of the scene.
 */
export function validateScene(layers: ILayer[]): void {
  validateScopes(layers);
  // Add more domain-specific validation rules here (e.g. time ranges)
}
