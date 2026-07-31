import { PROJECT_CONFIG, engineStore, sanitizeProjectName } from '@rendium/engine';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import studioLogo from '../assets/desktop-studio-logo.png';
import { useEngineLoop } from '../hooks/useEngineLoop';
import { useExport } from '../hooks/useExport';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useLocale } from '../i18n/locale';
import { StorageService } from '../services/StorageService';
import { useStudioStore } from '../stores/studioStore';
import { useAiChatStore } from '../stores/useAiChatStore';
import { useProjectAssetsStore } from '../stores/useProjectAssetsStore';
import type { ExportSettings } from '../utils/exportSettings';

import { CanvasPreview } from './CanvasPreview';
import { ExportModal } from './ExportModal';
import { ExportSettingsModal } from './ExportSettingsModal';
import { RightPanel } from './RightPanel';
import { PackedStrandScrubber } from './Timeline/PackedStrandScrubber';
import { LocaleSwitcher } from './ui/LocaleSwitcher';

export function StudioEditor({
  activeProjectId,
}: {
  activeProjectId: string;
}): React.JSX.Element {
  const { t } = useLocale();
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const setSelectedLayerId = useStudioStore((s) => s.selectLayer);
  const timelineExtent = useStudioStore((s) => s.timelineExtent);
  const ensureTimelineExtent = useStudioStore((s) => s.ensureTimelineExtent);
  const clearAiChat = useAiChatStore((state) => state.clearChat);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync the current project name for the input header
  // We don't have project meta in the snapshot natively, so we just read it directly from manifest
  // To keep it updated on every patch, we can use an effect, or just let it be mostly uncontrolled
  const [projectName, setProjectName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    // When the component mounts or snapshot updates, refresh the name
    setProjectName(engineStore.getManifest().projectInfo.name || '');
  }, []);

  useLayoutEffect(() => {
    if (activeProjectId) {
      clearAiChat();
    }
  }, [activeProjectId, clearAiChat]);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }

    void useProjectAssetsStore.getState().setActiveProject(activeProjectId);

    return () => {
      void useProjectAssetsStore.getState().flushPersistence();
      useProjectAssetsStore.getState().clearActiveProject();
    };
  }, [activeProjectId]);

  const handleNameBlur = () => {
    const nameToUse = projectName.trim() || PROJECT_CONFIG.DEFAULT_NAME;
    setProjectName(nameToUse);
    engineStore.dispatchIntent({ type: 'RENAME_PROJECT', name: nameToUse });
  };

  // ── Auto-save: initialize StorageService on mount (restore + subscribe) ──
  useEffect(() => {
    const stop = StorageService.initAutoSave();
    return () => {
      stop();
    };
  }, []);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await StorageService.save();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('[StudioEditor] Manual save failed:', err);
      setSaveStatus('idle');
    }
  };

  const handleResetProject = () => {
    const confirmMessage =
      t('editor.confirmResetProject') ||
      'Are you sure you want to reset the project? All layers and media will be deleted.';
    if (window.confirm(confirmMessage)) {
      const newManifest = engineStore.createBlankProject({
        name: PROJECT_CONFIG.DEFAULT_NAME,
      });
      setProjectName(newManifest.projectInfo.name || '');
      useStudioStore.getState().clearSelection();
    }
  };

  // Export Hook & State
  const { isExporting, progress, status, error, startExport, cancelExport, resetExportState } =
    useExport();

  // Centralized Playback Engine Hook
  const {
    isReady,
    isPlaying,
    currentTime,
    duration,
    projectDuration,
    canPlay,
    mediaReadiness,
    pxPerSec,
    width,
    height,
    togglePlay,
    seek,
    undo,
    redo,
  } = useEngineLoop(canvasRef, { disabled: isExporting });

  useEffect(() => {
    ensureTimelineExtent(projectDuration);
  }, [ensureTimelineExtent, projectDuration]);

  // Global Keyboard Event Handling
  useKeyboardShortcuts({
    isPlaying,
    currentTime,
    canPlay,
    togglePlay,
    seek,
    onSave: handleSave,
  });

  const [isExportModalVisible, setExportModalVisible] = useState(false);
  const [isExportSettingsVisible, setExportSettingsVisible] = useState(false);

  const handleStartExport = () => {
    setExportSettingsVisible(true);
  };

  const handleConfirmExport = async (settings: ExportSettings) => {
    setExportSettingsVisible(false);
    setExportModalVisible(true);
    await startExport(settings);
  };

  const handleCloseExportModal = () => {
    setExportModalVisible(false);
    resetExportState();
  };

  return (
    <div className="app-container" data-f="studio-editor-root">
      <header className="global-header" data-f="studio-editor-header">
        <div
          className="branding-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: 0,
          }}
          data-f="studio-editor-branding"
        >
          <img
            src={studioLogo}
            alt="Rendium Desktop Studio Logo"
            className="studio-logo"
            style={{ height: '24px' }}
            data-f="studio-editor-logo"
          />
        </div>
        <style data-f="studio-editor-branding-style">{`
          .branding-container:hover .studio-logo {
            opacity: 0.8;
          }
          .branding-container:active .studio-logo {
            opacity: 0.6;
          }
        `}</style>
        <div
          className="studio-meta"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          data-f="studio-editor-meta"
        >
          <input
            type="text"
            value={projectName}
            placeholder={t('editor.projectNamePlaceholder')}
            onChange={(e) => setProjectName(sanitizeProjectName(e.target.value))}
            onBlur={handleNameBlur}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.2)',
              color: '#eee',
              fontSize: '14px',
              fontFamily: 'inherit',
              outline: 'none',
              marginLeft: '12px',
              width: '200px',
            }}
            data-f="studio-editor-project-name"
          />
          <button
            type="button"
            className="btn-reset-project"
            onClick={handleResetProject}
            title={t('editor.resetProjectButton') || 'Reset Project'}
            style={{
              backgroundColor: 'rgba(255, 68, 68, 0.08)',
              border: '1px solid rgba(255, 68, 68, 0.25)',
              color: '#FF7777',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginLeft: '12px',
            }}
            data-f="studio-editor-reset-project"
          >
            {t('editor.resetProjectButton') || 'Reset Project'}
          </button>
          {saveStatus !== 'idle' && (
            <span
              style={{
                fontSize: '11px',
                color: saveStatus === 'saving' ? '#888' : '#00ffaa',
                marginLeft: '8px',
                opacity: 0.8,
                transition: 'all 0.3s ease',
              }}
              data-f="studio-editor-save-status"
            >
              {saveStatus === 'saving' ? `${t('assets.saved')}...` : t('assets.saved')}
            </span>
          )}
        </div>

        <div style={{ flexGrow: 1 }} data-f="studio-editor-header-spacer" />

        <div
          className="history-controls"
          style={{ display: 'flex', gap: '6px', marginRight: '16px' }}
          data-f="studio-editor-history-controls"
        >
          <button
            type="button"
            className="btn-history"
            onClick={undo}
            disabled={true}
            title={t('editor.undoTitle')}
            data-f="studio-editor-undo"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#eee',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'not-allowed',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.3,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-f="studio-editor-undo-icon"
            >
              <title data-f="studio-editor-undo-icon-title">{t('editor.undo')}</title>
              <path d="M3 7v6h6" data-f="studio-editor-undo-icon-corner" />
              <path
                d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
                data-f="studio-editor-undo-icon-arc"
              />
            </svg>
          </button>
          <button
            type="button"
            className="btn-history"
            onClick={redo}
            disabled={true}
            title={t('editor.redoTitle')}
            data-f="studio-editor-redo"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#eee',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'not-allowed',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.3,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-f="studio-editor-redo-icon"
            >
              <title data-f="studio-editor-redo-icon-title">{t('editor.redo')}</title>
              <path d="M21 7v6h-6" data-f="studio-editor-redo-icon-corner" />
              <path
                d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"
                data-f="studio-editor-redo-icon-arc"
              />
            </svg>
          </button>
        </div>

        {/* create-menu (workflow wizard) was removed here */}

        <button
          type="button"
          className="btn-export-trigger"
          disabled={!isReady || isExporting}
          onClick={handleStartExport}
          data-f="studio-editor-export"
          style={{
            backgroundColor: 'rgba(0, 191, 255, 0.1)',
            border: '1px solid rgba(0, 191, 255, 0.3)',
            color: '#00BFFF',
            padding: '6px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isExporting ? 'default' : 'pointer',
            transition: 'all 0.2s',
            opacity: isReady ? 1 : 0.5,
          }}
        >
          {isExporting ? `${t('export.exporting')}...` : t('editor.exportVideo')}
        </button>
        <LocaleSwitcher compact />
      </header>

      <style data-f="studio-editor-command-style">{`
				.btn-create-trigger:hover {
					background-color: rgba(255, 255, 255, 0.1) !important;
					border-color: rgba(255, 255, 255, 0.22) !important;
				}
				.btn-capture-trigger:hover {
					background-color: rgba(0, 255, 235, 0.16) !important;
					border-color: rgba(0, 255, 235, 0.5) !important;
					box-shadow: 0 0 12px rgba(0, 255, 235, 0.3) !important;
					transform: translateY(-1px);
				}
				.btn-capture-trigger:active {
					transform: translateY(0);
				}
				@keyframes shutter-flicker {
					0% { opacity: 1; }
					100% { opacity: 0; }
				}
				.btn-history:hover:not(:disabled) {
					background-color: rgba(255, 255, 255, 0.1) !important;
					border-color: rgba(255, 255, 255, 0.2) !important;
					transform: translateY(-1px);
				}
				.btn-history:active:not(:disabled) {
					transform: translateY(0);
				}
				.btn-export-trigger:hover:not(:disabled) {
					background-color: rgba(0, 191, 255, 0.2) !important;
					border-color: rgba(0, 191, 255, 0.5) !important;
				}
				.btn-export-trigger:active:not(:disabled) {
					transform: translateY(1px);
				}
				.btn-reset-project:hover {
					background-color: rgba(255, 68, 68, 0.16) !important;
					border-color: rgba(255, 68, 68, 0.5) !important;
				}
				.btn-reset-project:active {
					transform: translateY(1px);
				}

			`}</style>

      <div className="studio-layout" data-f="studio-editor-layout">
        <div className="main-content" data-f="studio-editor-main-content">
          <CanvasPreview
            canvasRef={canvasRef}
            isReady={isReady}
            currentTime={currentTime}
            isPlaying={isPlaying}
            canPlay={canPlay}
            mediaReadiness={mediaReadiness}
            seek={seek}
            togglePlay={togglePlay}
            width={width}
            height={height}
          />

          {/* Playback & Timeline Controls */}
          <div
            className="playback-footer"
            data-f="studio-editor-playback-footer"
            style={{
              padding: '16px 0',
              backgroundColor: '#0a0a0c',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              minHeight: '100px',
              height: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flexShrink: 0, // Prevent footer from being squeezed
            }}
          >
            {/* Seek Bar */}
            <div
              className="seek-bar-container"
              style={{ position: 'relative' }}
              data-f="studio-editor-seek-bar-container"
            >
              <PackedStrandScrubber
                currentTime={currentTime}
                isPlaying={isPlaying}
                timelineExtent={timelineExtent}
                contentDuration={duration}
                pxPerSec={pxPerSec}
                seek={seek}
                onSelectLayer={setSelectedLayerId}
                selectedLayerId={selectedLayerId}
              />
            </div>
          </div>
        </div>

        <div className="sidebar-right" data-f="studio-editor-sidebar-right">
          <RightPanel
            onSelectLayer={setSelectedLayerId}
            selectedLayerId={selectedLayerId}
            currentTime={currentTime}
          />
        </div>
      </div>

      {isExportModalVisible && (
        <ExportModal
          isExporting={isExporting}
          progress={progress}
          status={status}
          error={error}
          onCancel={cancelExport}
          onClose={handleCloseExportModal}
        />
      )}

      {isExportSettingsVisible && (
        <ExportSettingsModal
          isOpen={isExportSettingsVisible}
          onClose={() => setExportSettingsVisible(false)}
          onStart={handleConfirmExport}
        />
      )}

      {/* Workflow components were removed here */}
    </div>
  );
}
