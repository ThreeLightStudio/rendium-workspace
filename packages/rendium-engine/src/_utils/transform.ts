import { type Matrix3, createMatrix3, multiply, rotate, scale, translate } from './matrix';

export interface Point {
  x: number;
  y: number;
}

export type Quad = readonly [Point, Point, Point, Point];

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TransformState {
  position: Point;
  scale: Point;
  rotation: number;
}

export interface BoxGeometryDescriptor {
  bounds?: Partial<Bounds>;
  anchor?: Partial<Point>;
  pivot?: Partial<Point>;
}

export interface ResolvedBoxGeometry {
  bounds: Bounds;
  anchor: Point;
  pivot: Point;
}

export interface NormalizedTransformFields {
  position?: Point;
  scale?: Point;
  rotation?: number;
}

interface TransformSource {
  transform?: TransformSource;
  position?: unknown;
  scale?: unknown;
  rotation?: unknown;
  x?: unknown;
  y?: unknown;
  scaleX?: unknown;
  scaleY?: unknown;
}

const DEFAULT_BOUNDS: Bounds = {
  left: 0,
  top: 0,
  width: 1,
  height: 1,
};

const DEFAULT_ANCHOR: Point = { x: 0, y: 0 };
const DEFAULT_PIVOT: Point = { x: 0.5, y: 0.5 };
const MIN_DIMENSION = 4;

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePoint(value: unknown, fallback: Point): Point {
  if (!value || typeof value !== 'object') {
    return { ...fallback };
  }

  const point = value as { x?: unknown; y?: unknown };
  return {
    x: normalizeNumber(point.x, fallback.x),
    y: normalizeNumber(point.y, fallback.y),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeBounds(value?: Partial<Bounds>): Bounds {
  const left = normalizeNumber(value?.left, DEFAULT_BOUNDS.left);
  const top = normalizeNumber(value?.top, DEFAULT_BOUNDS.top);
  const width = Math.max(1e-6, Math.abs(normalizeNumber(value?.width, DEFAULT_BOUNDS.width)));
  const height = Math.max(1e-6, Math.abs(normalizeNumber(value?.height, DEFAULT_BOUNDS.height)));

  return { left, top, width, height };
}

function buildQuad(origin: Point, xAxis: Point, yAxis: Point): Quad {
  return [origin, add(origin, xAxis), add(add(origin, xAxis), yAxis), add(origin, yAxis)];
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scalePoint(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function length(point: Point): number {
  return Math.hypot(point.x, point.y);
}

function normalizeVector(vector: Point): Point {
  const len = length(vector);
  if (len === 0) {
    return { x: 1, y: 0 };
  }

  return { x: vector.x / len, y: vector.y / len };
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function readTransformSource(value: unknown): TransformSource | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const source = value as TransformSource;

  if (isPlainObject(source.transform) && hasTransformHints(source.transform)) {
    return source.transform;
  }

  return source;
}

function hasTransformHints(value: TransformSource): boolean {
  return (
    value.position !== undefined ||
    value.scale !== undefined ||
    value.rotation !== undefined ||
    value.x !== undefined ||
    value.y !== undefined ||
    value.scaleX !== undefined ||
    value.scaleY !== undefined
  );
}

function readLegacyPoint(value: TransformSource): { x: unknown; y: unknown } {
  return { x: value.x, y: value.y };
}

function readLegacyScale(value: TransformSource): { x: unknown; y: unknown } {
  return { x: value.scaleX, y: value.scaleY };
}

function readPoint(value: unknown): Point | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const point = value as TransformSource;
  const x = normalizeNumber(point.x, Number.NaN);
  const y = normalizeNumber(point.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolve the local box geometry used by the transform helpers.
 *
 * The returned `anchor` and `pivot` are expressed in the same local
 * coordinate space as the box bounds, not normalized.
 */
export function resolveBoxGeometry(descriptor?: BoxGeometryDescriptor): ResolvedBoxGeometry {
  const bounds = normalizeBounds(descriptor?.bounds);
  const anchor = normalizePoint(descriptor?.anchor, DEFAULT_ANCHOR);
  const pivot = normalizePoint(descriptor?.pivot, DEFAULT_PIVOT);

  return {
    bounds,
    anchor: {
      x: bounds.left + bounds.width * clamp01(anchor.x),
      y: bounds.top + bounds.height * clamp01(anchor.y),
    },
    pivot: {
      x: bounds.left + bounds.width * clamp01(pivot.x),
      y: bounds.top + bounds.height * clamp01(pivot.y),
    },
  };
}

export function resolveAnchor(descriptor?: BoxGeometryDescriptor): Point {
  return resolveBoxGeometry(descriptor).anchor;
}

export function resolvePivot(descriptor?: BoxGeometryDescriptor): Point {
  return resolveBoxGeometry(descriptor).pivot;
}

/**
 * Compose a 2D transform matrix around an arbitrary local pivot.
 *
 * `position` is the world-space reference point for the local anchor.
 * The default anchor is the local top-left corner and the default pivot
 * is the local center.
 */
export function buildTransformMatrix(
  transform: Partial<TransformState> | null | undefined,
  descriptor?: BoxGeometryDescriptor,
): Matrix3 {
  const geometry = resolveBoxGeometry(descriptor);
  const position = normalizePoint(transform?.position, { x: 0, y: 0 });
  const scalePointValue = normalizePoint(transform?.scale, { x: 1, y: 1 });
  const rotation = normalizeNumber(transform?.rotation, 0);

  const pivotOffset = {
    x: scalePointValue.x * (geometry.pivot.x - geometry.anchor.x),
    y: scalePointValue.y * (geometry.pivot.y - geometry.anchor.y),
  };

  const translation = createMatrix3();
  translate(translation, position.x + pivotOffset.x, position.y + pivotOffset.y);

  const rotationMatrix = createMatrix3();
  rotate(rotationMatrix, rotation);

  const scaleMatrix = createMatrix3();
  scale(scaleMatrix, scalePointValue.x, scalePointValue.y);

  const pivotTranslate = createMatrix3();
  translate(pivotTranslate, -geometry.pivot.x, -geometry.pivot.y);

  const rotatedScaled = createMatrix3();
  multiply(rotatedScaled, rotationMatrix, scaleMatrix);
  multiply(rotatedScaled, rotatedScaled, pivotTranslate);

  const out = createMatrix3();
  multiply(out, translation, rotatedScaled);
  return out;
}

export function transformPoint(point: Point, matrix: Matrix3): Point {
  return {
    x: (matrix[0] ?? 0) * point.x + (matrix[3] ?? 0) * point.y + (matrix[6] ?? 0),
    y: (matrix[1] ?? 0) * point.x + (matrix[4] ?? 0) * point.y + (matrix[7] ?? 0),
  };
}

export function createQuadFromBounds(bounds: Bounds): Quad {
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  return [
    { x: bounds.left, y: bounds.top },
    { x: right, y: bounds.top },
    { x: right, y: bottom },
    { x: bounds.left, y: bottom },
  ];
}

export function transformQuad(quad: Quad, matrix: Matrix3): Quad {
  return [
    transformPoint(quad[0], matrix),
    transformPoint(quad[1], matrix),
    transformPoint(quad[2], matrix),
    transformPoint(quad[3], matrix),
  ];
}

export function rotateQuadAround(quad: Quad, center: Point, angle: number): Quad {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return quad.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  }) as unknown as Quad;
}

export function translateQuad(quad: Quad, delta: Point): Quad {
  return quad.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })) as unknown as Quad;
}

export function getQuadBounds(quad: Quad): Bounds {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export function pointInQuad(point: Point, quad: Quad): boolean {
  const [a, b, c, d] = quad;

  const cross1 = cross(a, b, point);
  const cross2 = cross(b, c, point);
  const cross3 = cross(c, d, point);
  const cross4 = cross(d, a, point);

  const hasNegative = cross1 < 0 || cross2 < 0 || cross3 < 0 || cross4 < 0;
  const hasPositive = cross1 > 0 || cross2 > 0 || cross3 > 0 || cross4 > 0;

  return !(hasNegative && hasPositive);
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function resizeQuadFromHandle(
  frame: { quad: Quad },
  handle: ResizeHandle,
  point: Point,
): Quad {
  const [topLeft, topRight, bottomRight, bottomLeft] = frame.quad;
  const edgeX = subtract(topRight, topLeft);
  const edgeY = subtract(bottomLeft, topLeft);
  const axisX = normalizeVector(edgeX);
  const axisY = normalizeVector(edgeY);
  const baseWidth = Math.max(MIN_DIMENSION, length(edgeX));
  const baseHeight = Math.max(MIN_DIMENSION, length(edgeY));

  const buildFromOrigin = (origin: Point, width: number, height: number): Quad =>
    buildQuad(origin, scalePoint(axisX, width), scalePoint(axisY, height));

  const buildAspectLockedSize = (widthCandidate: number, heightCandidate: number) => {
    const widthScale = Math.max(MIN_DIMENSION / baseWidth, widthCandidate / baseWidth);
    const heightScale = Math.max(MIN_DIMENSION / baseHeight, heightCandidate / baseHeight);
    const scaleFactor = Math.max(widthScale, heightScale);

    return {
      width: Math.max(MIN_DIMENSION, baseWidth * scaleFactor),
      height: Math.max(MIN_DIMENSION, baseHeight * scaleFactor),
    };
  };

  const dotX = (vector: Point) => dot(vector, axisX);
  const dotY = (vector: Point) => dot(vector, axisY);

  switch (handle) {
    case 'nw': {
      const vector = subtract(point, bottomRight);
      const widthCandidate = Math.max(MIN_DIMENSION, -dotX(vector));
      const heightCandidate = Math.max(MIN_DIMENSION, -dotY(vector));
      const { width, height } = buildAspectLockedSize(widthCandidate, heightCandidate);
      const origin = subtract(
        bottomRight,
        add(scalePoint(axisX, width), scalePoint(axisY, height)),
      );

      return buildFromOrigin(origin, width, height);
    }

    case 'n': {
      const vector = subtract(point, bottomLeft);
      const height = Math.max(MIN_DIMENSION, -dotY(vector));
      const origin = subtract(bottomLeft, scalePoint(axisY, height));

      return buildFromOrigin(origin, baseWidth, height);
    }

    case 'ne': {
      const vector = subtract(point, bottomLeft);
      const widthCandidate = Math.max(MIN_DIMENSION, dotX(vector));
      const heightCandidate = Math.max(MIN_DIMENSION, -dotY(vector));
      const { width, height } = buildAspectLockedSize(widthCandidate, heightCandidate);
      const origin = subtract(bottomLeft, scalePoint(axisY, height));

      return buildFromOrigin(origin, width, height);
    }

    case 'e': {
      const vector = subtract(point, topLeft);
      const width = Math.max(MIN_DIMENSION, dotX(vector));

      return buildFromOrigin(topLeft, width, baseHeight);
    }

    case 'se': {
      const vector = subtract(point, topLeft);
      const widthCandidate = Math.max(MIN_DIMENSION, dotX(vector));
      const heightCandidate = Math.max(MIN_DIMENSION, dotY(vector));
      const { width, height } = buildAspectLockedSize(widthCandidate, heightCandidate);

      return buildFromOrigin(topLeft, width, height);
    }

    case 's': {
      const vector = subtract(point, topLeft);
      const height = Math.max(MIN_DIMENSION, dotY(vector));

      return buildFromOrigin(topLeft, baseWidth, height);
    }

    case 'sw': {
      const vector = subtract(point, topRight);
      const widthCandidate = Math.max(MIN_DIMENSION, -dotX(vector));
      const heightCandidate = Math.max(MIN_DIMENSION, dotY(vector));
      const { width, height } = buildAspectLockedSize(widthCandidate, heightCandidate);
      const origin = subtract(topRight, scalePoint(axisX, width));

      return buildFromOrigin(origin, width, height);
    }

    case 'w': {
      const vector = subtract(point, topRight);
      const width = Math.max(MIN_DIMENSION, -dotX(vector));
      const origin = subtract(topRight, scalePoint(axisX, width));

      return buildFromOrigin(origin, width, baseHeight);
    }
  }

  throw new Error(`Unsupported resize handle: ${handle}`);
}

export interface QuadDecompositionOptions extends BoxGeometryDescriptor {}

export function decomposeQuadToTransform(
  quad: Quad,
  descriptor?: QuadDecompositionOptions,
): TransformState {
  const geometry = resolveBoxGeometry(descriptor);
  const safeWidth = Math.max(1e-6, geometry.bounds.width);
  const safeHeight = Math.max(1e-6, geometry.bounds.height);

  const xAxis = subtract(quad[1], quad[0]);
  const yAxis = subtract(quad[3], quad[0]);
  const rotation = Math.atan2(xAxis.y, xAxis.x);
  const axisX = { x: Math.cos(rotation), y: Math.sin(rotation) };
  const axisY = { x: -Math.sin(rotation), y: Math.cos(rotation) };

  const scaleX = dot(xAxis, axisX) / safeWidth;
  const scaleY = dot(yAxis, axisY) / safeHeight;

  const pivotRelative = {
    x: (geometry.pivot.x - geometry.bounds.left) / safeWidth,
    y: (geometry.pivot.y - geometry.bounds.top) / safeHeight,
  };

  const pivotWorldOffset = {
    x: xAxis.x * pivotRelative.x + yAxis.x * pivotRelative.y,
    y: xAxis.y * pivotRelative.x + yAxis.y * pivotRelative.y,
  };

  const position = {
    x: quad[0].x - scaleX * (geometry.pivot.x - geometry.anchor.x) + pivotWorldOffset.x,
    y: quad[0].y - scaleY * (geometry.pivot.y - geometry.anchor.y) + pivotWorldOffset.y,
  };

  return {
    position,
    scale: { x: scaleX, y: scaleY },
    rotation,
  };
}

export function normalizeTransformFields(value: unknown): NormalizedTransformFields | undefined {
  const source = readTransformSource(value);
  if (!source) {
    return undefined;
  }

  const position = readPoint(source.position) ?? readPoint(readLegacyPoint(source));
  const scale = readPoint(source.scale) ?? readPoint(readLegacyScale(source));
  const rotation = normalizeNumber(source.rotation, Number.NaN);

  if (!position && !scale && !Number.isFinite(rotation)) {
    return undefined;
  }

  const normalized: NormalizedTransformFields = {};
  if (position) {
    normalized.position = position;
  }
  if (scale) {
    normalized.scale = scale;
  }
  if (Number.isFinite(rotation)) {
    normalized.rotation = rotation;
  }

  return normalized;
}
