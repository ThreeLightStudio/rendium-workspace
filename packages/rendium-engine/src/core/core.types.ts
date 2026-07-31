import type { Matrix3 } from '../_utils/matrix';

/**
 * Node representing a state in the rendering stack.
 */
export interface StateStackNode {
  matrix: Matrix3;
  opacity: number;
  localTime: number;
  // Extensible for future state like filters, blending, etc.
}

/**
 * Internal configuration for the Scene runtime.
 */
export interface SceneRuntimeConfig {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
}
