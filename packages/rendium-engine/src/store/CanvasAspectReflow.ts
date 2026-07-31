import type { ILayerManifest } from '../_contracts';
import { TEXT_CONFIG } from '../_contracts';

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface CanvasReflowLayerUpdate {
  readonly transform?: NonNullable<ILayerManifest['transform']>;
  readonly textFontSize?: number;
}

export interface TextFontSizeReflowInput {
  readonly layer: ILayerManifest;
  readonly oldSize: CanvasSize;
  readonly nextSize: CanvasSize;
}

export interface ComputeCanvasAspectReflowLayerUpdateInput {
  readonly layer: ILayerManifest;
  readonly oldSize: CanvasSize;
  readonly nextSize: CanvasSize;
}

const DEFAULT_TRANSFORM: NonNullable<ILayerManifest['transform']> = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
};

const CANVAS_FIT_MEDIA_PROVIDERS = new Set(['raster', 'animated-raster', 'svg', 'video']);

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function getRatio(next: number, previous: number): number {
  if (!isPositiveFinite(next) || !isPositiveFinite(previous)) {
    return 1;
  }

  return next / previous;
}

function getTransform(layer: ILayerManifest): NonNullable<ILayerManifest['transform']> {
  return layer.transform ?? DEFAULT_TRANSFORM;
}

function isDefaultCanvasAnchoredTransform(transform?: ILayerManifest['transform']): boolean {
  if (!transform) {
    return true;
  }

  return (
    transform.position.x === 0 &&
    transform.position.y === 0 &&
    transform.scale.x === 1 &&
    transform.scale.y === 1 &&
    transform.rotation === 0
  );
}

function getStringParam(layer: ILayerManifest, key: string): string | undefined {
  const value = layer.source?.params?.[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumberParam(layer: ILayerManifest, key: string, fallback: number): number {
  const value = layer.source?.params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isReflowTarget(layer: ILayerManifest): boolean {
  return (
    layer.kind === 'visual' &&
    layer.control?.params?.isProjectAnchor !== true &&
    layer.control?.params?.isSystem !== true
  );
}

function isCanvasFitMedia(layer: ILayerManifest): boolean {
  const fit = getStringParam(layer, 'fit');
  return (
    CANVAS_FIT_MEDIA_PROVIDERS.has(layer.source?.provider ?? '') &&
    (fit === 'cover' || fit === 'contain') &&
    isDefaultCanvasAnchoredTransform(layer.transform)
  );
}

function scaleTransformByCanvas(
  layer: ILayerManifest,
  widthRatio: number,
  heightRatio: number,
): NonNullable<ILayerManifest['transform']> {
  const transform = getTransform(layer);

  return {
    position: {
      x: transform.position.x * widthRatio,
      y: transform.position.y * heightRatio,
    },
    scale: {
      x: transform.scale.x * widthRatio,
      y: transform.scale.y * heightRatio,
    },
    rotation: transform.rotation,
  };
}

function scaleTextTransformByCanvas(
  layer: ILayerManifest,
  widthRatio: number,
  heightRatio: number,
): NonNullable<ILayerManifest['transform']> {
  const transform = getTransform(layer);

  return {
    position: {
      x: transform.position.x * widthRatio,
      y: transform.position.y * heightRatio,
    },
    scale: { ...transform.scale },
    rotation: transform.rotation,
  };
}

export function getTextFontSizeReflow(input: TextFontSizeReflowInput): number {
  const { layer, oldSize, nextSize } = input;
  const oldShortEdge = Math.min(oldSize.width, oldSize.height);
  const nextShortEdge = Math.min(nextSize.width, nextSize.height);
  const shortEdgeRatio = getRatio(nextShortEdge, oldShortEdge);
  return getNumberParam(layer, 'fontSize', TEXT_CONFIG.DEFAULT_FONT_SIZE) * shortEdgeRatio;
}

export function computeCanvasAspectReflowLayerUpdate(
  input: ComputeCanvasAspectReflowLayerUpdateInput,
): CanvasReflowLayerUpdate | null {
  const { layer, oldSize, nextSize } = input;

  if (!isReflowTarget(layer) || isCanvasFitMedia(layer)) {
    return null;
  }

  const widthRatio = getRatio(nextSize.width, oldSize.width);
  const heightRatio = getRatio(nextSize.height, oldSize.height);

  if (layer.source?.provider === 'text') {
    return {
      transform: scaleTextTransformByCanvas(layer, widthRatio, heightRatio),
      textFontSize: getTextFontSizeReflow({ layer, oldSize, nextSize }),
    };
  }

  return {
    transform: scaleTransformByCanvas(layer, widthRatio, heightRatio),
  };
}
