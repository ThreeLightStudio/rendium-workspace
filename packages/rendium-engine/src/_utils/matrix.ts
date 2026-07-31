/**
 * 3x3 Matrix (Column Major) for 2D Transforms.
 * [0 3 6] [sx  0 tx]
 * [1 4 7] [ 0 sy ty]
 * [2 5 8] [ 0  0  1]
 */
export type Matrix3 = Float32Array;

export function createMatrix3(): Matrix3 {
  const m = new Float32Array(9);
  m[0] = 1;
  m[4] = 1;
  m[8] = 1;
  return m;
}

export function identity(out: Matrix3): Matrix3 {
  out.fill(0);
  out[0] = 1;
  out[4] = 1;
  out[8] = 1;
  return out;
}

export function translate(out: Matrix3, x: number, y: number): Matrix3 {
  identity(out);
  out[6] = x;
  out[7] = y;
  return out;
}

export function rotate(out: Matrix3, rad: number): Matrix3 {
  identity(out);
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  out[0] = c;
  out[3] = -s;
  out[1] = s;
  out[4] = c;
  return out;
}

export function scale(out: Matrix3, sx: number, sy: number): Matrix3 {
  identity(out);
  out[0] = sx;
  out[4] = sy;
  return out;
}

/**
 * Multiplies two matrices: out = a * b
 */
export function multiply(out: Matrix3, a: Matrix3, b: Matrix3): Matrix3 {
  const [a00 = 0, a10 = 0, a20 = 0, a01 = 0, a11 = 0, a21 = 0, a02 = 0, a12 = 0, a22 = 0] = a;
  const [b00 = 0, b10 = 0, b20 = 0, b01 = 0, b11 = 0, b21 = 0, b02 = 0, b12 = 0, b22 = 0] = b;

  out[0] = a00 * b00 + a01 * b10 + a02 * b20;
  out[1] = a10 * b00 + a11 * b10 + a12 * b20;
  out[2] = a20 * b00 + a21 * b10 + a22 * b20;

  out[3] = a00 * b01 + a01 * b11 + a02 * b21;
  out[4] = a10 * b01 + a11 * b11 + a12 * b21;
  out[5] = a20 * b01 + a21 * b11 + a22 * b21;

  out[6] = a00 * b02 + a01 * b12 + a02 * b22;
  out[7] = a10 * b02 + a11 * b12 + a12 * b22;
  out[8] = a20 * b02 + a21 * b12 + a22 * b22;

  return out;
}
