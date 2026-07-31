import type { IAudioLayer, LayerConfig } from '@rendium/engine';
import { css } from '@styled-system/css';
import { useState } from 'react';
import { useEngineStore } from '../../hooks/useEngineStore';
import { useLocale } from '../../i18n/locale';
import {
  InspectorField,
  InspectorNumberInput,
  InspectorRangeInput,
  InspectorSection,
  InspectorToggleGroup,
  InspectorValue,
} from './ui';

interface AudioControlPanelProps {
  layer: IAudioLayer;
  sourceUrl?: string | null;
  onUpdate: (config: LayerConfig) => void;
  onTransient?: (config: LayerConfig) => void;
  onCommit?: () => void;
  disabled?: boolean;
}

/**
 * AudioControlPanel - Specialized controls for AudioLayer.
 * Handles volume, mute, and precise time constraints (clipping/duration).
 */
export function AudioControlPanel({
  layer,
  sourceUrl,
  onUpdate,
  onTransient,
  onCommit,
  disabled = false,
}: AudioControlPanelProps) {
  const { t } = useLocale();
  const { duration: projectDuration } = useEngineStore();
  const [durationSliderMax, setDurationSliderMax] = useState<number | null>(null);

  const volumeId = `audio-vol-${layer.id}`;
  const startId = `audio-start-${layer.id}`;
  const durationId = `audio-dur-${layer.id}`;
  const clipId = `audio-clip-${layer.id}`;

  const fullAudioDuration = layer.audioBuffer?.duration ?? 0;
  const displayedSourceUrl = sourceUrl ?? layer.sourceUrl ?? null;

  const maxPossibleDuration =
    fullAudioDuration > 0
      ? Math.min(fullAudioDuration - layer.clipOffset, projectDuration - layer.startTime)
      : projectDuration - layer.startTime;
  const effectiveDurationMax = Math.max(0.1, durationSliderMax ?? maxPossibleDuration);

  const handleClipChange = (newClip: number, isTransient = false) => {
    const updates: LayerConfig = { clipOffset: newClip };
    const remainingAudio = fullAudioDuration - newClip;
    if (layer.duration > remainingAudio) {
      updates.duration = Math.max(0.1, remainingAudio);
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
          {fullAudioDuration > 0 ? (
            <div className={css({ fontSize: 'xs', color: 'textMuted', marginTop: '1' })}>
              {t('inspector.sourceLength')}: {fullAudioDuration.toFixed(2)}s
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

        {fullAudioDuration > 0 ? (
          <InspectorField
            label={t('inspector.clipStart')}
            value={<InspectorValue>{layer.clipOffset.toFixed(2)}s</InspectorValue>}
            hint={t('inspector.dragToTrim')}
          >
            <InspectorRangeInput
              id={clipId}
              min="0"
              max={Math.max(0, fullAudioDuration - 0.1)}
              step="0.01"
              disabled={disabled}
              value={layer.clipOffset}
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
                  left: `${(layer.clipOffset / fullAudioDuration) * 100}%`,
                  width: `${(layer.duration / fullAudioDuration) * 100}%`,
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

      <InspectorField
        label={t('inspector.volume')}
        value={<InspectorValue>{Math.round(layer.volume * 100)}%</InspectorValue>}
      >
        <InspectorRangeInput
          id={volumeId}
          min="0"
          max="1"
          step="0.01"
          disabled={disabled}
          value={layer.volume}
          onChange={(e) => {
            const newVolume = Number.parseFloat(e.target.value);
            if (onTransient) {
              onTransient({ volume: newVolume });
            } else {
              onUpdate({ volume: newVolume });
            }
          }}
          onMouseUp={onTransient ? handleSliderCommit : undefined}
        />
      </InspectorField>

      <InspectorField label={t('inspector.muteAudio')}>
        <InspectorToggleGroup
          value={layer.muted ? 'muted' : 'active'}
          onChange={(next) => onUpdate({ muted: next === 'muted' })}
          options={[
            { value: 'active', label: t('inspector.active') },
            { value: 'muted', label: t('inspector.muted') },
          ]}
          tone="danger"
          disabled={disabled}
          className={css({ maxWidth: '180px' })}
        />
      </InspectorField>

      {!displayedSourceUrl ? (
        <div
          className={css({
            marginTop: '1',
            padding: '2.5',
            borderRadius: 'md',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(255, 165, 0, 0.2)',
            backgroundColor: 'rgba(255, 165, 0, 0.08)',
            color: 'warning',
            fontSize: 'xs',
          })}
        >
          {t('inspector.attachAudioSource')}
        </div>
      ) : null}
    </div>
  );
}
