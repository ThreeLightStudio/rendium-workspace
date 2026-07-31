import { createMatrix3, multiply } from '../_utils/matrix';
import type { StateStackNode } from './core.types';

/**
 * Manages the rendering state stack (Transforms, Opacity, etc.)
 */
export class StateStack {
  private _stack: StateStackNode[] = [];
  private _maxDepth: number;

  constructor(maxDepth = 32) {
    this._maxDepth = maxDepth;
    this.reset();
  }

  /**
   * Reset to initial state with a projection matrix (Logical Pixels -> NDC).
   * (0,0) is top-left, (width, height) is bottom-right.
   */
  public reset(
    globalTime = 0,
    width = 1920,
    height = 1080,
    scaleX = 1,
    scaleY = 1,
    shakeX = 0,
    shakeY = 0,
  ): void {
    const projection = createMatrix3();

    // Protection against div by zero
    const w = width || 1920;
    const h = height || 1080;
    const sx = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
    const sy = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;

    // Maps [0, w] -> [-1, 1] and [0, h] -> [1, -1]
    projection[0] = (2 / w) * sx;
    projection[4] = (-2 / h) * sy;
    projection[6] = -1 + shakeX;
    projection[7] = 1 + shakeY;

    this._stack = [
      {
        matrix: projection,
        opacity: 1.0,
        localTime: globalTime,
      },
    ];
  }

  /**
   * Get the current top-level state
   */
  public get current(): StateStackNode {
    const node = this._stack[this._stack.length - 1];
    if (!node) {
      throw new Error('StateStack is empty: initial stack state is missing');
    }
    return node;
  }

  /**
   * Push a new state onto the stack, multiplied by the current state.
   *
   * @param matrix Local transform matrix
   * @param opacity Local opacity multiplier
   * @param startTime Local start time of the new scope
   */
  public push(matrix?: Float32Array, opacity = 1.0, startTime = 0): void {
    if (this._stack.length >= this._maxDepth) {
      throw new Error(`StateStack overflow: depth exceeds ${this._maxDepth}`);
    }

    const currentState = this.current;
    const nextMatrix = createMatrix3();

    if (matrix) {
      multiply(nextMatrix, currentState.matrix, matrix);
    } else {
      nextMatrix.set(currentState.matrix);
    }

    this._stack.push({
      matrix: nextMatrix,
      opacity: currentState.opacity * opacity,
      localTime: currentState.localTime - startTime,
    });
  }

  /**
   * Pop the current state from the stack
   */
  public pop(): void {
    if (this._stack.length <= 1) {
      throw new Error('StateStack underflow: cannot pop base state');
    }
    this._stack.pop();
  }

  public get depth(): number {
    return this._stack.length - 1;
  }
}
