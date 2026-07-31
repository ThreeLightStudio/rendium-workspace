import { describe, expect, it } from 'vitest';
import {
  TIMELINE_SOFT_TARGET_SECONDS,
  clampTimelineExtent,
  getDraggedTimelineScrollLeft,
  getPlaybackFollowScrollLeft,
  getTimelineMinPxPerSec,
} from './timelineViewport';

describe('timelineViewport', () => {
  it('derives a 2-hour minimum zoom floor from the viewport width', () => {
    const minPxPerSec = getTimelineMinPxPerSec(1920);

    expect(minPxPerSec).toBeCloseTo(1920 / TIMELINE_SOFT_TARGET_SECONDS, 6);
  });

  it('keeps the timeline extent at or above the 2-hour soft target', () => {
    expect(clampTimelineExtent(30)).toBe(TIMELINE_SOFT_TARGET_SECONDS);
    expect(clampTimelineExtent(10_000)).toBe(10_000);
  });

  it('centers the playhead when it leaves the visible viewport', () => {
    const nextScrollLeft = getPlaybackFollowScrollLeft({
      currentTime: 250,
      pxPerSec: 10,
      viewportWidth: 200,
      scrollLeft: 0,
      timelineExtent: 1000,
    });

    expect(nextScrollLeft).toBe(2400);
  });

  it('does not adjust scroll when the playhead is already visible', () => {
    const nextScrollLeft = getPlaybackFollowScrollLeft({
      currentTime: 10,
      pxPerSec: 10,
      viewportWidth: 200,
      scrollLeft: 0,
      timelineExtent: 1000,
    });

    expect(nextScrollLeft).toBeNull();
  });

  it('clamps ruler drag scroll within the available scroll range', () => {
    expect(
      getDraggedTimelineScrollLeft({
        startScrollLeft: 150,
        deltaX: -80,
        maxScrollLeft: 1000,
      }),
    ).toBe(230);

    expect(
      getDraggedTimelineScrollLeft({
        startScrollLeft: 20,
        deltaX: 50,
        maxScrollLeft: 1000,
      }),
    ).toBe(0);
  });
});
