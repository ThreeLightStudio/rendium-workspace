import { type ILayer, type IRenderableLayer, resolveImageLayout } from '@rendium/engine';
import { getStudioLayerType } from './canonicalLayer';

type SpectrumConfigLike = {
  position?: { x: number; y: number };
  scale?: { x: number; y: number };
  maxHeight?: number;
};

type ImageConfigLike = {
  anchor?: { x?: number; y?: number };
  fit?: 'contain' | 'cover';
};

export interface LayerBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayerCenter {
  x: number;
  y: number;
}

function isRenderable(layer: ILayer): layer is IRenderableLayer {
  return 'position' in layer && 'appearance' in layer;
}

function mapXToPercent(val: number, logicalWidth: number): number {
  if (logicalWidth <= 2) {
    return ((val + 1) / 2) * 100;
  }
  return (val / logicalWidth) * 100;
}

function mapYToPercent(val: number, logicalHeight: number): number {
  if (logicalHeight <= 2) {
    return ((1 - val) / 2) * 100;
  }
  return (val / logicalHeight) * 100;
}

export function getLayerBounds(
  layer: ILayer,
  logicalWidth: number,
  logicalHeight: number,
  spectrumConfig?: SpectrumConfigLike,
): LayerBounds | null {
  const layerType = getStudioLayerType(layer);
  if (layerType === 'audio' || layerType === 'scope:start' || layerType === 'scope:end') {
    return null;
  }

  if (!isRenderable(layer)) return null;

  const config: ImageConfigLike | undefined = (
    layer as ILayer & { getConfig?: () => unknown }
  ).getConfig?.() as ImageConfigLike | undefined;
  const pos = layer.position;
  const scl = layer.scale;
  const anchor = {
    x: typeof config?.anchor?.x === 'number' ? config.anchor.x : 0,
    y: typeof config?.anchor?.y === 'number' ? config.anchor.y : 0,
  };

  if (layerType === 'spectrum') {
    const sPos = spectrumConfig?.position ?? { x: 0, y: -1 };
    const sScl = spectrumConfig?.scale ?? { x: 0.6, y: 1 };
    const sMaxH = spectrumConfig?.maxHeight ?? 0.2;

    const pixWidth = sScl.x;
    const pixHeight = sMaxH * sScl.y;

    const leftVal = sPos.x;
    const rightVal = sPos.x + pixWidth;
    const topVal = sPos.y;
    const bottomVal = sPos.y + pixHeight;

    const left = mapXToPercent(leftVal, logicalWidth);
    const right = mapXToPercent(rightVal, logicalWidth);
    const top = mapYToPercent(topVal, logicalHeight);
    const bottom = mapYToPercent(bottomVal, logicalHeight);

    return {
      left: Math.min(left, right),
      top: Math.min(top, bottom),
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    };
  }

  const intrinsicWidth = layer.width;
  const intrinsicHeight = layer.height;

  if (layerType === 'image') {
    const fit = config?.fit as 'contain' | 'cover' | undefined;
    const layout = resolveImageLayout({
      canvasWidth: logicalWidth,
      canvasHeight: logicalHeight,
      sourceWidth: intrinsicWidth,
      sourceHeight: intrinsicHeight,
      position: pos,
      scale: scl,
      fit,
    });

    const left = mapXToPercent(layout.x, logicalWidth);
    const right = mapXToPercent(layout.x + layout.width, logicalWidth);
    const top = mapYToPercent(layout.y, logicalHeight);
    const bottom = mapYToPercent(layout.y + layout.height, logicalHeight);

    return {
      left: Math.min(left, right),
      top: Math.min(top, bottom),
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    };
  }

  let left: number;
  let top: number;
  let width: number;
  let height: number;

  if (logicalWidth <= 2) {
    const ndcLeft = pos.x - scl.x;
    const ndcRight = pos.x + scl.x;
    const ndcTop = pos.y + scl.y;
    const ndcBottom = pos.y - scl.y;

    left = mapXToPercent(ndcLeft, logicalWidth);
    const right = mapXToPercent(ndcRight, logicalWidth);
    top = mapYToPercent(ndcTop, logicalHeight);
    const bottom = mapYToPercent(ndcBottom, logicalHeight);

    width = right - left;
    height = bottom - top;
  } else {
    const pixWidth = intrinsicWidth * scl.x;
    const pixHeight = intrinsicHeight * scl.y;

    const leftVal = pos.x - pixWidth * anchor.x;
    const rightVal = leftVal + pixWidth;
    const topVal = pos.y - pixHeight * anchor.y;
    const bottomVal = topVal + pixHeight;

    left = mapXToPercent(leftVal, logicalWidth);
    const right = mapXToPercent(rightVal, logicalWidth);
    top = mapYToPercent(topVal, logicalHeight);
    const bottom = mapYToPercent(bottomVal, logicalHeight);

    width = Math.abs(right - left);
    height = Math.abs(bottom - top);
    left = Math.min(left, right);
    top = Math.min(top, bottom);
  }

  return { left, top, width, height };
}

export function getLayerCenter(
  layer: ILayer,
  logicalWidth: number,
  logicalHeight: number,
  spectrumConfig?: SpectrumConfigLike,
): LayerCenter | null {
  const bounds = getLayerBounds(layer, logicalWidth, logicalHeight, spectrumConfig);
  if (!bounds) return null;

  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}
