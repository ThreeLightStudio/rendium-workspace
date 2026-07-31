import type React from 'react';

interface ScaleControlBarProps {
  label: string;
  ariaLabelPrefix: string;
  onReset: () => void;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
  resetAriaLabel?: string;
  zoomOutAriaLabel?: string;
  zoomInAriaLabel?: string;
  zoomOutDisabled?: boolean;
  zoomInDisabled?: boolean;
  style?: React.CSSProperties;
}

const controlButtonStyle = {
  height: '24px',
  borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: '#d6d6d6',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const stepButtonStyle = {
  ...controlButtonStyle,
  width: '28px',
  padding: 0,
  color: '#e8e8e8',
} as const;

export function ScaleControlBar({
  label,
  ariaLabelPrefix,
  onReset,
  onZoomOut,
  onZoomIn,
  resetAriaLabel,
  zoomOutAriaLabel,
  zoomInAriaLabel,
  zoomOutDisabled = false,
  zoomInDisabled = false,
  style,
}: ScaleControlBarProps) {
  const showZoomControls = Boolean(onZoomOut || onZoomIn);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '6px',
        ...style,
      }}
    >
      {showZoomControls && onZoomOut ? (
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoomOutDisabled}
          aria-label={zoomOutAriaLabel ?? `${ariaLabelPrefix} zoom out`}
          style={stepButtonStyle}
        >
          -
        </button>
      ) : null}
      <button
        type="button"
        onClick={onReset}
        aria-label={resetAriaLabel ?? `${ariaLabelPrefix} fit`}
        style={{
          ...controlButtonStyle,
          padding: '0 10px',
        }}
      >
        {label}
      </button>
      {showZoomControls && onZoomIn ? (
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoomInDisabled}
          aria-label={zoomInAriaLabel ?? `${ariaLabelPrefix} zoom in`}
          style={stepButtonStyle}
        >
          +
        </button>
      ) : null}
    </div>
  );
}
