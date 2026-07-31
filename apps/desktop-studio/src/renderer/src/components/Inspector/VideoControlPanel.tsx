import type { ILayer, LayerConfig } from '@rendium/engine';
import { css } from '@styled-system/css';
import { useState } from 'react';
import { useEngineStore } from '../../hooks/useEngineStore';
import { useLocale } from '../../i18n/locale';
import { useProjectAssetsStore } from '../../stores/useProjectAssetsStore';
import {
  InspectorField,
  InspectorNumberInput,
  InspectorRangeInput,
  InspectorSection,
  InspectorValue,
} from './ui';

interface VideoControlPanelProps {
  layer: ILayer & { clipOffset?: number };
  sourceUrl?: string | null;
  onUpdate: (config: LayerConfig) => void;
  onTransient?: (config: LayerConfig) => void;
  onCommit?: () => void;
  disabled?: boolean;
}

/**
 * VideoControlPanel - Specialized controls for Video Layer.
 * Handles precise time constraints (clipping/duration) and timeline position.
 */
export function VideoControlPanel({
  layer,
  sourceUrl,
  onUpdate,
  onTransient,
  onCommit,
  disabled = false,
}: VideoControlPanelProps) {
  const { t } = useLocale();
  const { duration: projectDuration } = useEngineStore();
  const [durationSliderMax, setDurationSliderMax] = useState<number | null>(null);

  const startId = `video-start-${layer.id}`;
  const durationId = `video-dur-${layer.id}`;
  const clipId = `video-clip-${layer.id}`;

  const displayedSourceUrl = sourceUrl ?? null;
  const assets = useProjectAssetsStore((state) => state.assets);
  const asset = assets.find((a) => a.sourceUrl === displayedSourceUrl);
  const fullVideoDuration = asset?.durationSeconds ?? 0;

  const maxPossibleDuration =
    fullVideoDuration > 0
      ? Math.min(fullVideoDuration - (layer.clipOffset ?? 0), projectDuration - layer.startTime)
      : projectDuration - layer.startTime;
  const effectiveDurationMax = Math.max(0.1, durationSliderMax ?? maxPossibleDuration);

  const handleClipChange = (newClip: number, isTransient = false) => {
    const updates: LayerConfig = { clipOffset: newClip };
    const remainingVideo = fullVideoDuration - newClip;
    if (layer.duration > remainingVideo) {
      updates.duration = Math.max(0.1, remainingVideo);
    }

    if (isTransient && onTransient) {
      onTransient(updates);
    } else {
      onUpdate(updates);
    }
  };

  const handleStartChange = (newStart: number, isTransient = false) => {
    const updates: LayerConfig = { startTime: newStart };

    if (isTransient && onTransient) {
      onTransient(updates);
    } else {
      onUpdate(updates);
    }
  };

  const handleSliderCommit = () => {
    if (onCommit) {
      onCommit();
    }
  };

  const beginDurationDrag = () => {
    setDurationSliderMax((current) => current ?? maxPossibleDuration);
  };

  const endDurationDrag = () => {
    handleSliderCommit();
    setDurationSliderMax(null);
  };

  return (
    <div className={css({ display: 'flex', flexDirection: 'column', gap: '4' })}>
      <InspectorSection title={t('inspector.source')}>
        <InspectorField label={t('inspector.sourceUrl')}>
          <div className={css({ fontFamily: 'mono', color: 'accent', wordBreak: 'break-all' })}>
            {displayedSourceUrl || t('inspector.noSourceFile')}
          </div>
          {fullVideoDuration > 0 ? (
            <div className={css({ fontSize: 'xs', color: 'textMuted', marginTop: '1' })}>
              {t('inspector.sourceLength')}: {fullVideoDuration.toFixed(2)}s
            </div>
          ) : null}
        </InspectorField>
      </InspectorSection>

      <InspectorSection title={t('inspector.timeControls')}>
        <InspectorField
          label={t('inspector.startOnTimeline')}
          value={<InspectorValue>{layer.startTime.toFixed(2)}s</InspectorValue>}
        >
          <InspectorNumberInput
            id={startId}
            min="0"
            step="0.01"
            inputMode="decimal"
            disabled={disabled}
            value={layer.startTime}
            onChange={(e) =>
              handleStartChange(
                Number.isFinite(Number.parseFloat(e.target.value))
                  ? Number.parseFloat(e.target.value)
                  : 0,
                true,
              )
            }
            onBlur={onTransient ? handleSliderCommit : undefined}
          />
        </InspectorField>

        {fullVideoDuration > 0 ? (
          <InspectorField
            label={t('inspector.clipStart')}
            value={<InspectorValue>{(layer.clipOffset ?? 0).toFixed(2)}s</InspectorValue>}
            hint={t('inspector.dragToTrim')}
          >
            <InspectorRangeInput
              id={clipId}
              min="0"
              max={Math.max(0, fullVideoDuration - 0.1)}
              step="0.01"
              disabled={disabled}
              value={layer.clipOffset ?? 0}
              onChange={(e) => handleClipChange(Number.parseFloat(e.target.value), true)}
              onMouseUp={onTransient ? handleSliderCommit : undefined}
            />
            <div
              className={css({
                height: '4px',
                backgroundColor: 'panelBorderSoft',
                borderRadius: 'full',
                marginTop: '1',
                position: 'relative',
                overflow: 'hidden',
              })}
            >
              <div
                className={css({
                  position: 'absolute',
                  insetY: 0,
                  left: `${((layer.clipOffset ?? 0) / fullVideoDuration) * 100}%`,
                  width: `${(layer.duration / fullVideoDuration) * 100}%`,
                  backgroundColor: 'accent',
                  opacity: 0.6,
                })}
              />
            </div>
          </InspectorField>
        ) : null}

        <InspectorField
          label={t('inspector.playDuration')}
          value={<InspectorValue>{layer.duration.toFixed(2)}s</InspectorValue>}
          hint={`${t('inspector.maxAllowed')}: ${effectiveDurationMax.toFixed(2)}s`}
        >
          <InspectorRangeInput
            id={durationId}
            min="0.1"
            max={Math.max(layer.duration, effectiveDurationMax)}
            step="0.01"
            disabled={disabled}
            value={layer.duration}
            onChange={(e) => {
              const newDuration = Number.parseFloat(e.target.value);
              if (onTransient) {
                onTransient({ duration: newDuration });
              } else {
                onUpdate({ duration: newDuration });
              }
            }}
            onFocus={beginDurationDrag}
            onPointerDown={beginDurationDrag}
            onPointerUp={endDurationDrag}
            onMouseUp={endDurationDrag}
            onBlur={endDurationDrag}
          />
        </InspectorField>
      </InspectorSection>
    </div>
  );
}
