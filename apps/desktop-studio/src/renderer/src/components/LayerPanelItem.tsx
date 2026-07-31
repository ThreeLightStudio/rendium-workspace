import type { ILayer } from '@rendium/engine';
import { ChevronDown, ChevronRight, Layers, Type, Volume2, VolumeX } from 'lucide-react';
import type React from 'react';
import { translate } from '../i18n/locale';
import {
  getManifestForLayer,
  getScopeRole,
  getSourceParam,
  getStudioLayerClassName,
  getStudioLayerType,
} from '../utils/canonicalLayer';
import { getLayerColor, getLayerIcon, getLayerLabel } from '../utils/layer';
import { isAudioRuntimeLayer, isRenderableRuntimeLayer } from '../utils/runtimeLayerGuards';

function getSequenceHeaderIcon(layer: ILayer): React.ReactNode {
  const scopeRole = getScopeRole(layer);

  if (scopeRole === 'main') {
    return <Layers size={16} strokeWidth={2} style={{ minWidth: 16, minHeight: 16 }} />;
  }

  if (scopeRole === 'text') {
    return <Type size={16} strokeWidth={2} style={{ minWidth: 16, minHeight: 16 }} />;
  }

  if (scopeRole === 'overlay' || scopeRole === 'composite') {
    return <Layers size={16} strokeWidth={2} style={{ minWidth: 16, minHeight: 16 }} />;
  }

  return <Layers size={16} strokeWidth={2} style={{ minWidth: 16, minHeight: 16 }} />;
}

interface LayerPanelItemProps {
  layer: ILayer;
  depth: number;
  onRemove: () => void;
  onToggle: (visible: boolean) => void;
  onToggleMute: (muted: boolean) => void;
  onSelect: () => void;
  onToggleSequence?: () => void;
  isDragging?: boolean;
  dropIndicatorPosition?: 'before' | 'after';
  isSelected?: boolean;
  isHovered?: boolean;
  isSequenceCollapsed?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

/**
 * Individual layer item in the flat list.
 * Applies visual hierarchy based on depth and special scope markers.
 */
export function LayerPanelItem({
  layer,
  depth,
  onRemove,
  onToggle,
  onToggleMute,
  onSelect,
  onToggleSequence,
  isDragging,
  dropIndicatorPosition,
  isSelected,
  isHovered,
  isSequenceCollapsed,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: LayerPanelItemProps) {
  const layerType = getStudioLayerType(layer);
  const manifest = getManifestForLayer(layer);
  const isAudioLayer = layerType === 'audio';
  const audioLayer = isAudioRuntimeLayer(layer) ? layer : null;
  const renderableLayer = isRenderableRuntimeLayer(layer) ? layer : null;
  const runtimeMuted = audioLayer?.muted;
  const isAudioMuted =
    typeof runtimeMuted === 'boolean'
      ? runtimeMuted
      : getSourceParam<boolean>(manifest, 'muted') === true;
  const isSequenceStart = layerType === 'scope:start';
  const isSequenceEnd = layerType === 'scope:end';
  const isCollapsedSequenceHeader = isSequenceStart && isSequenceCollapsed === true;
  const indentSize = 16;
  const paddingLeft = depth * indentSize;
  const sequenceRowBackgroundColor = isSelected
    ? 'rgba(0, 191, 255, 0.15)'
    : isHovered
      ? 'rgba(255, 255, 255, 0.08)'
      : isCollapsedSequenceHeader
        ? 'rgba(0, 191, 255, 0.11)'
        : isSequenceStart
          ? 'rgba(0, 191, 255, 0.05)'
          : 'transparent';
  const sequenceRowBorderLeft = isSelected
    ? '3px solid #00BFFF'
    : isHovered
      ? '3px solid rgba(255, 255, 255, 0.3)'
      : isCollapsedSequenceHeader
        ? '4px solid rgba(0, 191, 255, 0.85)'
        : isSequenceStart
          ? '3px solid rgba(0, 191, 255, 0.55)'
          : '3px solid transparent';
  const sequenceRowBoxShadow = isSelected
    ? 'inset 0 0 10px rgba(0, 191, 255, 0.1)'
    : isCollapsedSequenceHeader
      ? 'inset 0 0 0 1px rgba(0, 191, 255, 0.08)'
      : 'none';

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    paddingLeft: `${12 + paddingLeft}px`,
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    backgroundColor: sequenceRowBackgroundColor,
    transition: 'all 0.2s ease',
    position: 'relative',
    width: '100%',
    opacity: isDragging ? 0.4 : 1,
    borderLeft: sequenceRowBorderLeft,
    cursor: 'grab',
    boxSizing: 'border-box',
    boxShadow: sequenceRowBoxShadow,
  };

  const selectionButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    padding: '4px',
    margin: 0,
    textAlign: 'left',
    cursor: 'pointer',
    flexGrow: 1,
    color: 'inherit',
    font: 'inherit',
    outline: 'none',
  };

  const sequenceMarkerStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${paddingLeft}px`,
    top: 0,
    bottom: 0,
    width: '2px',
    backgroundColor: 'rgba(0, 191, 255, 0.3)',
    display: depth > 0 ? 'block' : 'none',
  };

  const sequenceHeaderMarkerStyle: React.CSSProperties = {
    position: 'absolute',
    left: '0',
    top: '4px',
    bottom: '4px',
    width: '4px',
    borderRadius: '999px',
    background: isCollapsedSequenceHeader
      ? 'linear-gradient(180deg, rgba(0, 191, 255, 0.95), rgba(0, 191, 255, 0.36))'
      : 'linear-gradient(180deg, rgba(0, 191, 255, 0.72), rgba(0, 191, 255, 0.22))',
    boxShadow: isCollapsedSequenceHeader
      ? '0 0 0 1px rgba(0, 191, 255, 0.16), 0 0 10px rgba(0, 191, 255, 0.14)'
      : '0 0 0 1px rgba(0, 191, 255, 0.06)',
    pointerEvents: 'none',
  };

  const dropIndicatorStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '2px',
    background:
      'linear-gradient(90deg, rgba(0, 191, 255, 0), rgba(0, 191, 255, 0.95), rgba(0, 191, 255, 0))',
    boxShadow: '0 0 10px rgba(0, 191, 255, 0.5)',
    pointerEvents: 'none',
    zIndex: 2,
  };

  return (
    <li
      className={`layer-panel-item-container layer-panel-item--${getStudioLayerClassName(layer)}`}
      style={containerStyle}
      draggable={!layer.isProjectAnchor && !isSequenceEnd}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {dropIndicatorPosition === 'before' && <div style={{ ...dropIndicatorStyle, top: '-1px' }} />}
      {dropIndicatorPosition === 'after' && (
        <div style={{ ...dropIndicatorStyle, bottom: '-1px' }} />
      )}

      {isSequenceStart && (
        <div className="layer-panel-scope-header-marker" style={sequenceHeaderMarkerStyle} />
      )}

      {/* Scope connection line */}
      {depth > 0 && <div className="layer-panel-scope-marker" style={sequenceMarkerStyle} />}

      {/* Toggle Visibility Button (Independent) */}
      {isSequenceStart && (
        <button
          type="button"
          className="layer-panel-item-scope-toggle"
          title={
            isSequenceCollapsed
              ? translate('layer.expandSequence')
              : translate('layer.collapseSequence')
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggleSequence?.();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#00BFFF',
            fontSize: '14px',
            width: '24px',
            marginRight: '4px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isSequenceCollapsed ? 0.95 : 0.8,
          }}
        >
          {isSequenceCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      )}
      <button
        type="button"
        className="layer-panel-item-toggle"
        title={
          isAudioLayer
            ? isAudioMuted
              ? translate('audio.unmute')
              : translate('audio.mute')
            : translate('layer.toggleVisibility')
        }
        onClick={(e) => {
          e.stopPropagation();
          if (isAudioLayer) {
            onToggleMute(!isAudioMuted);
            return;
          }

          if (renderableLayer) {
            onToggle(!renderableLayer.visible);
          }
        }}
        style={{
          background: 'none',
          border: 'none',
          color: isAudioLayer
            ? isAudioMuted
              ? '#666'
              : '#4CAF50'
            : renderableLayer
              ? renderableLayer.visible
                ? '#00BFFF'
                : '#666'
              : '#444',
          fontSize: '14px',
          width: '24px',
          marginRight: '8px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isAudioLayer ? (
          isAudioMuted ? (
            <VolumeX size={15} strokeWidth={2.25} aria-hidden="true" />
          ) : (
            <Volume2 size={15} strokeWidth={2.25} aria-hidden="true" />
          )
        ) : renderableLayer ? (
          renderableLayer.visible ? (
            '👁'
          ) : (
            '👁‍🗨'
          )
        ) : (
          '—'
        )}
      </button>

      {/* Main Selection Area (Primary Button) */}
      <button
        type="button"
        className="layer-panel-item-select"
        onClick={onSelect}
        style={selectionButtonStyle}
      >
        <span
          className="layer-panel-item-icon"
          style={{ marginRight: '10px', display: 'flex', alignItems: 'center' }}
        >
          {isSequenceStart
            ? getSequenceHeaderIcon(layer)
            : getLayerIcon(layerType, getLayerColor(layer), 16)}
        </span>

        <div className="layer-panel-item-info" style={{ flexGrow: 1 }}>
          <div
            className="layer-panel-item-name"
            style={{
              fontWeight: 600,
              color: isSequenceStart ? '#00BFFF' : '#EEE',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isSequenceStart
              ? getLayerLabel(layer) || translate('layer.sequence')
              : getLayerLabel(layer)}
          </div>
          <div
            className="layer-panel-item-meta"
            style={{
              fontSize: '10px',
              color: '#888',
              marginTop: '1px',
              opacity: 0.8,
            }}
          >
            {isSequenceStart ? null : (
              <>
                {layer.startTime.toFixed(1)}s - {(layer.startTime + layer.duration).toFixed(1)}s (
                {layer.duration.toFixed(1)}s)
              </>
            )}
          </div>
        </div>
      </button>

      {/* Standard Remove button (Independent, if not a project anchor layer) */}
      {!layer.isProjectAnchor && !layer.isSystem && !isSequenceStart && (
        <button
          type="button"
          className="layer-panel-item-delete"
          title={translate('layer.delete')}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#FF4444',
            marginLeft: '8px',
            cursor: 'pointer',
            opacity: 0.6,
          }}
        >
          ✕
        </button>
      )}
    </li>
  );
}
