export interface PreviewFitInput {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export interface PreviewFitSize {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

function positiveFinite(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function calculatePreviewFitSize({
  viewportWidth,
  viewportHeight,
  canvasWidth,
  canvasHeight,
}: PreviewFitInput): PreviewFitSize {
  const safeCanvasWidth = positiveFinite(canvasWidth) ?? 1280;
  const safeCanvasHeight = positiveFinite(canvasHeight) ?? 720;
  const safeViewportWidth = positiveFinite(viewportWidth);
  const safeViewportHeight = positiveFinite(viewportHeight);

  if (!safeViewportWidth || !safeViewportHeight) {
    return {
      width: safeCanvasWidth,
      height: safeCanvasHeight,
      scale: 1,
    };
  }

  const scale = Math.min(
    safeViewportWidth / safeCanvasWidth,
    safeViewportHeight / safeCanvasHeight,
  );

  return {
    width: safeCanvasWidth * scale,
    height: safeCanvasHeight * scale,
    scale,
  };
}
