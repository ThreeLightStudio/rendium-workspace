import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDraggedTimelineScrollLeft } from '../../utils/timelineViewport';

interface TimeRulerCanvasProps {
  timelineExtent: number;
  pxPerSec: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  height?: number;
  isEmptyProject?: boolean;
}

const MAJOR_TICK_CANDIDATES = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

const formatTimeLabel = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const TimeRulerCanvas: React.FC<TimeRulerCanvasProps> = ({
  timelineExtent,
  pxPerSec,
  scrollContainerRef,
  height = 30,
  isEmptyProject = false,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startScrollLeft: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const draw = useMemo(
    () => () => {
      const host = hostRef.current;
      const canvas = canvasRef.current;
      const scrollContainer = scrollContainerRef.current;
      if (!host || !canvas || !scrollContainer || pxPerSec <= 0) return;

      const viewportWidth = host.clientWidth;
      const scrollLeft = scrollContainer.scrollLeft;
      const dpr = window.devicePixelRatio || 1;

      canvas.style.width = `${viewportWidth}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.max(1, Math.floor(viewportWidth * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewportWidth, height);

      ctx.fillStyle = isEmptyProject ? '#09090b' : '#0a0a0c';
      ctx.fillRect(0, 0, viewportWidth, height);

      const minMajorTickPx = 72;
      let majorTickSeconds = MAJOR_TICK_CANDIDATES[MAJOR_TICK_CANDIDATES.length - 1];
      for (const candidate of MAJOR_TICK_CANDIDATES) {
        if (candidate * pxPerSec >= minMajorTickPx) {
          majorTickSeconds = candidate;
          break;
        }
      }

      const minorDivisors = [10, 5, 2, 1];
      const minMinorTickPx = 8;
      let minorTickSeconds = majorTickSeconds;
      for (const divisor of minorDivisors) {
        const candidate = majorTickSeconds / divisor;
        if (candidate * pxPerSec >= minMinorTickPx) {
          minorTickSeconds = candidate;
          break;
        }
      }

      const visibleStartTime = Math.max(0, scrollLeft / pxPerSec);
      const visibleEndTime = clamp((scrollLeft + viewportWidth) / pxPerSec, 0, timelineExtent);

      ctx.beginPath();
      ctx.strokeStyle = isEmptyProject ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;

      const minorStartIndex = Math.floor(visibleStartTime / minorTickSeconds) - 1;
      const minorEndIndex = Math.ceil(visibleEndTime / minorTickSeconds) + 1;
      for (let i = minorStartIndex; i <= minorEndIndex; i++) {
        const t = i * minorTickSeconds;
        if (t < 0 || t > timelineExtent) continue;
        const majorStepRatio = t / majorTickSeconds;
        if (Math.abs(majorStepRatio - Math.round(majorStepRatio)) < 1e-6) continue;
        const x = t * pxPerSec - scrollLeft;
        ctx.moveTo(x + 0.5, height - 8);
        ctx.lineTo(x + 0.5, height);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = isEmptyProject ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      ctx.fillStyle = isEmptyProject ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.82)';
      ctx.font = `${isEmptyProject ? 10 : 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = 'top';

      const majorStartIndex = Math.floor(visibleStartTime / majorTickSeconds) - 1;
      const majorEndIndex = Math.ceil(visibleEndTime / majorTickSeconds) + 1;
      for (let i = majorStartIndex; i <= majorEndIndex; i++) {
        const t = i * majorTickSeconds;
        if (t < 0 || t > timelineExtent) continue;
        const x = t * pxPerSec - scrollLeft;
        ctx.moveTo(x + 0.5, height - 14);
        ctx.lineTo(x + 0.5, height);
        ctx.fillText(formatTimeLabel(t), x + 4, 3);
      }
      ctx.stroke();
    },
    [height, isEmptyProject, pxPerSec, scrollContainerRef, timelineExtent],
  );

  const clearDragState = useCallback((pointerId?: number) => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    if (pointerId !== undefined && dragState.pointerId !== pointerId) {
      return;
    }

    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) {
        return;
      }

      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      dragStateRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startScrollLeft: scrollContainer.scrollLeft,
      };
      setIsDragging(true);

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort.
      }
    },
    [scrollContainerRef],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== e.pointerId) {
        return;
      }

      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) {
        return;
      }

      const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
      scrollContainer.scrollLeft = getDraggedTimelineScrollLeft({
        startScrollLeft: dragState.startScrollLeft,
        deltaX: e.clientX - dragState.startClientX,
        maxScrollLeft,
      });
    },
    [scrollContainerRef],
  );

  const finishDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      clearDragState(e.pointerId);

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture may already be released.
      }
    },
    [clearDragState],
  );

  useEffect(() => {
    const scheduleDraw = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        draw();
      });
    };

    const host = hostRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!host || !scrollContainer) return;

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleDraw()) : null;
    resizeObserver?.observe(host);
    scrollContainer.addEventListener('scroll', scheduleDraw, { passive: true });
    window.addEventListener('resize', scheduleDraw);

    scheduleDraw();

    return () => {
      resizeObserver?.disconnect();
      scrollContainer.removeEventListener('scroll', scheduleDraw);
      window.removeEventListener('resize', scheduleDraw);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [draw, scrollContainerRef]);

  return (
    <div
      ref={hostRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={() => clearDragState()}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 25,
        width: '100%',
        height: `${height}px`,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: '#0a0a0c',
        opacity: isEmptyProject ? 0.78 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
};
