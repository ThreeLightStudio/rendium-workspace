import { create } from 'zustand';
import { executeAiActionPlan } from '../ai/aiActionExecutor';
import { parseAiAssistantResponse } from '../ai/aiActionParser';
import { parseAiPlannerResponse } from '../ai/aiPlanParser';
import { toast } from '../components/ToastSystem';
import { translate } from '../i18n/locale';
import { buildAiEditorContext } from '../productContext/buildAiEditorContext';
import {
  type AiAssetRecommendationEnvelope,
  type AiAssistantAction,
  type AiChatAttachment,
  type AiChatConversationMessage,
  type AiChatEditorContext,
  type AiChatEvent,
  type AiChatWorkflowPhase,
  createAiChatId,
  normalizeAiChatPrompt,
} from '../services/AiService';

import { useStudioStore } from './studioStore';
import { useProjectAssetsStore } from './useProjectAssetsStore';

export type AiChatMessageRole = AiChatConversationMessage['role'];

export interface AiChatMessage extends AiChatConversationMessage {
  id: string;
  timestamp: number;
}

export interface AiExecutionCardState {
  requestId: string;
  reply: string;
  actions: AiAssistantAction[];
  status: 'ready' | 'executing' | 'success' | 'error';
  error?: string;
  createdLayerIds: string[];
}

export interface AiWorkflowCandidate {
  assetId: string;
  title: string;
  reason: string;
}

export interface AiWorkflowDraftState {
  requestId: string;
  reply: string;
  audioAssetId: string;
  titleText?: string;
  titlePlacement?: 'center' | 'top' | 'bottom';
  candidates: AiWorkflowCandidate[];
}

interface AiChatState {
  messages: AiChatMessage[];
  isGenerating: boolean;
  pendingExecution: AiExecutionCardState | null;
  assetRecommendation: AiAssetRecommendationEnvelope | null;
  workflowDraft: AiWorkflowDraftState | null;
  autoApplyEdits: boolean;
  sendMessage: (content: string, attachments?: AiChatAttachment[]) => Promise<void>;
  chooseWorkflowBackground: (backgroundImageAssetId: string) => void;
  applyPendingExecution: () => Promise<void>;
  cancelPendingExecution: () => void;
  setAutoApplyEdits: (value: boolean) => void;
  clearChat: () => void;
}

let activeRequestId: string | null = null;
let activeAssistantMessageId: string | null = null;
let activeWorkflowPhase: AiChatWorkflowPhase | null = null;
let activeRequestDebugContext: {
  requestId: string;
  phase: AiChatWorkflowPhase;
  messages: AiChatConversationMessage[];
  editorContext: AiChatEditorContext;
} | null = null;
let isBridgeListenerRegistered = false;
let bridgeListenerUnsubscribe: (() => void) | null = null;

function createMessage(
  role: AiChatMessageRole,
  content: string,
  attachments?: AiChatAttachment[],
): AiChatMessage {
  return {
    id: createAiChatId('ai-chat-message'),
    role,
    content,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    timestamp: Date.now(),
  };
}

function resetActiveRequestState(): void {
  activeRequestId = null;
  activeAssistantMessageId = null;
  activeWorkflowPhase = null;
  activeRequestDebugContext = null;
}

function removeAssistantPlaceholder(assistantMessageId: string): void {
  useAiChatStore.setState((state) => ({
    messages: state.messages.filter((message) => message.id !== assistantMessageId),
    isGenerating: false,
  }));
}

function updateAssistantMessage(
  assistantMessageId: string,
  updater: (message: AiChatMessage) => AiChatMessage,
): void {
  useAiChatStore.setState((state) => ({
    messages: state.messages.map((message) =>
      message.id === assistantMessageId ? updater(message) : message,
    ),
  }));
}

function appendAssistantMessage(content = ''): AiChatMessage {
  const message = createMessage('assistant', content);
  useAiChatStore.setState((state) => ({
    messages: [...state.messages, message],
  }));
  return message;
}

function toConversationHistory(messages: AiChatMessage[]): AiChatConversationMessage[] {
  return messages.map(({ role, content, attachments }) => ({
    role,
    content,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  }));
}

function isTimelineSeekOnlyPlan(actions: AiAssistantAction[]): boolean {
  return actions.length > 0 && actions.every((action) => action.type === 'SEEK_TIMELINE');
}

function getAssistantReplyForParsedPlan(actions: AiAssistantAction[], reply: string): string {
  if (reply.length > 0) {
    return reply;
  }

  return isTimelineSeekOnlyPlan(actions)
    ? translate('ai.timelineJumpPrepared')
    : translate('ai.planPrepared');
}

function isWorkflowRequest(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    /workflow|워크플로우|영상/.test(normalized) && /만들|생성|실행|create|make|run/.test(normalized)
  );
}

function extractTitleText(content: string): string | undefined {
  const match = /(?:곡\s*제목|제목|title)\s*[:：]\s*([^\n]+)/i.exec(content);
  return match?.[1]?.trim() || undefined;
}

function extractTitlePlacement(content: string): 'center' | 'top' | 'bottom' | undefined {
  if (/상단|위쪽|top/i.test(content)) return 'top';
  if (/하단|아래쪽|bottom/i.test(content)) return 'bottom';
  if (/중앙|가운데|center/i.test(content)) return 'center';
  return undefined;
}

function buildWorkflowCandidateReason(image: AiChatAttachment, audio: AiChatAttachment): string {
  const imageWords = [
    image.description,
    image.subject,
    image.mood,
    image.usageHint,
    image.tags?.join(', '),
  ]
    .filter(Boolean)
    .join(' / ');
  const audioMood = audio.audioAnalysis?.mood;
  if (audioMood && imageWords) {
    return `${audioMood} 오디오 분위기와 ${imageWords} 메타데이터를 함께 참고했습니다.`;
  }
  if (audioMood) {
    return `${audioMood} 오디오 분위기를 기준으로 고른 후보입니다.`;
  }
  return imageWords || '첨부된 이미지 후보입니다.';
}

function buildWorkflowDraft(params: {
  content: string;
  attachments: AiChatAttachment[];
}): {
  draft: AiWorkflowDraftState | null;
  pendingExecution: AiExecutionCardState | null;
  reply: string;
} | null {
  if (!isWorkflowRequest(params.content)) {
    return null;
  }

  const audio = params.attachments.find(
    (attachment) => attachment.assetKind === 'audio' && attachment.status !== 'missing',
  );
  const images = params.attachments.filter(
    (attachment) => attachment.assetKind === 'image' && attachment.status !== 'missing',
  );
  if (!audio || images.length === 0) {
    return null;
  }

  const titleText = extractTitleText(params.content);
  const titlePlacement = extractTitlePlacement(params.content);
  const requestId = createAiChatId('workflow-draft');

  if (images.length === 1) {
    return null;
  }

  const candidates = images.slice(0, 3).map((image) => ({
    assetId: image.assetId,
    title: image.displayName,
    reason: buildWorkflowCandidateReason(image, audio),
  }));

  return {
    pendingExecution: null,
    reply:
      '첨부한 오디오 분위기와 이미지 메타데이터를 보고 배경 후보를 골랐습니다. 사용할 배경 이미지를 선택해 주세요.',
    draft: {
      requestId,
      reply: '배경 이미지를 선택하면 오디오 길이에 맞춰 이미지와 오디오 레이어를 생성합니다.',
      audioAssetId: audio.assetId,
      ...(titleText ? { titleText } : {}),
      ...(titlePlacement ? { titlePlacement } : {}),
      candidates,
    },
  };
}

function logAiChatTrace(
  title: string,
  payload: Record<string, unknown>,
  level: 'log' | 'warn' | 'error' = 'log',
): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.groupCollapsed(`[AI Assistant] ${title}`);
  if (level === 'warn') {
    console.warn(payload);
  } else if (level === 'error') {
    console.error(payload);
  } else {
    console.log(payload);
  }
  console.groupEnd();
}

function buildEditorContext(): AiChatEditorContext {
  const studioState = useStudioStore.getState();
  const assetsState = useProjectAssetsStore.getState();
  return buildAiEditorContext({
    assets: assetsState.assets,
    selectedAssetId: null,
    studioState,
    includeProductContextPacks: true,
  });
}

async function startAiChatRequest(params: {
  requestId: string;
  phase: AiChatWorkflowPhase;
  messages: AiChatConversationMessage[];
  editorContext: AiChatEditorContext;
  assistantMessageId: string;
}): Promise<boolean> {
  const { requestId, phase, messages, editorContext, assistantMessageId } = params;

  activeRequestId = requestId;
  activeAssistantMessageId = assistantMessageId;
  activeWorkflowPhase = phase;
  activeRequestDebugContext = {
    requestId,
    phase,
    messages,
    editorContext,
  };

  logAiChatTrace('요청 시작', {
    requestId,
    phase,
    editorContext,
    messages,
  });

  const aiChatApi = typeof window !== 'undefined' ? window.api?.aiChat : undefined;
  if (!aiChatApi?.start) {
    if (activeRequestId === requestId) {
      logAiChatTrace(
        '브리지 누락',
        {
          requestId,
          phase,
          request: activeRequestDebugContext,
        },
        'error',
      );
      removeAssistantPlaceholder(assistantMessageId);
      toast.error(translate('ai.requestUnavailable'), {
        message: 'Preload AI bridge가 준비되지 않았습니다.',
      });
      resetActiveRequestState();
    }
    return false;
  }

  try {
    const result = await aiChatApi.start({
      requestId,
      phase,
      messages,
      editorContext,
    });

    if (activeRequestId !== requestId) {
      return false;
    }

    if (!result.success) {
      logAiChatTrace(
        '요청 실패',
        {
          requestId,
          phase,
          error: result.error ?? 'Ollama 요청을 시작할 수 없습니다.',
          request: activeRequestDebugContext,
        },
        'error',
      );
      removeAssistantPlaceholder(assistantMessageId);
      toast.error(translate('ai.requestFailed'), {
        message: result.error ?? 'Ollama 요청을 시작할 수 없습니다.',
      });
      resetActiveRequestState();
      return false;
    }

    return true;
  } catch (error) {
    if (activeRequestId === requestId) {
      logAiChatTrace(
        '요청 예외',
        {
          requestId,
          phase,
          error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
          request: activeRequestDebugContext,
        },
        'error',
      );
      removeAssistantPlaceholder(assistantMessageId);
      toast.error(translate('ai.requestFailed'), {
        message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      });
      resetActiveRequestState();
    }

    return false;
  }
}

async function applyPendingExecutionPlan(): Promise<void> {
  const pendingExecution = useAiChatStore.getState().pendingExecution;
  if (!pendingExecution) {
    return;
  }

  useAiChatStore.setState((state) => ({
    pendingExecution: state.pendingExecution
      ? { ...state.pendingExecution, status: 'executing', error: undefined }
      : null,
  }));

  const result = await executeAiActionPlan({
    reply: pendingExecution.reply,
    actions: pendingExecution.actions,
  });

  if (result.success) {
    useAiChatStore.setState((state) => ({
      pendingExecution: state.pendingExecution
        ? {
            ...state.pendingExecution,
            status: 'success',
            createdLayerIds: result.createdLayerIds,
            error: undefined,
          }
        : null,
    }));
    return;
  }

  useAiChatStore.setState((state) => ({
    pendingExecution: state.pendingExecution
      ? {
          ...state.pendingExecution,
          status: 'error',
          error: result.error ?? 'AI edit execution failed.',
        }
      : null,
  }));
}

function handleAiChatEvent(event: AiChatEvent): void {
  const currentRequestId = activeRequestId;
  const currentAssistantMessageId = activeAssistantMessageId;
  const requestDebugContext = activeRequestDebugContext;

  if (!currentRequestId || event.requestId !== currentRequestId) {
    return;
  }

  if (!currentAssistantMessageId) {
    if (event.type === 'done' || event.type === 'error') {
      useAiChatStore.setState({ isGenerating: false });
      resetActiveRequestState();
    }
    return;
  }

  if (event.type === 'delta') {
    if (activeWorkflowPhase === 'executor') {
      return;
    }

    if (event.delta.length === 0) {
      return;
    }

    updateAssistantMessage(currentAssistantMessageId, (message) => ({
      ...message,
      content: `${message.content}${event.delta}`,
    }));
    return;
  }

  if (event.type === 'done') {
    logAiChatTrace('응답 수신', {
      requestId: currentRequestId,
      phase: activeWorkflowPhase,
      response: event.content,
      request: requestDebugContext,
    });

    if (activeWorkflowPhase === 'planner') {
      const parsed = parseAiPlannerResponse(event.content);
      const plannerReply = parsed.reply.length > 0 ? parsed.reply : event.content.trim();

      updateAssistantMessage(currentAssistantMessageId, (message) => ({
        ...message,
        content: plannerReply,
        timestamp: Date.now(),
      }));

      useAiChatStore.setState({
        assetRecommendation: parsed.recommendation,
      });

      if (parsed.mode === 'EDIT_PLAN') {
        const executorHistory = toConversationHistory(useAiChatStore.getState().messages);
        const executorAssistantMessage = appendAssistantMessage('');
        const executorRequestId = createAiChatId('ai-chat-request');
        const editorContext = buildEditorContext();

        void startAiChatRequest({
          requestId: executorRequestId,
          phase: 'executor',
          messages: executorHistory,
          editorContext,
          assistantMessageId: executorAssistantMessage.id,
        });
        return;
      }

      useAiChatStore.setState({ isGenerating: false });
      resetActiveRequestState();
      return;
    }

    const parsed = parseAiAssistantResponse(event.content);
    const hadExecutableActions = parsed.actions.length > 0;
    const isTimelineSeekOnly = isTimelineSeekOnlyPlan(parsed.actions);
    const assistantReply = getAssistantReplyForParsedPlan(parsed.actions, parsed.reply);

    updateAssistantMessage(currentAssistantMessageId, (message) => ({
      ...message,
      content: assistantReply,
      timestamp: Date.now(),
    }));

    if (isTimelineSeekOnly) {
      useAiChatStore.setState({ isGenerating: false, pendingExecution: null });
      resetActiveRequestState();

      void executeAiActionPlan({
        reply: parsed.reply,
        actions: parsed.actions,
      });
      return;
    }

    useAiChatStore.setState({
      isGenerating: false,
      pendingExecution: hadExecutableActions
        ? {
            requestId: currentRequestId,
            reply: parsed.reply,
            actions: parsed.actions,
            status: 'ready',
            createdLayerIds: [],
          }
        : null,
    });

    resetActiveRequestState();

    if (hadExecutableActions) {
      const autoApply = useAiChatStore.getState().autoApplyEdits;
      if (autoApply) {
        void useAiChatStore.getState().applyPendingExecution();
      } else if (parsed.parseError) {
        logAiChatTrace(
          '응답 형식 경고',
          {
            requestId: currentRequestId,
            phase: activeWorkflowPhase,
            parseError: parsed.parseError,
            response: event.content,
            request: requestDebugContext,
          },
          'warn',
        );
        toast.warning(translate('ai.parseWarning'), {
          message: parsed.parseError,
        });
      }
    } else if (parsed.parseError) {
      logAiChatTrace(
        '응답 형식 오류',
        {
          requestId: currentRequestId,
          phase: activeWorkflowPhase,
          parseError: parsed.parseError,
          response: event.content,
          request: requestDebugContext,
        },
        'error',
      );
      toast.warning(translate('ai.responseFormatError'), {
        message: parsed.parseError,
      });
    }
    return;
  }

  removeAssistantPlaceholder(currentAssistantMessageId);
  logAiChatTrace(
    '스트리밍 오류',
    {
      requestId: currentRequestId,
      phase: activeWorkflowPhase,
      error: event.error,
      request: requestDebugContext,
    },
    'error',
  );
  toast.error(translate('ai.connectionFailed'), {
    message: event.error,
  });
  resetActiveRequestState();
}

function ensureBridgeListener(): void {
  if (isBridgeListenerRegistered || typeof window === 'undefined') {
    return;
  }

  const aiChatApi = window.api?.aiChat;
  if (!aiChatApi?.onEvent) {
    return;
  }

  bridgeListenerUnsubscribe = aiChatApi.onEvent(handleAiChatEvent);
  isBridgeListenerRegistered = true;
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  messages: [],
  isGenerating: false,
  pendingExecution: null,
  assetRecommendation: null,
  workflowDraft: null,
  autoApplyEdits: false,

  sendMessage: async (content: string, attachments: AiChatAttachment[] = []) => {
    const trimmedContent = normalizeAiChatPrompt(content);
    if (!trimmedContent || get().isGenerating) {
      return;
    }

    ensureBridgeListener();

    const baseMessages = get().messages;
    const userMessage = createMessage('user', trimmedContent, attachments);
    const assistantMessage = createMessage('assistant', '');
    const workflowDraft = buildWorkflowDraft({ content: trimmedContent, attachments });

    if (workflowDraft) {
      set((state) => ({
        messages: [
          ...state.messages,
          userMessage,
          {
            ...assistantMessage,
            content: workflowDraft.reply,
          },
        ],
        isGenerating: false,
        pendingExecution: workflowDraft.pendingExecution,
        assetRecommendation: null,
        workflowDraft: workflowDraft.draft,
      }));
      return;
    }

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isGenerating: true,
      pendingExecution: null,
      assetRecommendation: null,
      workflowDraft: null,
    }));

    const plannerRequestId = createAiChatId('ai-chat-request');
    const plannerHistory = toConversationHistory([...baseMessages, userMessage]);

    await startAiChatRequest({
      requestId: plannerRequestId,
      phase: 'planner',
      messages: plannerHistory,
      editorContext: buildEditorContext(),
      assistantMessageId: assistantMessage.id,
    });
  },

  chooseWorkflowBackground: (backgroundImageAssetId: string) => {
    const draft = get().workflowDraft;
    if (!draft) {
      return;
    }

    const selectedCandidate = draft.candidates.find(
      (candidate) => candidate.assetId === backgroundImageAssetId,
    );
    const reply = selectedCandidate
      ? `${selectedCandidate.title}을 배경으로 workflow 계획을 준비했습니다.`
      : '선택한 배경으로 workflow 계획을 준비했습니다.';

    set({
      workflowDraft: null,
      pendingExecution: {
        requestId: draft.requestId,
        reply,
        actions: [
          {
            type: 'RUN_WORKFLOW',
            workflowId: 'audio-visual-draft',
            assetBindings: { audio: draft.audioAssetId, image: backgroundImageAssetId },
            fieldValues: {
              ...(draft.titleText ? { titleText: draft.titleText } : {}),
              ...(draft.titlePlacement ? { titlePlacement: draft.titlePlacement } : {}),
            },
          },
        ],
        status: 'ready',
        createdLayerIds: [],
      },
    });
  },

  applyPendingExecution: async () => {
    const state = useAiChatStore.getState();
    if (!state.pendingExecution || state.pendingExecution.status === 'executing') {
      return;
    }

    await applyPendingExecutionPlan();
  },

  cancelPendingExecution: () => {
    useAiChatStore.setState({ pendingExecution: null });
  },

  setAutoApplyEdits: (value: boolean) => {
    useAiChatStore.setState({ autoApplyEdits: value });
  },

  clearChat: () => {
    const requestId = activeRequestId;
    activeRequestId = null;
    activeAssistantMessageId = null;
    activeWorkflowPhase = null;
    activeRequestDebugContext = null;

    if (requestId && typeof window !== 'undefined') {
      const aiChatApi = window.api?.aiChat;
      if (aiChatApi?.cancel) {
        void aiChatApi.cancel(requestId);
      }
    }

    set({
      messages: [],
      isGenerating: false,
      pendingExecution: null,
      assetRecommendation: null,
      workflowDraft: null,
    });
  },
}));

ensureBridgeListener();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    bridgeListenerUnsubscribe?.();
    bridgeListenerUnsubscribe = null;
    isBridgeListenerRegistered = false;
  });
}
