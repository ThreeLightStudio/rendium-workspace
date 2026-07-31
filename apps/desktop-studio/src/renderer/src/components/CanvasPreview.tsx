import type { MediaReadiness } from '@rendium/engine';
import { FastForward, Rewind, SkipBack } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../i18n/locale';
import { calculatePreviewFitSize } from '../utils/previewFit';
import { formatTime } from '../utils/time';
import { HoverOverlay } from './HoverOverlay';
import { PlayPauseButton } from './Transport/PlayPauseButton';
import { ScaleControlBar } from './ui/ScaleControlBar';

/**
 * Canvas Preview component.
 * Renders the WebGPU canvas with external control.
 */
interface CanvasPreviewProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isReady: boolean;
  currentTime: number;
  isPlaying: boolean;
  canPlay: boolean;
  mediaReadiness: MediaReadiness;
  seek: (time: number) => void;
  togglePlay: () => void;
  width: number;
  height: number;
}

export function CanvasPreview({
  canvasRef,
  isReady,
  currentTime,
  isPlaying,
  canPlay,
  mediaReadiness,
  seek,
  togglePlay,
  width,
  height,
}: CanvasPreviewProps) {
  const { t } = useLocale();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isGridVisible, setIsGridVisible] = useState(false);
  const safeCanvasWidth = Number.isFinite(width) && width > 0 ? width : 1280;
  const safeCanvasHeight = Number.isFinite(height) && height > 0 ? height : 720;
  const [viewportSize, setViewportSize] = useState({
    width: safeCanvasWidth,
    height: safeCanvasHeight,
  });
  const [previewPixelRatio, setPreviewPixelRatio] = useState(() =>
    typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1),
  );
  const fitSize = useMemo(
    () =>
      calculatePreviewFitSize({
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        canvasWidth: safeCanvasWidth,
        canvasHeight: safeCanvasHeight,
      }),
    [safeCanvasHeight, safeCanvasWidth, viewportSize.height, viewportSize.width],
  );
  const renderTargetWidth = Math.max(1, Math.round(fitSize.width * previewPixelRatio));
  const renderTargetHeight = Math.max(1, Math.round(fitSize.height * previewPixelRatio));
  const timelineLengthLabel = '∞';
  const isPreviewPreparing = !isReady || mediaReadiness === 'loading';
  const hasMediaFailure = isReady && mediaReadiness === 'failed';
  const previewPreparingLabel = !isReady
    ? t('canvas.previewPreparing')
    : t('canvas.mediaPreparing');
  const previewPreparingHint = !isReady
    ? t('canvas.previewPreparingHint')
    : t('canvas.mediaPreparingHint');
  const previewPreparingDetail = !isReady
    ? t('canvas.previewTechnicalDetail')
    : t('canvas.mediaPreparingDetail');

  const measurePreviewViewport = useCallback(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    setViewportSize((current) => {
      const nextWidth = rect.width || safeCanvasWidth;
      const nextHeight = rect.height || safeCanvasHeight;
      if (
        Math.abs(current.width - nextWidth) < 0.5 &&
        Math.abs(current.height - nextHeight) < 0.5
      ) {
        return current;
      }

      return {
        width: nextWidth,
        height: nextHeight,
      };
    });
  }, [safeCanvasHeight, safeCanvasWidth]);

  useEffect(() => {
    const syncPixelRatio = () => {
      setPreviewPixelRatio(Math.max(1, window.devicePixelRatio || 1));
    };

    syncPixelRatio();
    window.addEventListener('resize', syncPixelRatio);

    return () => {
      window.removeEventListener('resize', syncPixelRatio);
    };
  }, []);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    measurePreviewViewport();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measurePreviewViewport) : null;
    resizeObserver?.observe(node);
    window.addEventListener('resize', measurePreviewViewport);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measurePreviewViewport);
    };
  }, [measurePreviewViewport]);

  const transportButtonStyle = {
    background: 'rgba(0, 0, 0, 0.45)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: '50px',
    fontWeight: 'bold',
    fontSize: '13px',
    letterSpacing: '0.05em',
    cursor: canPlay ? 'pointer' : 'default',
    transition: 'all 0.3s cubic-bezier(0.19, 1, 0.22, 1)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    opacity: canPlay ? 1 : 0.35,
  } as const;
  const compactTransportButtonStyle = {
    ...transportButtonStyle,
    width: '42px',
    minWidth: '42px',
    height: '42px',
    padding: 0,
    borderRadius: '999px',
    gap: 0,
  } as const;
  return (
    <div
      data-f="canvas-preview"
      className="canvas-preview-container"
      style={{
        position: 'relative',
        flexGrow: 1,
        minWidth: 0,
        minHeight: 0,
        backgroundColor: '#000',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        data-f="canvas-preview-viewport"
        ref={viewportRef}
        className="canvas-viewport"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          maxWidth: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          data-f="canvas-preview-fit-wrapper"
          className="canvas-fit-wrapper"
          style={{
            position: 'relative',
            aspectRatio: `${safeCanvasWidth} / ${safeCanvasHeight}`,
            width: `${fitSize.width}px`,
            height: `${fitSize.height}px`,
            maxWidth: '100%',
            maxHeight: '100%',
            boxShadow: '0 20px 80px rgba(0,0,0,0.8)',
            backgroundColor: '#050505',
          }}
        >
          <canvas
            data-f="canvas-preview-render-target"
            ref={canvasRef}
            width={renderTargetWidth}
            height={renderTargetHeight}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
            }}
          />
          <HoverOverlay
            isPlaying={isPlaying}
            togglePlay={togglePlay}
            width={width}
            height={height}
          />

          {/* Grid Overlay */}
          {isGridVisible && (
            <div
              data-f="canvas-preview-grid"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 5,
                opacity: 0.6,
              }}
            >
              {/* Horizontal Lines */}
              <div
                data-f="canvas-preview-grid-horizontal-top"
                style={{
                  position: 'absolute',
                  top: '33.33%',
                  left: 0,
                  right: 0,
                  height: '1px',
                  borderTop: '1px dashed rgba(255,255,255,0.4)',
                }}
              />
              <div
                data-f="canvas-preview-grid-horizontal-bottom"
                style={{
                  position: 'absolute',
                  top: '66.66%',
                  left: 0,
                  right: 0,
                  height: '1px',
                  borderTop: '1px dashed rgba(255,255,255,0.4)',
                }}
              />
              {/* Vertical Lines */}
              <div
                data-f="canvas-preview-grid-vertical-left"
                style={{
                  position: 'absolute',
                  left: '33.33%',
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  borderLeft: '1px dashed rgba(255,255,255,0.4)',
                }}
              />
              <div
                data-f="canvas-preview-grid-vertical-right"
                style={{
                  position: 'absolute',
                  left: '66.66%',
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  borderLeft: '1px dashed rgba(255,255,255,0.4)',
                }}
              />

              {/* Center Cross (Subtle) */}
              <div
                data-f="canvas-preview-grid-center"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '20px',
                  height: '20px',
                }}
              >
                <div
                  data-f="canvas-preview-grid-center-horizontal"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '1px',
                    background: 'rgba(255,255,255,0.2)',
                  }}
                />
                <div
                  data-f="canvas-preview-grid-center-vertical"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    background: 'rgba(255,255,255,0.2)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {isPreviewPreparing && (
        <div
          data-f="canvas-preview-loading"
          className="canvas-loading"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
          }}
        >
          <div
            data-f="canvas-preview-loading-message"
            title={previewPreparingDetail}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              color: 'rgba(238, 246, 255, 0.72)',
            }}
          >
            <span
              data-f="canvas-preview-loading-title"
              style={{ fontSize: '14px', fontWeight: 700 }}
            >
              {previewPreparingLabel}
            </span>
            <span
              data-f="canvas-preview-loading-hint"
              style={{ fontSize: '12px', color: 'rgba(238, 246, 255, 0.44)' }}
            >
              {previewPreparingHint}
            </span>
          </div>
        </div>
      )}

      {hasMediaFailure && (
        <div
          role="alert"
          aria-live="assertive"
          data-f="preview-media-error"
          style={{
            position: 'absolute',
            top: '24px',
            left: '50%',
            zIndex: 50,
            maxWidth: 'min(560px, calc(100% - 48px))',
            transform: 'translateX(-50%)',
            border: '1px solid rgba(255, 130, 96, 0.48)',
            borderRadius: '10px',
            background: 'rgba(66, 21, 12, 0.94)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.42)',
            color: '#ffe8df',
            padding: '12px 16px',
            textAlign: 'center',
          }}
        >
          <div data-f="preview-media-error-title" style={{ fontSize: '14px', fontWeight: 700 }}>
            {t('canvas.mediaFailed')}
          </div>
          <div
            data-f="preview-media-error-hint"
            style={{ marginTop: '4px', fontSize: '12px', lineHeight: 1.45, opacity: 0.82 }}
          >
            {t('canvas.mediaFailedHint')}
          </div>
        </div>
      )}

      {/* Top-Right Fit Control */}
      <div
        data-f="canvas-preview-scale-control"
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <ScaleControlBar
          label={t('canvas.fitPreview')}
          ariaLabelPrefix="Preview"
          resetAriaLabel={t('canvas.fitPreviewToViewport')}
          onReset={measurePreviewViewport}
        />
      </div>

      {/* Top-Left Toggle (Grid) */}
      <div
        data-f="canvas-preview-grid-control"
        style={{
          position: 'absolute',
          top: '24px',
          left: '24px',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <button
          data-f="canvas-preview-toggle-grid"
          type="button"
          onClick={() => setIsGridVisible(!isGridVisible)}
          title={t('canvas.toggleGrid')}
          style={{
            background: isGridVisible ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: isGridVisible ? '#fff' : 'rgba(255,255,255,0.6)',
            padding: '10px',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.19, 1, 0.22, 1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = isGridVisible
              ? 'rgba(255, 255, 255, 0.15)'
              : 'rgba(0, 0, 0, 0.4)';
            e.currentTarget.style.color = isGridVisible ? '#fff' : 'rgba(255,255,255,0.6)';
          }}
        >
          <svg
            data-f="canvas-preview-toggle-grid-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title data-f="canvas-preview-toggle-grid-icon-title">{t('canvas.toggleGrid')}</title>
            <rect
              data-f="canvas-preview-toggle-grid-icon-border"
              x="3"
              y="3"
              width="18"
              height="18"
              rx="2"
              ry="2"
            />
            <line data-f="canvas-preview-toggle-grid-icon-row-one" x1="3" y1="9" x2="21" y2="9" />
            <line data-f="canvas-preview-toggle-grid-icon-row-two" x1="3" y1="15" x2="21" y2="15" />
            <line
              data-f="canvas-preview-toggle-grid-icon-column-one"
              x1="9"
              y1="3"
              x2="9"
              y2="21"
            />
            <line
              data-f="canvas-preview-toggle-grid-icon-column-two"
              x1="15"
              y1="3"
              x2="15"
              y2="21"
            />
          </svg>
        </button>
      </div>

      {/* Playback Control Overlay */}
      <div
        data-f="canvas-preview-transport"
        className="canvas-play-overlay"
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <button
          data-f="canvas-preview-jump-start"
          type="button"
          onClick={() => seek(0)}
          disabled={!canPlay}
          style={{
            ...compactTransportButtonStyle,
            background: 'rgba(0, 0, 0, 0.52)',
          }}
          aria-label="Jump to start"
          title="Jump to start"
          onMouseEnter={(e) => {
            if (!canPlay) {
              return;
            }

            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'scale(1.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.52)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <SkipBack size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <button
          data-f="canvas-preview-seek-backward"
          type="button"
          onClick={() => seek(currentTime - 10)}
          disabled={!canPlay}
          style={{
            ...compactTransportButtonStyle,
            background: 'rgba(0, 0, 0, 0.52)',
          }}
          aria-label="Seek backward 10 seconds"
          title="Seek backward 10 seconds"
          onMouseEnter={(e) => {
            if (!canPlay) {
              return;
            }

            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'scale(1.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.52)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <Rewind size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <PlayPauseButton isPlaying={isPlaying} canPlay={canPlay} onClick={togglePlay} />
        <button
          data-f="canvas-preview-seek-forward"
          type="button"
          onClick={() => seek(currentTime + 10)}
          disabled={!canPlay}
          style={{
            ...compactTransportButtonStyle,
            background: 'rgba(0, 0, 0, 0.52)',
          }}
          aria-label="Seek forward 10 seconds"
          title="Seek forward 10 seconds"
          onMouseEnter={(e) => {
            if (!canPlay) {
              return;
            }

            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'scale(1.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.52)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <FastForward size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      {/* Time Display Overlay */}
      <div
        data-f="canvas-preview-timecode"
        className="canvas-time-overlay"
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          zIndex: 20,
          color: '#EEE',
          fontSize: '13px',
          fontFamily: 'monospace',
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '8px 14px',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          letterSpacing: '0.05em',
          display: 'flex',
          alignItems: 'baseline',
          gap: '8px',
        }}
        title={t('canvas.infiniteTimeline')}
      >
        <span data-f="canvas-preview-current-time" style={{ fontWeight: 'bold' }}>
          {formatTime(currentTime)}
        </span>
        <span
          data-f="canvas-preview-timeline-extent"
          aria-hidden="true"
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '999px',
            border: '1px solid rgba(255,255,255,0.08)',
            lineHeight: 1,
          }}
        >
          {timelineLengthLabel}
        </span>
      </div>
    </div>
  );
}
