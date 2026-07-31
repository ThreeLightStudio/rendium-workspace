import {
  type ILayer,
  type ILayerManifest,
  type IRenderableLayer,
  type JsonValue,
  buildTransformMatrix,
  createQuadFromBounds,
  decomposeQuadToTransform,
  resolveImageLayout,
  getQuadBounds as sharedGetQuadBounds,
  pointInQuad as sharedPointInQuad,
  resizeQuadFromHandle as sharedResizeQuadFromHandle,
  rotateQuadAround as sharedRotateQuadAround,
  transformQuad,
} from '@rendium/engine';
import {
  getManifestForLayer,
  getSourceParam,
  getStudioLayerTypeFromManifest,
  isProjectAnchorManifest,
  isSystemManifest,
} from './canonicalLayer';

export type Point = {
  x: number;
  y: number;
};

export type Quad = readonly [Point, Point, Point, Point];

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type PreviewFrameAnchorMode = 'topLeft' | 'center' | 'custom';

export interface PreviewFrame {
  readonly id: string;
  readonly type: string;
  readonly quad: Quad;
  readonly origin: Point;
  readonly center: Point;
  readonly xAxis: Point;
  readonly yAxis: Point;
  readonly bounds: { left: number; top: number; width: number; height: number };
  readonly rotation: number;
  readonly width: number;
  readonly height: number;
  readonly scaleReference: { width: number; height: number };
  readonly scaleSign: { x: number; y: number };
  readonly anchorMode: PreviewFrameAnchorMode;
  readonly anchor: Point;
  readonly isSelectable: boolean;
  readonly name: string;
}

function isRenderableLayer(layer: ILayer): layer is IRenderableLayer {
  return 'draw' in layer && 'appearance' in layer && 'position' in layer && 'scale' in layer;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePoint(
  value: unknown,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const point = value as { x?: unknown; y?: unknown };
  return {
    x: normalizeNumber(point.x, fallback.x),
    y: normalizeNumber(point.y, fallback.y),
  };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scalePoint(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor };
}

function rotateVector(vector: Point, rotation: number): Point {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function length(point: Point): number {
  return Math.hypot(point.x, point.y);
}

function centerOfQuad(quad: Quad): Point {
  return {
    x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
    y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4,
  };
}

export function getQuadBounds(quad: Quad): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return sharedGetQuadBounds(quad);
}

function buildQuad(origin: Point, xAxis: Point, yAxis: Point): Quad {
  return [origin, add(origin, xAxis), add(add(origin, xAxis), yAxis), add(origin, yAxis)];
}

function getLocalRotation(frame: { xAxis: Point }): number {
  return Math.atan2(frame.xAxis.y, frame.xAxis.x);
}

function getScaleSign(value: number): number {
  return Math.sign(value) || 1;
}

function buildPreviewFrameFromMatrix(options: {
  id: string;
  type: string;
  matrix: Float32Array;
  localBounds: { left: number; top: number; width: number; height: number };
  scaleReference: { width: number; height: number };
  scaleSign: { x: number; y: number };
  anchorMode: PreviewFrameAnchorMode;
  anchor: Point;
  isSelectable: boolean;
  name: string;
}): PreviewFrame {
  const quad = transformQuad(createQuadFromBounds(options.localBounds), options.matrix);
  const xAxis = subtract(quad[1], quad[0]);
  const yAxis = subtract(quad[3], quad[0]);
  const bounds = getQuadBounds(quad);
  const center = centerOfQuad(quad);

  return {
    id: options.id,
    type: options.type,
    quad,
    origin: quad[0],
    center,
    xAxis,
    yAxis,
    bounds,
    rotation: getLocalRotation({ xAxis }),
    width: length(xAxis),
    height: length(yAxis),
    scaleReference: options.scaleReference,
    scaleSign: options.scaleSign,
    anchorMode: options.anchorMode,
    anchor: options.anchor,
    isSelectable: options.isSelectable,
    name: options.name,
  };
}

function resolveImageFrame(
  layer: IRenderableLayer,
  layerType: string,
  manifest: ILayerManifest,
  canvasWidth: number,
  canvasHeight: number,
): PreviewFrame | null {
  const position = normalizePoint(layer.position, { x: 0, y: 0 });
  const scale = normalizePoint(layer.scale, { x: 1, y: 1 });
  const rotation = normalizeNumber(layer.rotation, 0);
  const fit = getSourceParam<'contain' | 'cover'>(manifest, 'fit');
  const sourceWidth = normalizeNumber(getSourceParam<number>(manifest, 'sourceWidth'), layer.width);
  const sourceHeight = normalizeNumber(
    getSourceParam<number>(manifest, 'sourceHeight'),
    layer.height,
  );

  const layout = resolveImageLayout({
    canvasWidth,
    canvasHeight,
    sourceWidth,
    sourceHeight,
    position,
    scale,
    fit,
  });

  const layoutScale = {
    x: getScaleSign(scale.x),
    y: getScaleSign(scale.y),
  };
  const renderedScale = {
    x: Math.max(1e-6, Math.abs(layout.width)) * layoutScale.x,
    y: Math.max(1e-6, Math.abs(layout.height)) * layoutScale.y,
  };
  const matrix = buildTransformMatrix(
    {
      position: { x: layout.x, y: layout.y },
      scale: renderedScale,
      rotation,
    },
    {
      bounds: {
        left: 0,
        top: 0,
        width: 1,
        height: 1,
      },
      anchor: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    },
  );

  return buildPreviewFrameFromMatrix({
    id: layer.id,
    type: layerType,
    matrix,
    localBounds: {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    },
    scaleReference: {
      width: Math.max(1e-6, Math.abs(layout.width / (scale.x || 1))),
      height: Math.max(1e-6, Math.abs(layout.height / (scale.y || 1))),
    },
    scaleSign: layoutScale,
    anchorMode: 'topLeft',
    anchor: { x: 0, y: 0 },
    isSelectable: true,
    name: layer.name ?? layer.id,
  });
}

function resolveTextFrame(
  layer: IRenderableLayer,
  layerType: string,
  manifest: ILayerManifest,
  canvasWidth: number,
  canvasHeight: number,
): PreviewFrame {
  const position = normalizePoint(layer.position, { x: 0, y: 0 });
  const scale = normalizePoint(layer.scale, { x: 1, y: 1 });
  const rotation = normalizeNumber(layer.rotation, 0);
  const anchor = normalizePoint(getSourceParam<Record<string, JsonValue>>(manifest, 'anchor'), {
    x: 0,
    y: 0,
  });
  const intrinsicWidth = Math.max(1e-6, layer.width || canvasWidth * 0.1);
  const intrinsicHeight = Math.max(1e-6, layer.height || canvasHeight * 0.05);
  const matrix = buildTransformMatrix(
    {
      position,
      scale,
      rotation,
    },
    {
      bounds: {
        left: 0,
        top: 0,
        width: intrinsicWidth,
        height: intrinsicHeight,
      },
      anchor,
      pivot: { x: 0.5, y: 0.5 },
    },
  );

  return buildPreviewFrameFromMatrix({
    id: layer.id,
    type: layerType,
    matrix,
    localBounds: {
      left: 0,
      top: 0,
      width: intrinsicWidth,
      height: intrinsicHeight,
    },
    scaleReference: {
      width: Math.max(1e-6, intrinsicWidth),
      height: Math.max(1e-6, intrinsicHeight),
    },
    scaleSign: {
      x: getScaleSign(scale.x),
      y: getScaleSign(scale.y),
    },
    anchorMode: 'custom',
    anchor,
    isSelectable: true,
    name: layer.name ?? layer.id,
  });
}

function resolveSpectrumFrame(
  layer: IRenderableLayer,
  layerType: string,
  manifest: ILayerManifest,
): PreviewFrame {
  const position = normalizePoint(layer.position, { x: 0, y: 0 });
  const scale = normalizePoint(layer.scale, { x: 1, y: 1 });
  const rotation = normalizeNumber(layer.rotation, 0);
  const maxHeight = Math.max(0.01, normalizeNumber(getSourceParam(manifest, 'maxHeight'), 0.2));
  const matrix = buildTransformMatrix(
    {
      position,
      scale,
      rotation,
    },
    {
      bounds: {
        left: 0,
        top: 0,
        width: 1,
        height: maxHeight,
      },
      anchor: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    },
  );

  return buildPreviewFrameFromMatrix({
    id: layer.id,
    type: layerType,
    matrix,
    localBounds: {
      left: 0,
      top: 0,
      width: 1,
      height: maxHeight,
    },
    scaleReference: {
      width: 1,
      height: Math.max(1e-6, maxHeight),
    },
    scaleSign: {
      x: getScaleSign(scale.x),
      y: getScaleSign(scale.y),
    },
    anchorMode: 'topLeft',
    anchor: { x: 0, y: 0 },
    isSelectable: true,
    name: layer.name ?? layer.id,
  });
}

function resolveGenericRenderableFrame(layer: IRenderableLayer, layerType: string): PreviewFrame {
  const position = normalizePoint(layer.position, { x: 0, y: 0 });
  const scale = normalizePoint(layer.scale, { x: 1, y: 1 });
  const rotation = normalizeNumber(layer.rotation, 0);
  const matrix = buildTransformMatrix(
    {
      position,
      scale,
      rotation,
    },
    {
      bounds: {
        left: 0,
        top: 0,
        width: 1,
        height: 1,
      },
      anchor: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    },
  );

  return buildPreviewFrameFromMatrix({
    id: layer.id,
    type: layerType,
    matrix,
    localBounds: {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    },
    scaleReference: {
      width: 1,
      height: 1,
    },
    scaleSign: {
      x: getScaleSign(scale.x),
      y: getScaleSign(scale.y),
    },
    anchorMode: 'topLeft',
    anchor: { x: 0, y: 0 },
    isSelectable: true,
    name: layer.name ?? layer.id,
  });
}

/**
 * Builds the visual/editing frame for a layer using the same geometry model
 * as the preview renderer.
 */
export function buildPreviewFrame(
  layer: ILayer,
  canvasWidth: number,
  canvasHeight: number,
): PreviewFrame | null {
  const manifest = getManifestForLayer(layer);
  if (!manifest || manifest.kind !== 'visual') {
    return null;
  }

  const layerType = getStudioLayerTypeFromManifest(manifest);
  if (layerType === 'audio' || layerType === 'scope:start' || layerType === 'scope:end') {
    return null;
  }

  if (isProjectAnchorManifest(manifest) || isSystemManifest(manifest)) {
    return null;
  }

  if (!isRenderableLayer(layer)) {
    return null;
  }

  if (layer.visible === false) {
    return null;
  }

  if (layerType === 'image' || layerType === 'video') {
    return resolveImageFrame(layer, layerType, manifest, canvasWidth, canvasHeight);
  }

  if (layerType === 'text') {
    return resolveTextFrame(layer, layerType, manifest, canvasWidth, canvasHeight);
  }

  if (layerType === 'spectrum') {
    return resolveSpectrumFrame(layer, layerType, manifest);
  }

  return resolveGenericRenderableFrame(layer, layerType);
}

export function quadToPointsString(quad: Quad): string {
  return quad.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

export function translateQuad(quad: Quad, delta: Point): Quad {
  return quad.map((point) => add(point, delta)) as unknown as Quad;
}

export function rotateQuadAround(quad: Quad, center: Point, angle: number): Quad {
  return sharedRotateQuadAround(quad, center, angle);
}

export function pointInQuad(point: Point, quad: Quad): boolean {
  return sharedPointInQuad(point, quad);
}

export function getSelectionBounds(frames: PreviewFrame[]): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null {
  if (frames.length === 0) {
    return null;
  }

  const allPoints: Point[] = [];
  for (const frame of frames) {
    allPoints.push(...frame.quad);
  }

  const xs = allPoints.map((point) => point.x);
  const ys = allPoints.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function createAxisAlignedFrame(bounds: {
  left: number;
  top: number;
  width: number;
  height: number;
}): PreviewFrame {
  const origin = { x: bounds.left, y: bounds.top };
  const xAxis = { x: bounds.width, y: 0 };
  const yAxis = { x: 0, y: bounds.height };
  const quad = buildQuad(origin, xAxis, yAxis);

  return {
    id: 'selection-group',
    type: 'selection-group',
    quad,
    origin,
    center: centerOfQuad(quad),
    xAxis,
    yAxis,
    bounds,
    rotation: 0,
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height),
    scaleReference: { width: 1, height: 1 },
    scaleSign: { x: 1, y: 1 },
    anchorMode: 'topLeft',
    anchor: { x: 0, y: 0 },
    isSelectable: false,
    name: 'Selection',
  };
}

export function resizeQuadFromHandle(
  frame: Pick<PreviewFrame, 'quad'>,
  handle: ResizeHandle,
  point: Point,
): Quad {
  return sharedResizeQuadFromHandle(frame, handle, point);
}

function buildTransformFromFrame(
  frame: PreviewFrame,
  quad: Quad,
): Partial<{
  position: Point;
  scale: Point;
  rotation: number;
}> {
  const anchor =
    frame.anchorMode === 'center'
      ? { x: 0.5, y: 0.5 }
      : frame.anchorMode === 'custom'
        ? frame.anchor
        : { x: 0, y: 0 };

  const transform = decomposeQuadToTransform(quad, {
    bounds: {
      left: 0,
      top: 0,
      width: Math.max(1e-6, frame.scaleReference.width),
      height: Math.max(1e-6, frame.scaleReference.height),
    },
    anchor,
    pivot: { x: 0.5, y: 0.5 },
  });

  return {
    position: transform.position,
    scale: transform.scale,
    rotation: transform.rotation,
  };
}

export function updateSingleFrameFromMove(
  frame: PreviewFrame,
  delta: Point,
): Partial<{ position: Point; scale: Point; rotation: number }> {
  const quad = translateQuad(frame.quad, delta);
  return buildTransformFromFrame(frame, quad);
}

export function updateSingleFrameFromRotate(
  frame: PreviewFrame,
  angle: number,
): Partial<{ position: Point; scale: Point; rotation: number }> {
  return updateFrameFromCenterScale(
    frame,
    frame.center,
    frame.width,
    frame.height,
    frame.rotation + angle,
  );
}

export function updateSingleFrameFromResize(
  frame: PreviewFrame,
  handle: ResizeHandle,
  point: Point,
): Partial<{ position: Point; scale: Point; rotation: number }> {
  const quad = resizeQuadFromHandle(frame, handle, point);
  return buildTransformFromFrame(frame, quad);
}

export function updateFrameFromCenterScale(
  frame: PreviewFrame,
  center: Point,
  width: number,
  height: number,
  rotation: number,
): Partial<{ position: Point; scale: Point; rotation: number }> {
  const ux = { x: Math.cos(rotation), y: Math.sin(rotation) };
  const uy = { x: -Math.sin(rotation), y: Math.cos(rotation) };
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const origin = {
    x: center.x - ux.x * halfWidth - uy.x * halfHeight,
    y: center.y - ux.y * halfWidth - uy.y * halfHeight,
  };
  const quad = buildQuad(origin, scalePoint(ux, width), scalePoint(uy, height));
  return buildTransformFromFrame(frame, quad);
}

export function updateGroupFramesFromMove(
  frames: PreviewFrame[],
  delta: Point,
): Map<string, Partial<{ position: Point; scale: Point; rotation: number }>> {
  const updates = new Map<string, Partial<{ position: Point; scale: Point; rotation: number }>>();
  for (const frame of frames) {
    updates.set(frame.id, updateSingleFrameFromMove(frame, delta));
  }
  return updates;
}

export function updateGroupFramesFromRotate(
  frames: PreviewFrame[],
  groupCenter: Point,
  angle: number,
): Map<string, Partial<{ position: Point; scale: Point; rotation: number }>> {
  const updates = new Map<string, Partial<{ position: Point; scale: Point; rotation: number }>>();
  for (const frame of frames) {
    const vector = subtract(frame.center, groupCenter);
    const rotatedCenter = rotateVector(vector, angle);
    const center = add(groupCenter, rotatedCenter);
    const width = Math.max(1e-6, frame.width);
    const height = Math.max(1e-6, frame.height);
    const rotation = frame.rotation + angle;
    updates.set(frame.id, updateFrameFromCenterScale(frame, center, width, height, rotation));
  }
  return updates;
}

export function updateGroupFramesFromScale(
  frames: PreviewFrame[],
  originalBounds: { left: number; top: number; width: number; height: number },
  nextBounds: { left: number; top: number; width: number; height: number },
): Map<string, Partial<{ position: Point; scale: Point; rotation: number }>> {
  const updates = new Map<string, Partial<{ position: Point; scale: Point; rotation: number }>>();
  const scaleX = originalBounds.width === 0 ? 1 : nextBounds.width / originalBounds.width;
  const scaleY = originalBounds.height === 0 ? 1 : nextBounds.height / originalBounds.height;

  for (const frame of frames) {
    const localX =
      originalBounds.width === 0
        ? 0
        : (frame.center.x - originalBounds.left) / originalBounds.width;
    const localY =
      originalBounds.height === 0
        ? 0
        : (frame.center.y - originalBounds.top) / originalBounds.height;
    const center = {
      x: nextBounds.left + localX * nextBounds.width,
      y: nextBounds.top + localY * nextBounds.height,
    };
    const width = Math.max(1e-6, frame.width * scaleX);
    const height = Math.max(1e-6, frame.height * scaleY);
    updates.set(frame.id, updateFrameFromCenterScale(frame, center, width, height, frame.rotation));
  }

  return updates;
}

export function buildGroupBoundsFrame(frames: PreviewFrame[]): PreviewFrame | null {
  const bounds = getSelectionBounds(frames);
  if (!bounds) {
    return null;
  }
  return createAxisAlignedFrame(bounds);
}

export function isSelectablePreviewLayer(layer: ILayer): boolean {
  return buildPreviewFrame(layer, 1, 1) !== null;
}

export function getCanvasPointFromClient(
  clientX: number,
  clientY: number,
  element: SVGSVGElement | null,
  canvasWidth: number,
  canvasHeight: number,
): Point {
  if (!element) {
    return { x: 0, y: 0 };
  }

  const rect = element.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;

  return {
    x: ((clientX - rect.left) / width) * canvasWidth,
    y: ((clientY - rect.top) / height) * canvasHeight,
  };
}
