import { Lock } from 'lucide-react';
import { useLocale } from '../i18n/locale';
import { useStudioStore } from '../stores/studioStore';
// import { useAiChatStore } from '../stores/useAiChatStore';
// import { AiChatPanel } from './AiChatPanel';
import { DevIntentPanel } from './DevIntentPanel';
import { Inspector } from './Inspector';
import { LayerPanel } from './LayerPanel';

interface RightPanelProps {
  onSelectLayer: (id: string | null) => void;
  selectedLayerId: string | null;
  currentTime: number;
}

const SHOW_DEV_TOOLS = import.meta.env.DEV && import.meta.env.VITE_SHOW_DEV_TOOLS === 'true';

/**
 * Right Panel hosting the inspector stack and the AI assistant.
 */
export function RightPanel({ onSelectLayer, selectedLayerId, currentTime }: RightPanelProps) {
  const { t } = useLocale();
  const rightPanelView = useStudioStore((state) => state.rightPanelView);
  const rightPanelTab = useStudioStore((state) => state.rightPanelTab);
  const selectedLayerIds = useStudioStore((state) => state.selectedLayerIds);
  const openProjectSettings = useStudioStore((state) => state.openProjectSettings);
  const showLayerPanel = useStudioStore((state) => state.showLayerPanel);
  const showInspectorTab = useStudioStore((state) => state.showInspectorTab);
  // const showAiAssistant = useStudioStore((state) => state.showAiAssistant);
  const showDevTools = useStudioStore((state) => state.showDevTools);

  // const clearChat = useAiChatStore((state) => state.clearChat);
  // const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);

  const isInspectorTab = rightPanelTab === 'inspector';
  const isAiTab = false; // rightPanelTab === 'ai'; (Disabled in OSS)
  const isDevTab = SHOW_DEV_TOOLS && rightPanelTab === 'dev';
  const primarySelectedLayerId = selectedLayerId ?? selectedLayerIds[0] ?? null;
  const isEditing = isInspectorTab && selectedLayerIds.length > 0;
  const isShowingProject = isInspectorTab && !isEditing && rightPanelView === 'project';
  const selectionLabel =
    selectedLayerIds.length > 1
      ? t('rightPanel.selection', { count: selectedLayerIds.length })
      : primarySelectedLayerId;

  let title = t('rightPanel.layers');
  if (isAiTab) {
    title = t('rightPanel.aiAssistant');
  } else if (isDevTab) {
    title = t('rightPanel.devTools');
  } else if (isEditing) {
    title = t('rightPanel.properties');
  } else if (isShowingProject) {
    title = t('rightPanel.projectSettings');
  }

  return (
    <div className="right-panel" data-f="right-panel">
      <div className="panel-header right-panel__header" data-f="right-panel-header">
        <div className="right-panel__header-row" data-f="right-panel-header-row">
          <div className="right-panel__title-group" data-f="right-panel-title-group">
            {isInspectorTab && (isEditing || isShowingProject) ? (
              <button
                type="button"
                className="right-panel__back-button"
                onClick={() => {
                  onSelectLayer(null);
                  showLayerPanel();
                }}
                aria-label={t('rightPanel.backToLayers')}
                data-f="right-panel-back-button"
              >
                ←
              </button>
            ) : null}

            <div className="right-panel__title-stack" data-f="right-panel-title-stack">
              <h2 className="right-panel__title" data-f="right-panel-title">
                {title}
              </h2>
            </div>
          </div>

          <div className="right-panel__actions" data-f="right-panel-actions">
            {isEditing ? (
              <span
                className="right-panel__selection-chip"
                title={selectionLabel ?? undefined}
                data-f="right-panel-selection-chip"
              >
                {selectionLabel}
              </span>
            ) : (
              <div className="right-panel__action-group" data-f="right-panel-action-group">
                <button
                  type="button"
                  className={`right-panel__action-button ${
                    isShowingProject ? 'right-panel__action-button--active' : ''
                  }`}
                  onClick={openProjectSettings}
                  title={t('rightPanel.projectSettings')}
                  data-f="right-panel-project-button"
                >
                  {t('rightPanel.project')}
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className={`right-panel__tablist ${SHOW_DEV_TOOLS ? 'right-panel__tablist--three' : ''}`}
          role="tablist"
          aria-label={t('rightPanel.layers')}
          data-f="right-panel-tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={isInspectorTab}
            className={`right-panel__tab ${isInspectorTab ? 'right-panel__tab--active' : ''}`}
            onClick={showInspectorTab}
            data-f="right-panel-inspector-tab"
          >
            {t('rightPanel.inspector')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            aria-disabled="true"
            disabled
            className="right-panel__tab right-panel__tab--disabled"
            title={t('rightPanel.aiAssistantLocked')}
            aria-label={t('rightPanel.aiAssistantLocked')}
            data-f="right-panel-ai-assistant-tab"
          >
            <span data-f="right-panel-ai-assistant-tab-label">{t('rightPanel.aiAssistant')}</span>
            <Lock
              className="right-panel__tab-lock"
              size={13}
              strokeWidth={2.25}
              aria-hidden="true"
            />
          </button>
          {SHOW_DEV_TOOLS ? (
            <button
              type="button"
              role="tab"
              aria-selected={isDevTab}
              className={`right-panel__tab ${isDevTab ? 'right-panel__tab--active' : ''}`}
              onClick={showDevTools}
              data-f="right-panel-dev-tools-tab"
            >
              {t('rightPanel.devTools')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel-content right-panel__content" data-f="right-panel-content">
        {isDevTab ? (
          <DevIntentPanel />
        ) : isEditing || isShowingProject ? (
          <div className="right-panel__inspector-view" data-f="right-panel-inspector-view">
            <Inspector
              key={primarySelectedLayerId ?? 'project'}
              selectedLayerId={primarySelectedLayerId}
              selectedLayerIds={selectedLayerIds}
              currentTime={currentTime}
            />
          </div>
        ) : (
          <LayerPanel
            onSelectLayer={onSelectLayer}
            selectedLayerId={selectedLayerId}
            currentTime={currentTime}
          />
        )}
      </div>
    </div>
  );
}
