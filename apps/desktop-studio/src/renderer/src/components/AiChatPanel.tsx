import { css, cva, cx } from '@styled-system/css';
import { Image as ImageIcon, Loader2, Paperclip, Send, Volume2, X } from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/locale';
import type {
  AiChatAttachment,
  AiChatProviderKind,
  AiChatSettingsView,
} from '../services/AiService';
import type { ProjectAssetRecord } from '../stores/projectAssetTypes';
import { useStudioStore } from '../stores/studioStore';
import type { AiChatMessage } from '../stores/useAiChatStore';
import { useAiChatStore } from '../stores/useAiChatStore';
import { useProjectAssetsStore } from '../stores/useProjectAssetsStore';
import { AiActionPreview } from './AiActionPreview';
import { AssetPlacementMenu } from './AssetPlacementMenu';
import { AssetUploadDropzone } from './AssetUploadDropzone';
import { primaryButtonClass, surfaceCardClass, surfacePanelClass } from './ui/styles';

function MessageBubble({
  message,
  isStreamingPlaceholder,
  formatTime,
  t,
}: {
  message: AiChatMessage;
  isStreamingPlaceholder: boolean;
  formatTime: (timestamp: number) => string;
  t: ReturnType<typeof useLocale>['t'];
}) {
  const isUser = message.role === 'user';

  return (
    <article
      className={`ai-chat-panel__message ai-chat-panel__message--${message.role}`}
      aria-label={isUser ? t('ai.you') : t('ai.assistant')}
    >
      <div className="ai-chat-panel__message-meta">
        <span className="ai-chat-panel__message-role">
          {isUser ? t('ai.you') : t('ai.assistant')}
        </span>
        <span className="ai-chat-panel__message-time">{formatTime(message.timestamp)}</span>
      </div>

      {isStreamingPlaceholder ? (
        <div
          className="ai-chat-panel__bubble ai-chat-panel__bubble--typing"
          aria-label={t('ai.generating')}
        >
          <span className="ai-chat-panel__typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      ) : (
        <div className="ai-chat-panel__bubble">{message.content}</div>
      )}

      {message.attachments && message.attachments.length > 0 ? (
        <div className="ai-chat-panel__message-attachments" aria-label={t('ai.attachments')}>
          {message.attachments.map((attachment) => (
            <span key={attachment.assetId} className="ai-chat-panel__attachment-chip">
              <span className="ai-chat-panel__attachment-chip-icon" aria-hidden="true">
                {attachment.assetKind === 'audio' ? <Volume2 size={13} /> : <ImageIcon size={13} />}
              </span>
              <span className="ai-chat-panel__attachment-chip-copy">
                <span>{attachment.displayName}</span>
                <small>{formatAssetStatusLabel(attachment.status, t)}</small>
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function AssistantInsightBubble({
  children,
  timestamp,
  formatTime,
  t,
}: {
  children: ReactNode;
  timestamp: number;
  formatTime: (timestamp: number) => string;
  t: ReturnType<typeof useLocale>['t'];
}) {
  return (
    <article
      className="ai-chat-panel__message ai-chat-panel__message--assistant ai-chat-panel__message--insight"
      aria-label={t('ai.assistant')}
    >
      <div className="ai-chat-panel__message-meta">
        <span className="ai-chat-panel__message-role">{t('ai.assistant')}</span>
        <span className="ai-chat-panel__message-time">{formatTime(timestamp)}</span>
      </div>
      <div className="ai-chat-panel__bubble ai-chat-panel__bubble--insight">{children}</div>
    </article>
  );
}

function EmptyState() {
  const { t } = useLocale();
  return (
    <div className="ai-chat-panel__empty-state">
      <div className="ai-chat-panel__empty-badge">{t('ai.assistant')}</div>
      <h3 className="ai-chat-panel__empty-title">{t('ai.askForHelp')}</h3>
      <p className="ai-chat-panel__empty-copy">{t('ai.sessionHelpDescription')}</p>

      <div className="ai-chat-panel__empty-prompts" aria-hidden="true">
        <span>{t('ai.summarizeLayout')}</span>
        <span>{t('ai.suggestImprovements')}</span>
        <span>{t('ai.explainSelectedLayer')}</span>
      </div>
    </div>
  );
}

function AiProviderSettingsPanel({
  settings,
  onSaved,
}: {
  settings: AiChatSettingsView | null;
  onSaved: (settings: AiChatSettingsView) => void;
}) {
  const { t } = useLocale();
  const [provider, setProvider] = useState<AiChatProviderKind>(settings?.provider ?? 'openai');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiModel, setOpenAiModel] = useState(settings?.openAiModel ?? '');
  const [ollamaHost, setOllamaHost] = useState(settings?.ollamaHost ?? '');
  const [ollamaModel, setOllamaModel] = useState(settings?.ollamaModel ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProvider(settings?.provider ?? 'openai');
    setOpenAiModel(settings?.openAiModel ?? '');
    setOllamaHost(settings?.ollamaHost ?? '');
    setOllamaModel(settings?.ollamaModel ?? '');
    setOpenAiApiKey('');
    setError(null);
  }, [settings]);

  const saveSettings = async () => {
    const aiChatApi = window.api?.aiChat;
    if (!aiChatApi?.updateSettings) {
      setError(t('ai.settingsUnavailable'));
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const result = await aiChatApi.updateSettings({
        provider,
        openAiApiKey,
        openAiModel,
        ollamaHost,
        ollamaModel,
      });
      if (!result.success || !result.settings) {
        setError(result.error ?? t('ai.settingsSaveFailed'));
        return;
      }

      onSaved(result.settings);
      setOpenAiApiKey('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="ai-chat-panel__settings" aria-label={t('ai.settingsTitle')}>
      <div className="ai-chat-panel__settings-header">
        <div>
          <strong>{t('ai.settingsTitle')}</strong>
          <span>{t('ai.settingsDescription')}</span>
        </div>
        {settings?.hasOpenAiApiKey ? (
          <span className="ai-chat-panel__settings-saved">{t('ai.openAiKeySaved')}</span>
        ) : null}
      </div>

      <label className="ai-chat-panel__settings-field">
        <span>{t('ai.provider')}</span>
        <select
          value={provider}
          disabled={true}
          onChange={(event) => setProvider(event.target.value as AiChatProviderKind)}
        >
          <option value="openai">{t('ai.providerOpenAi')}</option>
        </select>
      </label>

      <>
        <label className="ai-chat-panel__settings-field">
          <span>{t('ai.openAiApiKey')}</span>
          <input
            type="password"
            value={openAiApiKey}
            placeholder={settings?.hasOpenAiApiKey ? t('ai.openAiKeySavedPlaceholder') : 'sk-...'}
            onChange={(event) => setOpenAiApiKey(event.target.value)}
          />
        </label>
        <label className="ai-chat-panel__settings-field">
          <span>{t('ai.model')}</span>
          <input value={openAiModel} onChange={(event) => setOpenAiModel(event.target.value)} />
        </label>
      </>

      {error ? <div className="ai-chat-panel__settings-error">{error}</div> : null}

      <button
        type="button"
        className="ai-chat-panel__settings-save"
        disabled={isSaving}
        onClick={() => void saveSettings()}
      >
        {isSaving ? t('ai.settingsSaving') : t('ai.settingsSave')}
      </button>
    </section>
  );
}

const recommendationRootClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  minHeight: 0,
  padding: '3',
});

const recommendationHeaderClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  minWidth: 0,
  padding: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorderSoft',
  borderRadius: 'md',
  backgroundColor: 'surface',
});

const recommendationTitleRowClass = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  minWidth: 0,
  flexWrap: 'wrap',
});

const recommendationTitleClass = css({
  flex: '1 1 160px',
  minWidth: 0,
  fontSize: 'sm',
  fontWeight: '700',
  color: 'textPrimary',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  overflowWrap: 'anywhere',
});

const recommendationBodyClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  minHeight: 0,
  minWidth: 0,
});

const recommendationCardClass = cva({
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'panelBorderSoft',
    borderRadius: 'lg',
    backgroundColor: 'surface',
    padding: '3',
    transitionProperty: 'border-color, background-color, box-shadow, transform',
    transitionDuration: '150ms',
  },
  variants: {
    active: {
      true: {
        borderColor: 'accent',
        backgroundColor: 'accentSoft',
        boxShadow: '0 0 0 1px rgba(0, 212, 255, 0.12)',
      },
      false: {},
    },
  },
  defaultVariants: {
    active: false,
  },
});

const candidateHeaderClass = css({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '3',
});

const candidateTitleClass = css({
  fontSize: 'sm',
  fontWeight: '700',
  color: 'textPrimary',
});

const candidateReasonClass = css({
  fontSize: 'sm',
  color: 'textSecondary',
  lineHeight: '1.45',
});

const candidateMetaClass = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2',
});

const pillClass = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1',
    maxWidth: '100%',
    borderRadius: 'full',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingX: '2',
    paddingY: '1',
    fontSize: 'xs',
    fontWeight: '700',
    lineHeight: '1.25',
    overflowWrap: 'anywhere',
  },
  variants: {
    tone: {
      default: {
        borderColor: 'panelBorderSoft',
        backgroundColor: 'surfaceHover',
        color: 'textSecondary',
      },
      accent: {
        borderColor: 'accent',
        backgroundColor: 'accentSoft',
        color: 'accentStrong',
      },
      warning: {
        borderColor: 'warning',
        backgroundColor: 'rgba(255, 170, 0, 0.12)',
        color: 'warning',
      },
    },
  },
  defaultVariants: {
    tone: 'default',
  },
});

function normalizeTags(tags: string[] | undefined): string[] {
  return (tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

function formatAssetStatusLabel(
  status: 'ready' | 'pending_metadata' | 'needs_attention' | 'missing',
  t: ReturnType<typeof useLocale>['t'],
): string {
  switch (status) {
    case 'ready':
      return t('assets.status.ready');
    case 'pending_metadata':
      return t('assets.status.pending_metadata');
    case 'needs_attention':
      return t('assets.status.needs_attention');
    case 'missing':
      return t('assets.status.missing');
  }
}

function isImageAsset(asset: Pick<ProjectAssetRecord, 'mimeType' | 'displayName'>): boolean {
  return (
    asset.mimeType.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(asset.displayName)
  );
}

function isAudioAsset(asset: Pick<ProjectAssetRecord, 'mimeType' | 'displayName'>): boolean {
  return (
    asset.mimeType.startsWith('audio/') ||
    /\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i.test(asset.displayName)
  );
}

function isAttachableAsset(asset: ProjectAssetRecord): boolean {
  return asset.status !== 'missing' && (isImageAsset(asset) || isAudioAsset(asset));
}

function isAcceptedChatAttachmentFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    file.type.startsWith('audio/') ||
    /\.(png|jpe?g|gif|webp|avif|bmp|svg|mp3|wav|m4a|aac|ogg|flac|aiff?)$/i.test(file.name)
  );
}

function toAiChatAttachment(asset: ProjectAssetRecord): AiChatAttachment {
  // biome-ignore lint/suspicious/noExplicitAny: legacy compatibility
  const anyAsset = asset as any;
  return {
    assetId: asset.id,
    assetKind: asset.assetKind,
    displayName: asset.displayName,
    status: asset.status,
    mimeType: asset.mimeType,
    sourceUrlAvailable: Boolean(asset.sourceUrl),
    durationSeconds: asset.durationSeconds,
    audioAnalysis: anyAsset.audioAnalysis,
    description: anyAsset.metadata?.description ?? '',
    tags: anyAsset.metadata?.tags ? [...anyAsset.metadata.tags] : [],
    subject: anyAsset.metadata?.subject,
    mood: anyAsset.metadata?.mood,
    usageHint: anyAsset.metadata?.usageHint,
  };
}

function AiWorkflowDraftSection() {
  const { t } = useLocale();
  const workflowDraft = useAiChatStore((state) => state.workflowDraft);
  const chooseWorkflowBackground = useAiChatStore((state) => state.chooseWorkflowBackground);

  if (!workflowDraft) {
    return null;
  }

  return (
    <section className={cx(surfaceCardClass, recommendationRootClass)}>
      <header className={recommendationHeaderClass}>
        <div className={recommendationTitleRowClass}>
          <div className={recommendationTitleClass}>{t('ai.workflowBackgroundTitle')}</div>
          <span className={pillClass({ tone: 'accent' })}>{t('ai.workflowReady')}</span>
        </div>
        <p
          className={css({ margin: 0, color: 'textSecondary', fontSize: 'sm', lineHeight: '1.45' })}
        >
          {workflowDraft.reply}
        </p>
      </header>
      <div className={recommendationBodyClass}>
        {workflowDraft.candidates.map((candidate) => (
          <article
            key={candidate.assetId}
            className={cx(recommendationCardClass(), surfacePanelClass)}
          >
            <div className={candidateHeaderClass}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className={candidateTitleClass}>{candidate.title}</div>
                <div className={candidateReasonClass}>{candidate.reason}</div>
              </div>
            </div>
            <button
              type="button"
              className={primaryButtonClass({ tone: 'accent', size: 'sm' })}
              onClick={() => chooseWorkflowBackground(candidate.assetId)}
            >
              {t('ai.workflowUseBackground')}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

interface LegacyAssetsState {
  selectedAssetId?: string | null;
  previewAsset: (id: string) => void;
  selectAsset: (id: string | null) => void;
  useAssetInScene: (id: string, options: unknown) => void;
}

interface LegacyStudioState {
  openAssetsPanel: () => void;
}

interface LegacyAssetRecord {
  id: string;
  displayName: string;
  status: 'ready' | 'missing';
  assetKind: ProjectAssetRecord['assetKind'];
  thumbnailDataUrl?: string;
  usageCount?: number;
}

function AiAssetRecommendationSection() {
  const { t } = useLocale();
  const selectedAssetId = useProjectAssetsStore(
    (state) => (state as unknown as LegacyAssetsState).selectedAssetId,
  );
  const assets = useProjectAssetsStore((state) => state.assets);
  const previewAsset = useProjectAssetsStore(
    (state) => (state as unknown as LegacyAssetsState).previewAsset,
  );
  const selectAsset = useProjectAssetsStore(
    (state) => (state as unknown as LegacyAssetsState).selectAsset,
  );
  const useAssetInScene = useProjectAssetsStore(
    (state) => (state as unknown as LegacyAssetsState).useAssetInScene,
  );
  const ingestFile = useProjectAssetsStore((state) => state.ingestFile);
  const ingestFiles = async (files: File[]) => {
    return Promise.all(files.map((file) => ingestFile(file)));
  };
  const openAssetsPanel = useStudioStore(
    (state) => (state as unknown as LegacyStudioState).openAssetsPanel,
  );
  const assetRecommendation = useAiChatStore((state) => state.assetRecommendation);

  if (!assetRecommendation) {
    return null;
  }

  const candidates = assetRecommendation.candidates;

  return (
    <section className={cx(surfaceCardClass, recommendationRootClass)}>
      <header className={recommendationHeaderClass}>
        <div className={recommendationTitleRowClass}>
          <div className={recommendationTitleClass}>{t('assets.recommendationTitle')}</div>
          <span className={pillClass({ tone: candidates.length > 0 ? 'accent' : 'warning' })}>
            {candidates.length > 0
              ? t('assets.recommendationReady')
              : t('assets.recommendationEmpty')}
          </span>
        </div>
        <p
          className={css({
            margin: 0,
            color: 'textSecondary',
            fontSize: 'sm',
            lineHeight: '1.45',
          })}
        >
          {assetRecommendation.reply || t('assets.recommendationDescription')}
        </p>
      </header>

      <div className={recommendationBodyClass}>
        {candidates.length > 0 ? (
          candidates.map((candidate, index) => {
            const matchingAsset =
              candidate.assetId !== undefined
                ? (assets.find(
                    (asset) => asset.id === candidate.assetId,
                  ) as unknown as LegacyAssetRecord)
                : undefined;
            const isActive = matchingAsset ? selectedAssetId === matchingAsset.id : false;
            const tags = normalizeTags(candidate.suggestedTags);

            return (
              <article
                key={`${candidate.assetId ?? candidate.title}-${index}`}
                className={cx(recommendationCardClass({ active: isActive }), surfacePanelClass)}
              >
                <div className={candidateHeaderClass}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className={candidateTitleClass}>{candidate.title}</div>
                    <div className={candidateReasonClass}>{candidate.reason}</div>
                  </div>
                  <span
                    className={pillClass({
                      tone: matchingAsset?.status === 'missing' ? 'warning' : 'default',
                    })}
                  >
                    {matchingAsset
                      ? formatAssetStatusLabel(matchingAsset.status, t)
                      : t('assets.recommendationSuggestion')}
                  </span>
                </div>

                {matchingAsset ? (
                  <div className={css({ display: 'flex', gap: '3', alignItems: 'flex-start' })}>
                    <div
                      className={css({
                        width: '112px',
                        height: '72px',
                        borderRadius: 'md',
                        overflow: 'hidden',
                        backgroundColor: 'surfaceHover',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: 'panelBorderSoft',
                        flex: '0 0 auto',
                      })}
                    >
                      {matchingAsset.thumbnailDataUrl ? (
                        <img
                          src={matchingAsset.thumbnailDataUrl}
                          alt={matchingAsset.displayName}
                          className={css({
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          })}
                        />
                      ) : null}
                    </div>

                    <div
                      className={css({
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2',
                        minW: 0,
                        flex: 1,
                      })}
                    >
                      <div className={candidateMetaClass}>
                        <span className={pillClass({ tone: 'default' })}>
                          {matchingAsset.displayName}
                        </span>
                        <span
                          className={pillClass({
                            tone: matchingAsset.status === 'ready' ? 'accent' : 'warning',
                          })}
                        >
                          {formatAssetStatusLabel(matchingAsset.status, t)}
                        </span>
                        <span className={pillClass({ tone: 'default' })}>
                          {t('assets.usageCount', { count: matchingAsset.usageCount ?? 0 })}
                        </span>
                      </div>

                      {tags.length > 0 ? (
                        <div className={candidateMetaClass}>
                          {tags.map((tag) => (
                            <span key={tag} className={pillClass({ tone: 'default' })}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className={css({ display: 'flex', gap: '2', flexWrap: 'wrap' })}>
                  {matchingAsset ? (
                    <>
                      <button
                        type="button"
                        className={primaryButtonClass({ tone: 'default', size: 'sm' })}
                        onClick={() => {
                          selectAsset(matchingAsset.id);
                          previewAsset(matchingAsset.id);
                        }}
                      >
                        {t('assets.preview')}
                      </button>
                      <AssetPlacementMenu
                        disabled={matchingAsset.status === 'missing'}
                        onPlace={(scopeRole) =>
                          void useAssetInScene(matchingAsset.id, {
                            scopeRole,
                          })
                        }
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      className={primaryButtonClass({ tone: 'default', size: 'sm' })}
                      onClick={() => selectAsset(null)}
                    >
                      {t('assets.noMatch')}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <div
            className={cx(
              surfacePanelClass,
              css({ padding: '3', display: 'flex', flexDirection: 'column', gap: '2' }),
            )}
          >
            <div className={css({ fontSize: 'sm', fontWeight: '700', color: 'textPrimary' })}>
              {t('assets.recommendationEmpty')}
            </div>
            <div className={css({ fontSize: 'sm', color: 'textSecondary', lineHeight: '1.45' })}>
              {assetRecommendation.promptSuggestion ?? t('assets.recommendationUploadPrompt')}
            </div>
          </div>
        )}

        <AssetUploadDropzone
          title={assetRecommendation.uploadCta ?? t('assets.uploadTitle')}
          description={t('assets.recommendationUploadDescription')}
          helper={t('assets.recommendationUploadHint')}
          compact
          onFiles={async (files) => {
            const uploadedAssetIds = await ingestFiles(files);
            const primaryAssetId = uploadedAssetIds[0];
            if (!primaryAssetId) {
              return uploadedAssetIds;
            }

            openAssetsPanel();
            selectAsset(primaryAssetId);
            return uploadedAssetIds;
          }}
        />
      </div>
    </section>
  );
}

export function AiChatPanel({
  isSettingsOpen = false,
}: {
  isSettingsOpen?: boolean;
}) {
  const { t, formatTimeOfDay } = useLocale();
  const messages = useAiChatStore((state) => state.messages);
  const isGenerating = useAiChatStore((state) => state.isGenerating);
  const pendingExecution = useAiChatStore((state) => state.pendingExecution);
  const assetRecommendation = useAiChatStore((state) => state.assetRecommendation);
  const workflowDraft = useAiChatStore((state) => state.workflowDraft);
  const sendMessage = useAiChatStore((state) => state.sendMessage);
  const assets = useProjectAssetsStore((state) => state.assets);
  const ingestFile = useProjectAssetsStore((state) => state.ingestFile);
  const ingestFiles = async (files: File[]) => {
    return Promise.all(files.map((file) => ingestFile(file)));
  };

  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AiChatAttachment[]>([]);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiChatSettingsView | null>(null);
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const aiChatApi = window.api?.aiChat;
    if (!aiChatApi?.getSettings) {
      return;
    }

    let isMounted = true;
    void aiChatApi.getSettings().then((result) => {
      if (isMounted && result.success && result.settings) {
        setAiSettings(result.settings);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    if (draft.length === 0) {
      textarea.style.height = '44px';
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [draft]);

  const assistantInsightCount =
    (pendingExecution ? 1 : 0) + (workflowDraft ? 1 : 0) + (assetRecommendation ? 1 : 0);
  const hasAssistantInsights = assistantInsightCount > 0;
  const insightTimestamp = messages[messages.length - 1]?.timestamp ?? Date.now();

  useLayoutEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    if (messages.length > 0 || isGenerating || assistantInsightCount > 0) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [assistantInsightCount, isGenerating, messages]);

  const submitMessage = () => {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft || isGenerating || isUploadingAttachment) {
      return;
    }

    setDraft('');
    setAttachments([]);
    setIsAssetPickerOpen(false);
    textareaRef.current?.focus();
    void sendMessage(trimmedDraft, attachments);
  };

  const attachAsset = (asset: ProjectAssetRecord) => {
    if (!isAttachableAsset(asset)) {
      return;
    }

    const nextAttachment = toAiChatAttachment(asset);
    setAttachments((current) =>
      current.some((attachment) => attachment.assetId === nextAttachment.assetId)
        ? current
        : [...current, nextAttachment],
    );
    setIsAssetPickerOpen(false);
    textareaRef.current?.focus();
  };

  const removeAttachment = (assetId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.assetId !== assetId));
  };

  const attachFiles = async (files: FileList | File[] | null) => {
    if (!files || isGenerating || isUploadingAttachment) {
      return;
    }

    const mediaFiles = Array.from(files).filter(isAcceptedChatAttachmentFile);
    if (mediaFiles.length === 0) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setIsUploadingAttachment(true);
    try {
      const uploadedAssetIds = await ingestFiles(mediaFiles);
      const latestAssets = useProjectAssetsStore.getState().assets;
      const nextAttachments = uploadedAssetIds
        .map((assetId) => latestAssets.find((asset) => asset.id === assetId))
        .filter((asset): asset is ProjectAssetRecord => Boolean(asset))
        .filter(isAttachableAsset)
        .map(toAiChatAttachment);

      setAttachments((current) => {
        const existingIds = new Set(current.map((attachment) => attachment.assetId));
        return [
          ...current,
          ...nextAttachments.filter((attachment) => !existingIds.has(attachment.assetId)),
        ];
      });
    } finally {
      setIsUploadingAttachment(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    textareaRef.current?.focus();
  };

  const attachableAssets = assets.filter(isAttachableAsset);
  const isComposerBusy = isGenerating || isUploadingAttachment;
  const hasDraft = draft.trim().length > 0;

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-panel__shell">
        <div
          ref={messageListRef}
          className="ai-chat-panel__messages"
          role="log"
          aria-busy={isGenerating}
          aria-live="polite"
          aria-relevant="additions text"
        >
          {messages.length === 0 && !hasAssistantInsights ? (
            <EmptyState />
          ) : (
            <>
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  t={t}
                  formatTime={(timestamp) => formatTimeOfDay(timestamp)}
                  isStreamingPlaceholder={
                    isGenerating && index === messages.length - 1 && message.content.length === 0
                  }
                />
              ))}

              {pendingExecution ? (
                <AssistantInsightBubble
                  timestamp={insightTimestamp}
                  t={t}
                  formatTime={(timestamp) => formatTimeOfDay(timestamp)}
                >
                  <AiActionPreview />
                </AssistantInsightBubble>
              ) : null}

              {workflowDraft ? (
                <AssistantInsightBubble
                  timestamp={insightTimestamp}
                  t={t}
                  formatTime={(timestamp) => formatTimeOfDay(timestamp)}
                >
                  <AiWorkflowDraftSection />
                </AssistantInsightBubble>
              ) : null}

              {assetRecommendation ? (
                <AssistantInsightBubble
                  timestamp={insightTimestamp}
                  t={t}
                  formatTime={(timestamp) => formatTimeOfDay(timestamp)}
                >
                  <AiAssetRecommendationSection />
                </AssistantInsightBubble>
              ) : null}
            </>
          )}
        </div>

        <form
          className={`ai-chat-panel__composer${isComposerDragging ? ' ai-chat-panel__composer--dragging' : ''}`}
          onSubmit={(event) => {
            event.preventDefault();
            submitMessage();
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!isComposerBusy && event.dataTransfer.types.includes('Files')) {
              setIsComposerDragging(true);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isComposerBusy && event.dataTransfer.types.includes('Files')) {
              setIsComposerDragging(true);
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsComposerDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsComposerDragging(false);
            void attachFiles(event.dataTransfer.files);
          }}
        >
          <div className="ai-chat-panel__composer-surface">
            {isSettingsOpen ? (
              <AiProviderSettingsPanel settings={aiSettings} onSaved={setAiSettings} />
            ) : null}

            <label className="ai-chat-panel__label" htmlFor="ai-chat-input">
              {t('ai.promptLabel')}
            </label>

            {attachments.length > 0 ? (
              <div className="ai-chat-panel__attachments" aria-label={t('ai.attachments')}>
                {attachments.map((attachment) => (
                  <span key={attachment.assetId} className="ai-chat-panel__attachment-chip">
                    <span className="ai-chat-panel__attachment-chip-icon" aria-hidden="true">
                      {attachment.assetKind === 'audio' ? (
                        <Volume2 size={13} />
                      ) : (
                        <ImageIcon size={13} />
                      )}
                    </span>
                    <span className="ai-chat-panel__attachment-chip-copy">
                      <span>{attachment.displayName}</span>
                      <small>{formatAssetStatusLabel(attachment.status, t)}</small>
                    </span>
                    <button
                      type="button"
                      aria-label={t('ai.removeAttachment')}
                      onClick={() => removeAttachment(attachment.assetId)}
                      disabled={isComposerBusy}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <textarea
              id="ai-chat-input"
              ref={textareaRef}
              className="ai-chat-panel__textarea"
              placeholder={t('ai.placeholder')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={(event) => {
                const pastedFiles = Array.from(event.clipboardData.files).filter(
                  isAcceptedChatAttachmentFile,
                );
                if (pastedFiles.length === 0) {
                  return;
                }

                event.preventDefault();
                void attachFiles(pastedFiles);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) {
                  return;
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitMessage();
                }
              }}
              rows={1}
            />

            <div className="ai-chat-panel__composer-toolbar">
              <div className="ai-chat-panel__composer-tools">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,audio/*"
                  multiple
                  hidden
                  onChange={(event) => void attachFiles(event.target.files)}
                />
                <button
                  type="button"
                  className="ai-chat-panel__attachment-button"
                  title={t('ai.attachFile')}
                  aria-label={t('ai.attachFile')}
                  disabled={isComposerBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ai-chat-panel__attachment-button"
                  title={t('ai.attachFromAssets')}
                  aria-label={t('ai.attachFromAssets')}
                  aria-expanded={isAssetPickerOpen}
                  disabled={isComposerBusy}
                  onClick={() => setIsAssetPickerOpen((value) => !value)}
                >
                  <ImageIcon size={15} aria-hidden="true" />
                </button>
              </div>

              <div className="ai-chat-panel__composer-status" aria-live="polite">
                {isUploadingAttachment ? (
                  <span className="ai-chat-panel__status-pill">
                    <Loader2 size={12} aria-hidden="true" />
                    {t('ai.uploadingAttachment')}
                  </span>
                ) : isGenerating ? (
                  <span className="ai-chat-panel__status-pill">{t('ai.generating')}</span>
                ) : null}
                <button
                  type="submit"
                  className="ai-chat-panel__send-button"
                  title={t('ai.send')}
                  aria-label={t('ai.send')}
                  disabled={!hasDraft || isComposerBusy}
                >
                  {isGenerating ? (
                    <span className="ai-chat-panel__spinner" aria-hidden="true" />
                  ) : (
                    <Send size={15} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {isAssetPickerOpen ? (
            <div className="ai-chat-panel__asset-picker">
              <div className="ai-chat-panel__asset-picker-title">{t('ai.attachFromAssets')}</div>
              {attachableAssets.length > 0 ? (
                <div className="ai-chat-panel__asset-picker-list">
                  {attachableAssets.map((asset) => {
                    const legacyAsset = asset as unknown as LegacyAssetRecord;
                    return (
                      <button
                        key={legacyAsset.id}
                        type="button"
                        className="ai-chat-panel__asset-picker-item"
                        onClick={() => attachAsset(asset)}
                        disabled={isGenerating}
                      >
                        <span className="ai-chat-panel__asset-picker-thumb">
                          {legacyAsset.thumbnailDataUrl ? (
                            <img src={legacyAsset.thumbnailDataUrl} alt="" aria-hidden="true" />
                          ) : legacyAsset.assetKind === 'audio' ? (
                            <Volume2 size={14} aria-hidden="true" />
                          ) : (
                            <ImageIcon size={14} aria-hidden="true" />
                          )}
                        </span>
                        <span className="ai-chat-panel__asset-picker-copy">
                          <span>{legacyAsset.displayName}</span>
                          <small>
                            {legacyAsset.assetKind === 'audio'
                              ? `${formatAssetStatusLabel(legacyAsset.status, t)} · ${t('assets.kind.audio')}`
                              : formatAssetStatusLabel(legacyAsset.status, t)}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="ai-chat-panel__asset-picker-empty">
                  {t('ai.noAttachableAssets')}
                </div>
              )}
            </div>
          ) : null}

          <div className="ai-chat-panel__hint">{t('ai.enterHint')}</div>
        </form>
      </div>
    </div>
  );
}
