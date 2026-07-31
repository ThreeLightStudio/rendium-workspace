import { INTENT_TYPES } from '@rendium/engine';
import type React from 'react';
import {
  normalizeLayerManifestTransform,
  normalizeTransformIntentFields,
} from '../ai/aiTransformUtils';
import { translate } from '../i18n/locale';
import type { AiAssistantAction } from '../services/AiService';
import { useAiChatStore } from '../stores/useAiChatStore';
import { formatTimecode } from '../utils/timecode';

function formatActionLabel(type: string): string {
  switch (type) {
    case INTENT_TYPES.ADD_LAYER:
      return translate('layer.addLayer');
    case INTENT_TYPES.UPDATE_LAYER_PROPS:
      return translate('editor.properties');
    case INTENT_TYPES.UPDATE_TRANSFORM:
      return translate('editor.advanced');
    case INTENT_TYPES.TOGGLE_VISIBILITY:
      return translate('layer.toggleVisibility');
    case INTENT_TYPES.REORDER_LAYER:
      return translate('editor.layerOverview');
    case INTENT_TYPES.REMOVE_LAYER:
      return translate('layer.delete');
    case 'SEEK_TIMELINE':
      return translate('timeline.jumpToTime');
    case 'RUN_WORKFLOW':
      return translate('ai.workflowPlanTitle');
    default:
      return type;
  }
}

function describeLayerType(type: string): string {
  switch (type) {
    case 'text':
      return translate('inspector.textContent');
    case 'image':
      return translate('editor.image');
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'spectrum':
      return translate('inspector.linkedAudio');
    case 'audio-visualizer':
      return 'audio visualizer';
    case 'scope:start':
      return translate('layer.sequence');
    case 'scope:end':
      return translate('layer.sequence');
    default:
      return type;
  }
}

function summarizeAction(action: AiAssistantAction): { title: string; details: string[] } {
  switch (action.type) {
    case INTENT_TYPES.ADD_LAYER: {
      const manifest = action.manifest;
      const layerType =
        manifest.kind === 'audio'
          ? 'audio'
          : manifest.source?.provider === 'text'
            ? 'text'
            : manifest.source?.provider === 'raster'
              ? 'image'
              : manifest.source?.provider === 'generated-visual'
                ? 'spectrum'
                : (manifest.source?.provider ?? manifest.kind ?? 'layer');
      const details: string[] = [];
      const params = isPlainObject(manifest.source?.params) ? manifest.source.params : null;
      const text = typeof params?.text === 'string' ? params.text.trim() : '';
      const transform = normalizeLayerManifestTransform(action.manifest);

      if (text.length > 0) {
        details.push(`내용: "${text}"`);
      }

      if (transform) {
        details.push(`위치: ${formatPoint(transform.position)}`);
        if (transform.scale.x !== 1 || transform.scale.y !== 1) {
          details.push(`크기: ${formatPoint(transform.scale)}`);
        }
        if (transform.rotation !== 0) {
          details.push(`회전: ${formatNumber(transform.rotation)}°`);
        }
      }

      return {
        title: `${describeLayerType(layerType)} ${translate('layer.addLayer')}`,
        details: details.length > 0 ? details : [translate('layer.addAllowed')],
      };
    }

    case INTENT_TYPES.UPDATE_LAYER_PROPS: {
      const patch = isPlainObject(action.patch) ? action.patch : {};
      const changedKeys = Object.keys(patch);
      return {
        title: translate('editor.properties'),
        details: [
          changedKeys.length > 0 ? `변경 항목: ${changedKeys.join(', ')}` : '변경 항목 없음',
        ],
      };
    }

    case INTENT_TYPES.UPDATE_TRANSFORM: {
      const transform = normalizeTransformIntentFields(action);
      const details: string[] = [];
      if (transform?.position) {
        details.push(`위치: ${formatPoint(transform.position)}`);
      }
      if (transform?.scale) {
        details.push(`크기: ${formatPoint(transform.scale)}`);
      }
      if (typeof transform?.rotation === 'number') {
        details.push(`회전: ${formatNumber(transform.rotation)}°`);
      }

      return {
        title: translate('editor.advanced'),
        details: details.length > 0 ? details : ['변형 값 없음'],
      };
    }

    case INTENT_TYPES.TOGGLE_VISIBILITY:
      return {
        title: action.visible ? translate('layer.visible') : translate('layer.hidden'),
        details: [`대상: ${action.layerId}`],
      };

    case INTENT_TYPES.REORDER_LAYER:
      return {
        title: translate('editor.layerOverview'),
        details: [`대상: ${action.layerId}`, `이동 위치: ${action.toIndex + 1}번째`],
      };

    case INTENT_TYPES.REMOVE_LAYER:
      return {
        title: translate('layer.delete'),
        details: [`대상: ${action.layerId}`],
      };

    case 'SEEK_TIMELINE':
      return {
        title: translate('timeline.jumpToTime'),
        details: [`목표 시점: ${formatTimecode(action.timeSeconds)}`],
      };

    case 'RUN_WORKFLOW':
      return {
        title: translate('ai.workflowPlanTitle'),
        details: [
          `Workflow: ${action.workflowId}`,
          `오디오 자산: ${action.assetBindings.audio ?? '-'}`,
          `배경 자산: ${action.assetBindings.image ?? '-'}`,
          action.fieldValues?.titleText
            ? `제목: ${action.fieldValues.titleText}`
            : translate('ai.workflowNoTitle'),
        ],
      };

    default:
      return {
        title: formatActionLabel('unknown'),
        details: [],
      };
  }
}

export function AiActionPreview() {
  const pendingExecution = useAiChatStore((state) => state.pendingExecution);
  const autoApplyEdits = useAiChatStore((state) => state.autoApplyEdits);
  const setAutoApplyEdits = useAiChatStore((state) => state.setAutoApplyEdits);
  const applyPendingExecution = useAiChatStore((state) => state.applyPendingExecution);
  const cancelPendingExecution = useAiChatStore((state) => state.cancelPendingExecution);

  if (!pendingExecution) {
    return null;
  }

  const isExecuting = pendingExecution.status === 'executing';
  const hasError = pendingExecution.status === 'error';
  const hasSuccess = pendingExecution.status === 'success';

  return (
    <div
      className="ai-action-preview"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid rgba(0,191,255,0.16)',
        background: 'linear-gradient(180deg, rgba(8,14,20,0.94), rgba(6,8,12,0.94))',
        borderRadius: '12px',
        padding: '14px',
        marginTop: '0',
        overflow: 'visible',
        boxShadow: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flex: '0 0 auto',
        }}
      >
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#dff6ff' }}>
            {translate('ai.planTitle')}
          </div>
          <div style={{ fontSize: '11px', color: '#8da8b7', marginTop: '2px' }}>
            {translate('ai.planDescription')}
          </div>
        </div>
        <span
          style={{
            fontSize: '10px',
            padding: '4px 8px',
            borderRadius: '999px',
            background: hasError
              ? 'rgba(255,77,77,0.16)'
              : hasSuccess
                ? 'rgba(76,175,80,0.16)'
                : isExecuting
                  ? 'rgba(0,191,255,0.16)'
                  : 'rgba(255,255,255,0.08)',
            color: hasError ? '#ff9b9b' : hasSuccess ? '#95dea0' : '#7fd3ff',
          }}
        >
          {hasError
            ? translate('ai.failed')
            : hasSuccess
              ? translate('ai.success')
              : isExecuting
                ? translate('ai.executing')
                : translate('ai.pending')}
        </span>
      </div>

      <div
        className="ai-action-preview__body"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'visible',
          marginTop: '12px',
        }}
      >
        <div
          style={{
            padding: '12px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#d7e5ee',
            fontSize: '12px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {pendingExecution.reply || translate('ai.planReadyLabel')}
        </div>

        <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
          {pendingExecution.actions.map((action, index) => {
            const summary = summarizeAction(action);

            return (
              <div
                key={`${action.type}-${index}`}
                style={{
                  borderRadius: '10px',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: '11px', color: '#9fc6d8', fontWeight: 700 }}>
                  {summary.title}
                </div>
                <div
                  style={{
                    marginTop: '6px',
                    fontSize: '11px',
                    color: '#b9c8d1',
                    lineHeight: 1.5,
                  }}
                >
                  {summary.details.map((detail) => (
                    <div key={detail}>{detail}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {hasError ? (
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#ff9b9b' }}>
            {pendingExecution.error}
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          flex: '0 0 auto',
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            color: '#a8bac5',
          }}
        >
          <input
            type="checkbox"
            checked={autoApplyEdits}
            onChange={(event) => setAutoApplyEdits(event.target.checked)}
          />
          {translate('editor.autoApply')}
        </label>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="ai-action-preview__button"
            onClick={() => void applyPendingExecution()}
            disabled={isExecuting || hasSuccess}
            style={buttonStyle('#00BFFF', true, isExecuting || hasSuccess)}
          >
            {isExecuting
              ? `${translate('ai.executing')}...`
              : hasSuccess
                ? translate('ai.success')
                : translate('ai.planReadyLabel')}
          </button>

          <button
            type="button"
            className="ai-action-preview__button"
            onClick={cancelPendingExecution}
            disabled={isExecuting}
            style={buttonStyle('#666', false, isExecuting)}
          >
            {translate('global.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function buttonStyle(accent: string, emphasized: boolean, disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: '10px',
    border: `1px solid ${emphasized ? `${accent}66` : 'rgba(255,255,255,0.08)'}`,
    background: emphasized ? `${accent}18` : 'rgba(255,255,255,0.04)',
    color: disabled ? '#6d7a82' : emphasized ? '#dff6ff' : '#d0d6db',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatPoint(point: { x: number; y: number }): string {
  return `x=${formatNumber(point.x)}, y=${formatNumber(point.y)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(2))}`;
}
