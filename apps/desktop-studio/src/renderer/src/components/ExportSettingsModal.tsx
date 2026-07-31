import { useState } from 'react';
import { useLocale } from '../i18n/locale';
import {
  DEFAULT_EXPORT_SETTINGS,
  type ExportContainerFormat,
  type ExportFrameRate,
  type ExportResolutionPreset,
  formatBitrate,
  getExportFormatOptions,
  getExportResolutionOptions,
  resolveExportProfile,
} from '../utils/exportSettings';

interface ExportSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (settings: {
    format: ExportContainerFormat;
    resolutionPreset: ExportResolutionPreset;
    fps: ExportFrameRate;
  }) => void;
}

export function ExportSettingsModal({ isOpen, onClose, onStart }: ExportSettingsModalProps) {
  const { t } = useLocale();
  const [selectedFormat, setSelectedFormat] = useState<ExportContainerFormat>(
    DEFAULT_EXPORT_SETTINGS.format,
  );
  const [selectedResolution, setSelectedResolution] = useState<ExportResolutionPreset>(
    DEFAULT_EXPORT_SETTINGS.resolutionPreset,
  );
  const [selectedFps, setSelectedFps] = useState<ExportFrameRate>(DEFAULT_EXPORT_SETTINGS.fps);

  if (!isOpen) return null;

  const selectedProfile = resolveExportProfile({
    format: selectedFormat,
    resolutionPreset: selectedResolution,
    fps: selectedFps,
  });

  const resolutionOptions = getExportResolutionOptions();
  const formatOptions = getExportFormatOptions();

  return (
    <div
      className="export-settings-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <div
        className="export-settings-content"
        style={{
          width: '560px',
          background: 'linear-gradient(145deg, rgba(24,24,30,0.92), rgba(10,10,14,0.96))',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
          color: '#FFF',
          maxHeight: 'min(90vh, 860px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '32px 32px 0 32px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'start',
              gap: '16px',
            }}
          >
            <div>
              <h2
                style={{ margin: 0, fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em' }}
              >
                {t('export.title')}
              </h2>
              <p style={{ margin: '8px 0 0 0', color: 'rgba(255,255,255,0.58)', fontSize: '14px' }}>
                {t('export.defaultDescription')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('export.closeSettings')}
              style={{
                border: 'none',
                background: 'rgba(255,255,255,0.06)',
                color: '#FFF',
                width: '36px',
                height: '36px',
                borderRadius: '999px',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '20px',
            marginTop: '28px',
            padding: '0 32px 32px 32px',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          <section>
            <div
              style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginBottom: '10px' }}
            >
              {t('export.format')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {formatOptions.map((option) => {
                const active = option.format === selectedFormat;
                const isDisabled = option.disabled === true;
                return (
                  <button
                    key={option.format}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setSelectedFormat(option.format)}
                    style={{
                      padding: '15px 14px',
                      borderRadius: '16px',
                      border: active
                        ? '1px solid rgba(0, 209, 255, 0.85)'
                        : '1px solid rgba(255,255,255,0.08)',
                      background: active
                        ? 'rgba(0, 209, 255, 0.12)'
                        : isDisabled
                          ? 'rgba(255,255,255,0.04)'
                          : 'rgba(255,255,255,0.03)',
                      color: isDisabled ? 'rgba(255,255,255,0.3)' : '#FFF',
                      textAlign: 'left',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '16px', fontWeight: 800 }}>{option.label}</div>
                    <div
                      style={{ fontSize: '12px', marginTop: '6px', color: 'rgba(255,255,255,0.5)' }}
                    >
                      {option.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div
              style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginBottom: '10px' }}
            >
              {t('export.resolution')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              {resolutionOptions.map((option) => {
                const active = option.resolutionPreset === selectedResolution;
                const isDisabled = option.disabled === true;
                return (
                  <button
                    key={option.resolutionPreset}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setSelectedResolution(option.resolutionPreset)}
                    style={{
                      padding: '16px',
                      borderRadius: '16px',
                      border: active
                        ? '1px solid rgba(0, 209, 255, 0.85)'
                        : '1px solid rgba(255,255,255,0.08)',
                      background: active
                        ? 'rgba(0, 209, 255, 0.12)'
                        : isDisabled
                          ? 'rgba(255,255,255,0.04)'
                          : 'rgba(255,255,255,0.03)',
                      color: isDisabled ? 'rgba(255,255,255,0.3)' : '#FFF',
                      textAlign: 'left',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '18px', fontWeight: 800 }}>{option.label}</div>
                    <div
                      style={{
                        fontSize: '12px',
                        marginTop: '6px',
                        color: 'rgba(255,255,255,0.55)',
                      }}
                    >
                      {option.width} × {option.height}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        marginTop: '4px',
                        color: 'rgba(255,255,255,0.45)',
                      }}
                    >
                      {isDisabled ? t('export.followupReview') : option.recommended}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div
              style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginBottom: '10px' }}
            >
              {t('export.frameRate')}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {([24, 30] as const).map((fps) => {
                const active = fps === selectedFps;
                return (
                  <button
                    key={fps}
                    type="button"
                    onClick={() => setSelectedFps(fps)}
                    style={{
                      flex: 1,
                      padding: '14px 16px',
                      borderRadius: '14px',
                      border: active
                        ? '1px solid rgba(0, 209, 255, 0.85)'
                        : '1px solid rgba(255,255,255,0.08)',
                      background: active ? 'rgba(0, 209, 255, 0.12)' : 'rgba(255,255,255,0.03)',
                      color: '#FFF',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {fps}fps
                  </button>
                );
              })}
            </div>
            <div
              style={{
                marginTop: '10px',
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '12px',
                lineHeight: 1.55,
              }}
            >
              <div style={{ fontWeight: 700, color: '#FFF', marginBottom: '4px' }}>
                {t('export.whenToUse')}
              </div>
              <div>{t('export.cinemaQuality')}</div>
              <div>{t('export.standardQuality')}</div>
            </div>
          </section>

          <section
            style={{
              padding: '16px',
              borderRadius: '16px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px',
                marginBottom: '10px',
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t('export.presetSummary')}</span>
              <span style={{ fontWeight: 700 }}>
                {selectedProfile.format.toUpperCase()} / {selectedProfile.label} /{' '}
                {selectedProfile.fps}fps
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gap: '6px',
                fontSize: '13px',
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              <div>
                Format:{' '}
                <strong style={{ color: '#FFF' }}>{selectedProfile.format.toUpperCase()}</strong>
              </div>
              <div>
                Output size:{' '}
                <strong style={{ color: '#FFF' }}>
                  {selectedProfile.width} × {selectedProfile.height}
                </strong>
              </div>
              <div>
                Bitrate:{' '}
                <strong style={{ color: '#FFF' }}>
                  {formatBitrate(selectedProfile.bitrate)} (auto)
                </strong>
              </div>
              <div>
                Audio: <strong style={{ color: '#FFF' }}>{t('export.audioIncluded')}</strong>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)' }}>{t('export.followupReview')}</div>
            </div>
          </section>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: 'transparent',
                color: '#FFF',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('global.cancel')}
            </button>
            <button
              type="button"
              onClick={() =>
                onStart({
                  format: selectedFormat,
                  resolutionPreset: selectedResolution,
                  fps: selectedFps,
                })
              }
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(90deg, #00bfff, #7fffd4)',
                color: '#000',
                fontSize: '14px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {t('editor.exportVideo')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
