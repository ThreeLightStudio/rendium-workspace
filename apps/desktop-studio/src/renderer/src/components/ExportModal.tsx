import { useState } from 'react';
import { useLocale } from '../i18n/locale';
import { buildExportStatusViewModel } from '../utils/exportStatusViewModel';

interface ExportModalProps {
  isExporting: boolean;
  progress: number;
  status: string;
  error: string | null;
  onCancel: () => void;
  onClose: () => void;
  defaultTechnicalDetailsOpen?: boolean;
}

export function ExportModal({
  isExporting,
  progress,
  status,
  error,
  onCancel,
  onClose,
  defaultTechnicalDetailsOpen = false,
}: ExportModalProps) {
  const { t } = useLocale();
  const [isTechnicalDetailsOpen, setTechnicalDetailsOpen] = useState(defaultTechnicalDetailsOpen);
  if (!isExporting && status === 'idle') return null;

  const statusView = buildExportStatusViewModel({
    isExporting,
    progress,
    status,
    error,
    t,
  });
  const isCompleted = statusView.state === 'completed';
  const isFailed = statusView.state === 'failed';
  const isCancelled = statusView.state === 'cancelled';
  const glowColor =
    statusView.tone === 'error'
      ? '#FF6B6B'
      : statusView.tone === 'success'
        ? '#2DD4BF'
        : statusView.tone === 'warning'
          ? '#F59E0B'
          : '#7DD3FC';

  return (
    <div
      className="export-modal-overlay"
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
        className="export-modal-content"
        style={{
          width: '480px',
          background: 'linear-gradient(145deg, rgba(30,30,35,0.7), rgba(15,15,20,0.8))',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
          textAlign: 'center',
          position: 'relative',
          maxHeight: 'min(90vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Progress Glow Effect */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '200px',
            height: '200px',
            background: glowColor,
            filter: 'blur(100px)',
            opacity: 0.15,
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />

        <div style={{ padding: '40px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          <h2
            style={{
              fontSize: '24px',
              fontWeight: 800,
              margin: '0 0 8px 0',
              color: '#FFF',
              letterSpacing: '-0.02em',
            }}
          >
            {statusView.userMessage}
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.5)',
              margin: '0 0 32px 0',
            }}
          >
            {statusView.assistiveMessage}
          </p>

          {/* Progress Section */}
          <div style={{ marginBottom: '32px' }}>
            <div
              className="progress-container"
              style={{
                height: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '16px',
                position: 'relative',
              }}
            >
              <div
                className="progress-fill"
                style={{
                  width: `${progress * 100}%`,
                  height: '100%',
                  background: isFailed ? '#FF6B6B' : 'linear-gradient(90deg, #38BDF8, #2DD4BF)',
                  borderRadius: '4px',
                  transition: 'width 0.1s linear',
                  boxShadow:
                    !isFailed && progress > 0 ? '0 0 12px rgba(45, 212, 191, 0.35)' : 'none',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: 'rgba(255, 255, 255, 0.4)',
              }}
            >
              <span>{statusView.userMessage}</span>
              <span style={{ color: '#FFF', fontWeight: 'bold' }}>{statusView.progressLabel}</span>
            </div>
          </div>

          {statusView.canShowDetails && (
            <div
              style={{
                marginBottom: '24px',
                textAlign: 'left',
              }}
            >
              <button
                type="button"
                onClick={() => setTechnicalDetailsOpen((value) => !value)}
                aria-expanded={isTechnicalDetailsOpen}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  color: 'rgba(255, 255, 255, 0.72)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{t('export.technicalDetails')}</span>
                <span aria-hidden="true">{isTechnicalDetailsOpen ? '-' : '+'}</span>
              </button>
              {isTechnicalDetailsOpen ? (
                <pre
                  style={{
                    margin: '8px 0 0',
                    padding: '12px',
                    backgroundColor: 'rgba(0, 0, 0, 0.24)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    color: isFailed ? '#FF9C9C' : 'rgba(255, 255, 255, 0.62)',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    fontFamily: '"Menlo", "Lucida Console", monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {statusView.technicalMessage}
                </pre>
              ) : null}
            </div>
          )}

          {isFailed && (
            <div
              style={{
                padding: '12px',
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                border: '1px solid rgba(255, 107, 107, 0.2)',
                borderRadius: '12px',
                color: '#FFB4B4',
                fontSize: '13px',
                marginBottom: '24px',
                textAlign: 'left',
              }}
            >
              {t('export.troubleshootingHint')}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            {!isCompleted && !isFailed && !isCancelled && (
              <button
                type="button"
                className="btn-cancel-export"
                onClick={onCancel}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'transparent',
                  color: '#FFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {t('export.cancel')}
              </button>
            )}
            {(isCompleted || isFailed || isCancelled) && (
              <button
                type="button"
                className="btn-close-export"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: '#FFF',
                  color: '#000',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {t('export.close')}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
				@keyframes fadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				.export-modal-content {
					animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
				}
				@keyframes slideUp {
					from { transform: translateY(20px); opacity: 0; }
					to { transform: translateY(0); opacity: 1; }
				}
				.btn-cancel-export:hover {
					background-color: rgba(255, 255, 255, 0.05) !important;
				}
				.btn-close-export:hover {
					opacity: 0.9 !important;
				}
			`}</style>
    </div>
  );
}
