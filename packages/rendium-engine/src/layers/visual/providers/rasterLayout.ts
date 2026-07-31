import type { ImageFitMode } from '../../../_contracts';

export interface ImageLayoutInput {
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  fit?: ImageFitMode;
}

export interface ImageLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveImageLayout({
  canvasWidth,
  canvasHeight,
  sourceWidth,
  sourceHeight,
  position,
  scale,
  fit,
}: ImageLayoutInput): ImageLayout {
  const safeCanvasWidth = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 1;
  const safeCanvasHeight = Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : 1;
  const safeSourceWidth =
    Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : safeCanvasWidth;
  const safeSourceHeight =
    Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : safeCanvasHeight;

  if (fit === 'contain' || fit === 'cover') {
    const widthRatio = safeCanvasWidth / safeSourceWidth;
    const heightRatio = safeCanvasHeight / safeSourceHeight;
    const scaleFactor =
      fit === 'contain' ? Math.min(widthRatio, heightRatio) : Math.max(widthRatio, heightRatio);
    const fittedWidth = safeSourceWidth * scaleFactor;
    const fittedHeight = safeSourceHeight * scaleFactor;

    return {
      x: (safeCanvasWidth - fittedWidth) / 2 + position.x,
      y: (safeCanvasHeight - fittedHeight) / 2 + position.y,
      width: fittedWidth * scale.x,
      height: fittedHeight * scale.y,
    };
  }

  return {
    x: position.x,
    y: position.y,
    width: safeSourceWidth * scale.x,
    height: safeSourceHeight * scale.y,
  };
}
