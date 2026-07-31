import { type LayerConfig, SPECTRUM_CONFIG } from '@rendium/engine';
import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/locale';
import type { AudioLayerInfo } from '../stores/studioStore';
import { buildLinkedAudioTimingPatch } from '../utils/audioLinking';

interface SpectrumControlPanelProps {
  onUpdate: (config: Partial<LayerConfig>) => void;
  audioLayers: AudioLayerInfo[];
  layer?: SpectrumControlValue;
  disabled?: boolean;
}

export interface SpectrumControlValue {
  position?: { x: number; y: number };
  scale?: { x: number; y: number };
  bandCount?: number;
  barGap?: number;
  minHeight?: number;
  maxHeight?: number;
  gain?: number;
  smoothing?: number;
  color?: [number, number, number, number];
  linkedAudioId?: string | null;
  minFrequency?: number;
  maxFrequency?: number;
  spectralTilt?: number;
  gradientMode?: boolean;
  colorLow?: [number, number, number, number];
  colorHigh?: [number, number, number, number];
}

function colorToHex(color: [number, number, number, number]): string {
  const toHex = (channel: number) =>
    Math.round(Math.min(1, Math.max(0, channel)) * 255)
      .toString(16)
      .padStart(2, '0');

  const [r, g, b] = color;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const DEFAULT_COLOR_HEX = colorToHex(SPECTRUM_CONFIG.DEFAULT_COLOR);
const DEFAULT_COLOR_LOW_HEX = colorToHex(SPECTRUM_CONFIG.DEFAULT_COLOR_LOW);
const DEFAULT_COLOR_HIGH_HEX = colorToHex(SPECTRUM_CONFIG.DEFAULT_COLOR_HIGH);

export function SpectrumControlPanel({
  onUpdate,
  audioLayers,
  layer,
  disabled = false,
}: SpectrumControlPanelProps) {
  const { t } = useLocale();
  const [barCount, setBarCount] = useState<number>(SPECTRUM_CONFIG.DEFAULT_BAND_COUNT);
  const [barGap, setBarGap] = useState<number>(SPECTRUM_CONFIG.DEFAULT_BAR_GAP);
  const [smoothing, setSmoothing] = useState<number>(SPECTRUM_CONFIG.DEFAULT_SMOOTHING);
  const [gain, setGain] = useState<number>(SPECTRUM_CONFIG.DEFAULT_GAIN);
  const [maxHeight, setMaxHeight] = useState<number>(SPECTRUM_CONFIG.DEFAULT_MAX_HEIGHT);
  const [posX, setPosX] = useState<number>(SPECTRUM_CONFIG.DEFAULT_POSITION.x);
  const [posY, setPosY] = useState<number>(SPECTRUM_CONFIG.DEFAULT_POSITION.y);
  const [width, setWidth] = useState<number>(SPECTRUM_CONFIG.DEFAULT_SCALE.x);
  const [scaleY, setScaleY] = useState<number>(SPECTRUM_CONFIG.DEFAULT_SCALE.y);
  const [colorHex, setColorHex] = useState(DEFAULT_COLOR_HEX);
  const [linkedAudioId, setLinkedAudioId] = useState<string>('');
  const [minFreq, setMinFreq] = useState<number>(SPECTRUM_CONFIG.DEFAULT_MIN_FREQUENCY);
  const [maxFreq, setMaxFreq] = useState<number>(SPECTRUM_CONFIG.DEFAULT_MAX_FREQUENCY);
  const [spectralTilt, setSpectralTilt] = useState<number>(SPECTRUM_CONFIG.DEFAULT_SPECTRAL_TILT);
  const [gradientMode, setGradientMode] = useState<boolean>(SPECTRUM_CONFIG.DEFAULT_GRADIENT_MODE);
  const [colorLowHex, setColorLowHex] = useState(DEFAULT_COLOR_LOW_HEX);
  const [colorHighHex, setColorHighHex] = useState(DEFAULT_COLOR_HIGH_HEX);
  const linkedAudio = audioLayers.find((audio) => audio.id === linkedAudioId);

  // Sync local state with the engine layer config when the layer prop changes
  useEffect(() => {
    if (layer) {
      setBarCount(layer.bandCount ?? SPECTRUM_CONFIG.DEFAULT_BAND_COUNT);
      setBarGap(layer.barGap ?? SPECTRUM_CONFIG.DEFAULT_BAR_GAP);
      setSmoothing(layer.smoothing ?? SPECTRUM_CONFIG.DEFAULT_SMOOTHING);
      setGain(layer.gain ?? SPECTRUM_CONFIG.DEFAULT_GAIN);
      setMaxHeight(layer.maxHeight ?? SPECTRUM_CONFIG.DEFAULT_MAX_HEIGHT);

      const posX = layer.position?.x ?? SPECTRUM_CONFIG.DEFAULT_POSITION.x;
      const posY = layer.position?.y ?? SPECTRUM_CONFIG.DEFAULT_POSITION.y;
      const scaleX = layer.scale?.x ?? SPECTRUM_CONFIG.DEFAULT_SCALE.x;
      const scaleY = layer.scale?.y ?? SPECTRUM_CONFIG.DEFAULT_SCALE.y;

      setPosX(posX);
      setPosY(posY);
      setWidth(scaleX);
      setScaleY(scaleY);
      setLinkedAudioId(layer.linkedAudioId ?? '');
      setMinFreq(layer.minFrequency ?? SPECTRUM_CONFIG.DEFAULT_MIN_FREQUENCY);
      setMaxFreq(layer.maxFrequency ?? SPECTRUM_CONFIG.DEFAULT_MAX_FREQUENCY);
      setSpectralTilt(layer.spectralTilt ?? SPECTRUM_CONFIG.DEFAULT_SPECTRAL_TILT);
      if (layer.color) {
        setColorHex(colorToHex(layer.color));
      }

      setGradientMode(layer.gradientMode ?? SPECTRUM_CONFIG.DEFAULT_GRADIENT_MODE);
      if (layer.colorLow) {
        setColorLowHex(colorToHex(layer.colorLow));
      }
      if (layer.colorHigh) {
        setColorHighHex(colorToHex(layer.colorHigh));
      }
    }
  }, [layer]);

  // Initial load is handled in useEngine, but we will send updates immediately on UI change.
  const hexToRgba = (hex: string): [number, number, number, number] => {
    const cleanHex = hex.replace('#', '');
    const r = Number.parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = Number.parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = Number.parseInt(cleanHex.substring(4, 6), 16) / 255;
    return [r, g, b, 1.0];
  };

  const handleChange = (newValues: {
    barCount?: number;
    barGap?: number;
    smoothing?: number;
    gain?: number;
    colorHex?: string;
    maxHeight?: number;
    posX?: number;
    posY?: number;
    width?: number;
    scaleY?: number;
    minFreq?: number;
    maxFreq?: number;
    spectralTilt?: number;
    gradientMode?: boolean;
    colorLowHex?: string;
    colorHighHex?: string;
  }) => {
    const merged = {
      barCount,
      barGap,
      smoothing,
      gain,
      colorHex,
      maxHeight,
      posX,
      posY,
      width,
      scaleY,
      minFreq,
      maxFreq,
      spectralTilt,
      gradientMode,
      colorLowHex,
      colorHighHex,
      ...newValues,
    };
    onUpdate({
      linkedAudioId: linkedAudioId || null,
      bandCount: merged.barCount,
      barGap: merged.barGap,
      smoothing: merged.smoothing,
      gain: merged.gain,
      maxHeight: merged.maxHeight,
      position: { x: merged.posX, y: merged.posY },
      scale: { x: merged.width, y: merged.scaleY },
      color: hexToRgba(merged.colorHex),
      minFrequency: merged.minFreq,
      maxFrequency: merged.maxFreq,
      spectralTilt: merged.spectralTilt,
      gradientMode: merged.gradientMode,
      colorLow: hexToRgba(merged.colorLowHex),
      colorHigh: hexToRgba(merged.colorHighHex),
    });
  };

  return (
    <div className="spectrum-control-panel">
      {/* Analysis-only link: this selects the audio source to sample from. */}
      <div className="control-group">
        <label htmlFor="input-audio-source">
          <span className="label-text">{t('inspector.linkedAudio')}</span>
        </label>
        <select
          id="input-audio-source"
          className="spectrum-select"
          value={linkedAudioId}
          onChange={(e) => {
            const v = e.target.value;
            const source = audioLayers.find((audio) => audio.id === v);
            setLinkedAudioId(v);
            onUpdate({
              linkedAudioId: v || null,
              ...(v ? buildLinkedAudioTimingPatch(source) : {}),
            });
          }}
          disabled={disabled}
        >
          <option value="">{t('inspector.none')}</option>
          {audioLayers.map((audio) => (
            <option key={audio.id} value={audio.id}>
              {audio.name}
            </option>
          ))}
        </select>
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
          {t('inspector.linkedSourceOnly')}
        </div>
        <button
          type="button"
          onClick={() => onUpdate(buildLinkedAudioTimingPatch(linkedAudio))}
          disabled={disabled || !linkedAudio}
          style={{
            width: '100%',
            marginTop: '8px',
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.14)',
            background: linkedAudio ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
            color: linkedAudio ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.34)',
            fontSize: '12px',
            cursor: disabled || !linkedAudio ? 'default' : 'pointer',
          }}
        >
          {t('inspector.syncLinkedAudioTiming')}
        </button>
        {audioLayers.length === 0 ? (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 165, 0, 0.22)',
              background: 'rgba(255, 165, 0, 0.08)',
              color: '#F5A623',
              fontSize: '11px',
              lineHeight: 1.45,
            }}
          >
            {t('spectrum.noAudioSourceMessage')}
          </div>
        ) : null}
      </div>

      <div className="control-group">
        <label htmlFor="input-bar-count">
          <span className="label-text">{t('inspector.barCount')}</span>
          <span className="value-text">{barCount}</span>
        </label>
        <input
          id="input-bar-count"
          type="range"
          min="10"
          max="256"
          step="1"
          value={barCount}
          onChange={(e) => {
            const v = Number(e.target.value);
            setBarCount(v);
            handleChange({ barCount: v });
          }}
          disabled={disabled}
        />
      </div>
      <div className="control-group">
        <label htmlFor="input-bar-gap">
          <span className="label-text">{t('inspector.barGap')}</span>
          <span className="value-text">{barGap.toFixed(2)}</span>
        </label>
        <input
          id="input-bar-gap"
          type="range"
          min="0.0"
          max="1.0"
          step="0.01"
          value={barGap}
          onChange={(e) => {
            const v = Number(e.target.value);
            setBarGap(v);
            handleChange({ barGap: v });
          }}
          disabled={disabled}
        />
      </div>
      <div className="control-group">
        <label htmlFor="input-smoothing">
          <span className="label-text">{t('inspector.smoothing')}</span>
          <span className="value-text">{smoothing.toFixed(2)}</span>
        </label>
        <input
          id="input-smoothing"
          type="range"
          min="0.0"
          max="0.99"
          step="0.01"
          value={smoothing}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSmoothing(v);
            handleChange({ smoothing: v });
          }}
          disabled={disabled}
        />
      </div>
      <div className="control-group">
        <label htmlFor="input-gain">
          <span className="label-text">{t('inspector.gain')}</span>
          <span className="value-text">{gain.toFixed(1)}x</span>
        </label>
        <input
          id="input-gain"
          type="range"
          min="0.5"
          max="5.0"
          step="0.1"
          value={gain}
          onChange={(e) => {
            const v = Number(e.target.value);
            setGain(v);
            handleChange({ gain: v });
          }}
          disabled={disabled}
        />
      </div>
      <div className="control-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={gradientMode}
            onChange={(e) => {
              const v = e.target.checked;
              setGradientMode(v);
              handleChange({ gradientMode: v });
            }}
            disabled={disabled}
          />
          <span className="label-text">{t('inspector.gradientColorMode')}</span>
        </label>
      </div>

      {!gradientMode ? (
        <div className="control-group">
          <label htmlFor="input-color">
            <span className="label-text">{t('inspector.color')}</span>
          </label>
          <div className="color-picker-wrapper">
            <input
              id="input-color"
              type="color"
              value={colorHex}
              onChange={(e) => {
                const v = e.target.value;
                setColorHex(v);
                handleChange({ colorHex: v });
              }}
              disabled={disabled}
              className="color-input"
            />
            <span className="hex-text">{colorHex.toUpperCase()}</span>
          </div>
        </div>
      ) : (
        <div className="control-group">
          <label htmlFor="input-color-low">
            <span className="label-text">{t('inspector.gradientRange')}</span>
          </label>
          <div
            className="color-picker-row"
            style={{ display: 'flex', gap: '8px', marginTop: '4px' }}
          >
            <div className="color-picker-wrapper" style={{ flex: 1 }}>
              <input
                id="input-color-low"
                type="color"
                value={colorLowHex}
                onChange={(e) => {
                  const v = e.target.value;
                  setColorLowHex(v);
                  handleChange({ colorLowHex: v });
                }}
                disabled={disabled}
                className="color-input"
                title={t('inspector.lowFrequencyColor')}
              />
              <span className="hex-text" style={{ fontSize: '10px' }}>
                {t('inspector.low')}
              </span>
            </div>
            <div className="color-picker-wrapper" style={{ flex: 1 }}>
              <input
                type="color"
                value={colorHighHex}
                onChange={(e) => {
                  const v = e.target.value;
                  setColorHighHex(v);
                  handleChange({ colorHighHex: v });
                }}
                disabled={disabled}
                className="color-input"
                title={t('inspector.highFrequencyColor')}
              />
              <span className="hex-text" style={{ fontSize: '10px' }}>
                {t('inspector.high')}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="control-group">
        <label htmlFor="input-max-height">
          <span className="label-text">{t('inspector.maxHeight')}</span>
          <span className="value-text">{maxHeight.toFixed(2)}</span>
        </label>
        <input
          id="input-max-height"
          type="range"
          min="0.1"
          max="2.0"
          step="0.05"
          value={maxHeight}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMaxHeight(v);
            handleChange({ maxHeight: v });
          }}
          disabled={disabled}
        />
      </div>

      {/* ─── Frequency Clamping ─── */}
      <div className="control-group">
        <label htmlFor="input-min-freq">
          <span className="label-text">{t('inspector.minFrequency')}</span>
          <span className="value-text">{Math.round(minFreq)}Hz</span>
        </label>
        <input
          id="input-min-freq"
          type="range"
          min="20"
          max="2000"
          step="10"
          value={minFreq}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMinFreq(v);
            handleChange({ minFreq: v });
          }}
          disabled={disabled}
        />
      </div>

      <div className="control-group">
        <label htmlFor="input-max-freq">
          <span className="label-text">{t('inspector.maxFrequency')}</span>
          <span className="value-text">{Math.round(maxFreq)}Hz</span>
        </label>
        <input
          id="input-max-freq"
          type="range"
          min="2000"
          max="20000"
          step="100"
          value={maxFreq}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMaxFreq(v);
            handleChange({ maxFreq: v });
          }}
          disabled={disabled}
        />
      </div>

      <div className="control-group">
        <label htmlFor="input-spectral-tilt">
          <span className="label-text">{t('inspector.highFrequencyBoost')}</span>
          <span className="value-text">{spectralTilt.toFixed(2)}x</span>
        </label>
        <input
          id="input-spectral-tilt"
          type="range"
          min="0.0"
          max="2.0"
          step="0.05"
          value={spectralTilt}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSpectralTilt(v);
            handleChange({ spectralTilt: v });
          }}
          disabled={disabled}
        />
      </div>

      <div className="control-group">
        <div
          className="label-text"
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--ev-c-text-2)',
            marginBottom: '4px',
          }}
        >
          {t('inspector.positionPresets')}
        </div>
        <div className="preset-buttons">
          <div className="preset-row">
            <span className="preset-label">{`${t('inspector.axisX')}:`}</span>
            <button
              type="button"
              className={`preset-btn ${posX === 0 ? 'active' : ''}`}
              onClick={() => {
                setPosX(0);
                handleChange({ posX: 0 });
              }}
              disabled={disabled}
            >
              {t('inspector.left')}
            </button>
            <button
              type="button"
              className={`preset-btn ${posX === 960 ? 'active' : ''}`}
              onClick={() => {
                setPosX(960);
                handleChange({ posX: 960 });
              }}
              disabled={disabled}
            >
              {t('inspector.center')}
            </button>
            <button
              type="button"
              className={`preset-btn ${posX === 1920 ? 'active' : ''}`}
              onClick={() => {
                setPosX(1920);
                handleChange({ posX: 1920 });
              }}
              disabled={disabled}
            >
              {t('inspector.right')}
            </button>
          </div>
          <div className="preset-row">
            <span className="preset-label">{`${t('inspector.axisY')}:`}</span>
            <button
              type="button"
              className={`preset-btn ${posY === 0 ? 'active' : ''}`}
              onClick={() => {
                setPosY(0);
                handleChange({ posY: 0, scaleY: 540 });
              }}
              disabled={disabled}
            >
              {t('inspector.top')}
            </button>
            <button
              type="button"
              className={`preset-btn ${posY === 540 ? 'active' : ''}`}
              onClick={() => {
                setPosY(540);
                handleChange({ posY: 540, scaleY: -540 });
              }}
              disabled={disabled}
            >
              {t('inspector.center')}
            </button>
            <button
              type="button"
              className={`preset-btn ${posY === 1080 ? 'active' : ''}`}
              onClick={() => {
                setPosY(1080);
                handleChange({ posY: 1080, scaleY: -540 });
              }}
              disabled={disabled}
            >
              {t('inspector.bottom')}
            </button>
          </div>
        </div>
      </div>
      <div style={{ fontSize: '10px', color: '#555', marginTop: '8px' }}>
        {t('inspector.useTransformSectionBelow')}
      </div>
    </div>
  );
}
