export const TIMELINE_SOFT_TARGET_SECONDS = 2 * 60 * 60;
export const TIMELINE_VIEWPORT_MIN_PX_PER_SEC = 0.01;

export function clampTimelineExtent(extent: number): number {
  return Math.max(TIMELINE_SOFT_TARGET_SECONDS, extent);
}

export function getTimelineMinPxPerSec(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return TIMELINE_VIEWPORT_MIN_PX_PER_SEC;
  }

  return viewportWidth / TIMELINE_SOFT_TARGET_SECONDS;
}

export function getPlaybackFollowScrollLeft(params: {
  currentTime: number;
  pxPerSec: number;
  viewportWidth: number;
  scrollLeft: number;
  timelineExtent: number;
}): number | null {
  const { currentTime, pxPerSec, viewportWidth, scrollLeft, timelineExtent } = params;
  if (
    !Number.isFinite(currentTime) ||
    !Number.isFinite(pxPerSec) ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(scrollLeft) ||
    !Number.isFinite(timelineExtent) ||
    pxPerSec <= 0 ||
    viewportWidth <= 0 ||
    timelineExtent <= 0
  ) {
    return null;
  }

  const playheadX = currentTime * pxPerSec;
  const visibleStartX = scrollLeft;
  const visibleEndX = scrollLeft + viewportWidth;
  if (playheadX >= visibleStartX && playheadX <= visibleEndX) {
    return null;
  }

  const desiredScrollLeft = playheadX - viewportWidth / 2;
  const maxScrollLeft = Math.max(0, timelineExtent * pxPerSec - viewportWidth);
  return Math.max(0, Math.min(maxScrollLeft, desiredScrollLeft));
}

export function getDraggedTimelineScrollLeft(params: {
  startScrollLeft: number;
  deltaX: number;
  maxScrollLeft: number;
}): number {
  const { startScrollLeft, deltaX, maxScrollLeft } = params;
  if (
    !Number.isFinite(startScrollLeft) ||
    !Number.isFinite(deltaX) ||
    !Number.isFinite(maxScrollLeft)
  ) {
    return 0;
  }

  return Math.max(0, Math.min(Math.max(0, maxScrollLeft), startScrollLeft - deltaX));
}
