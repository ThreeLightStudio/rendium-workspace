import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../i18n/locale';
import { useAiQuickPromptStore } from '../stores/useAiQuickPromptStore';
import {
  modalCardClass,
  modalOverlayClass,
  primaryButtonClass,
  sectionLabelClass,
  surfaceCardClass,
} from './ui/styles';

interface AiQuickPromptManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  disabled?: boolean;
}

export function AiQuickPromptManagerModal({
  isOpen,
  onClose,
  disabled = false,
}: AiQuickPromptManagerModalProps) {
  const { t } = useLocale();
  const prompts = useAiQuickPromptStore((state) => state.prompts);
  const addPrompt = useAiQuickPromptStore((state) => state.addPrompt);
  const editPrompt = useAiQuickPromptStore((state) => state.editPrompt);
  const removePrompt = useAiQuickPromptStore((state) => state.removePrompt);
  const resetPrompts = useAiQuickPromptStore((state) => state.resetPrompts);

  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedPromptId) ?? null,
    [prompts, selectedPromptId],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextSelected =
      prompts.find((prompt) => prompt.id === selectedPromptId) ?? prompts[0] ?? null;
    if (nextSelected) {
      setSelectedPromptId(nextSelected.id);
      setDraftLabel(nextSelected.label);
      setDraftPrompt(nextSelected.prompt);
      return;
    }

    setSelectedPromptId(null);
    setDraftLabel('');
    setDraftPrompt('');
  }, [isOpen, prompts, selectedPromptId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const canEdit = !disabled;
  const isEditingExisting = selectedPrompt !== null;
  const isDraftValid = draftLabel.trim().length > 0 && draftPrompt.trim().length > 0;
  const isSaveDisabled = disabled || !isDraftValid;

  const openNewPromptDraft = () => {
    setSelectedPromptId(null);
    setDraftLabel('');
    setDraftPrompt('');
    setStatusMessage('');
  };

  const applySave = () => {
    if (disabled || !isDraftValid) {
      return;
    }

    if (isEditingExisting && selectedPrompt) {
      editPrompt(selectedPrompt.id, draftLabel, draftPrompt);
      setStatusMessage(t('ai.quickPromptSaved'));
      return;
    }

    const created = addPrompt(draftLabel, draftPrompt);
    if (created) {
      setSelectedPromptId(created.id);
      setStatusMessage(t('ai.quickPromptCreated'));
    }
  };

  const applyDelete = () => {
    if (disabled || !selectedPrompt) {
      return;
    }

    removePrompt(selectedPrompt.id);
    setStatusMessage(t('ai.quickPromptDeleted'));
  };

  const applyReset = () => {
    if (disabled) {
      return;
    }

    resetPrompts();
    setSelectedPromptId(null);
    setDraftLabel('');
    setDraftPrompt('');
    setStatusMessage(t('ai.quickPromptReset'));
  };

  return createPortal(
    <div className={modalOverlayClass} role="presentation" onMouseDown={onClose}>
      <dialog
        open
        className={modalCardClass}
        aria-labelledby="ai-quick-prompt-manager-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          margin: 0,
          transform: 'translate(-50%, -50%)',
          width: 'min(980px, calc(100vw - 48px))',
          maxHeight: 'min(88vh, 860px)',
          background: 'linear-gradient(145deg, rgba(14, 20, 28, 0.98), rgba(8, 10, 14, 0.98))',
        }}
      >
        <div style={{ padding: '28px 28px 0 28px' }}>
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
                id="ai-quick-prompt-manager-title"
                style={{ margin: 0, fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em' }}
              >
                {t('ai.quickPromptManagerTitle')}
              </h2>
              <p style={{ margin: '8px 0 0 0', color: 'rgba(255,255,255,0.58)', fontSize: '14px' }}>
                {t('ai.quickPromptManagerDescription')}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className={primaryButtonClass({ tone: 'default', size: 'sm' })}
                onClick={applyReset}
                disabled={!canEdit}
              >
                {t('ai.quickPromptResetAction')}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('global.close')}
                className={primaryButtonClass({ tone: 'default', size: 'sm' })}
                style={{ minWidth: '36px', paddingInline: '10px' }}
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 280px) minmax(0, 1fr)',
            gap: '18px',
            padding: '20px 28px 28px 28px',
            overflow: 'auto',
          }}
        >
          <aside className={surfaceCardClass} style={{ padding: '14px', minHeight: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              <span className={sectionLabelClass} style={{ marginBottom: 0 }}>
                {t('ai.quickPromptList')}
              </span>
              <button
                type="button"
                className={primaryButtonClass({ tone: 'accent', size: 'sm' })}
                onClick={openNewPromptDraft}
                disabled={!canEdit}
              >
                {t('ai.quickPromptNew')}
              </button>
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
              {prompts.map((prompt) => {
                const active = prompt.id === selectedPromptId;
                return (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => {
                      setSelectedPromptId(prompt.id);
                      setDraftLabel(prompt.label);
                      setDraftPrompt(prompt.prompt);
                      setStatusMessage('');
                    }}
                    disabled={!canEdit}
                    style={{
                      width: '100%',
                      padding: '12px 12px 11px',
                      borderRadius: '14px',
                      border: active
                        ? '1px solid rgba(0, 209, 255, 0.6)'
                        : '1px solid rgba(255,255,255,0.08)',
                      background: active ? 'rgba(0, 209, 255, 0.12)' : 'rgba(255,255,255,0.03)',
                      color: '#f8fbff',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                      {prompt.label}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        lineHeight: 1.45,
                        color: 'rgba(223, 248, 255, 0.68)',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {prompt.prompt}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={surfaceCardClass} style={{ padding: '18px', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div className={sectionLabelClass}>{t('ai.quickPromptEditor')}</div>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 800 }}>
                  {isEditingExisting
                    ? t('ai.quickPromptEditTitle')
                    : t('ai.quickPromptCreateTitle')}
                </h3>
              </div>

              {isEditingExisting ? (
                <button
                  type="button"
                  className={primaryButtonClass({ tone: 'danger', size: 'sm' })}
                  onClick={applyDelete}
                  disabled={!canEdit}
                >
                  {t('ai.quickPromptDeleteAction')}
                </button>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: '14px', marginTop: '18px' }}>
              <div>
                <label className={sectionLabelClass} htmlFor="ai-quick-prompt-label">
                  {t('ai.quickPromptLabel')}
                </label>
                <input
                  id="ai-quick-prompt-label"
                  type="text"
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  disabled={!canEdit}
                  placeholder={t('ai.quickPromptLabelPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#f8fbff',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label className={sectionLabelClass} htmlFor="ai-quick-prompt-prompt">
                  {t('ai.quickPromptPrompt')}
                </label>
                <textarea
                  id="ai-quick-prompt-prompt"
                  value={draftPrompt}
                  onChange={(event) => setDraftPrompt(event.target.value)}
                  disabled={!canEdit}
                  rows={11}
                  placeholder={t('ai.quickPromptPromptPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#f8fbff',
                    resize: 'vertical',
                    outline: 'none',
                    lineHeight: 1.55,
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.58)', fontSize: '13px' }}>
                  {t('ai.quickPromptWarning')}
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {statusMessage ? (
                    <span style={{ color: '#7fd3ff', fontSize: '13px' }}>{statusMessage}</span>
                  ) : null}
                  <button
                    type="button"
                    className={primaryButtonClass({ tone: 'accent', size: 'md' })}
                    onClick={applySave}
                    disabled={isSaveDisabled}
                  >
                    {isEditingExisting
                      ? t('ai.quickPromptSaveAction')
                      : t('ai.quickPromptCreateAction')}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
