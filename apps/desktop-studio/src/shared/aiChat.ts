import type {
  ILayerManifest,
  IRemoveLayerIntent,
  IReorderLayerIntent,
  IToggleVisibilityIntent,
  IUpdateLayerPropsIntent,
  IUpdateTransformIntent,
} from '@rendium/engine';

export const AI_MODEL_NAME = 'gemma4:26b-a4b-it-q4_K_M' as const;
export const OPENAI_DEFAULT_MODEL_NAME = 'gpt-5.4-mini' as const;

export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434' as const;
export const OLLAMA_CHAT_ENDPOINT = '/api/chat' as const;

export const AI_CHAT_CHANNELS = {
  start: 'ai-chat:start',
  cancel: 'ai-chat:cancel',
  event: 'ai-chat:event',
  getSettings: 'ai-chat:get-settings',
  updateSettings: 'ai-chat:update-settings',
} as const;

export type AiChatProviderKind = 'openai' | 'ollama';

export interface AiChatSettingsView {
  provider: AiChatProviderKind;
  openAiModel: string;
  hasOpenAiApiKey: boolean;
  ollamaHost: string;
  ollamaModel: string;
}

export interface AiChatSettingsUpdate {
  provider?: AiChatProviderKind;
  openAiApiKey?: string;
  clearOpenAiApiKey?: boolean;
  openAiModel?: string;
  ollamaHost?: string;
  ollamaModel?: string;
}

export interface AiChatSettingsResult {
  success: boolean;
  settings?: AiChatSettingsView;
  error?: string;
}

export type AiChatRole = 'user' | 'assistant';
export type AiChatTranscriptRole = AiChatRole | 'system';

export type AiAssetStatus = 'pending_metadata' | 'ready' | 'needs_attention' | 'missing';
export type AiAssetKind = 'image' | 'audio' | 'video';
export type AiAudioMood = 'calm' | 'balanced' | 'energetic';

export interface AiAssetSummaryItem {
  id: string;
  displayName: string;
  assetKind: AiAssetKind;
  status: AiAssetStatus;
  usageCount: number;
  description: string;
  tags: string[];
  durationSeconds: number | null;
  audioMood: AiAudioMood | null;
  sourceUrlAvailable: boolean;
}

export interface AiAssetSummary {
  total: number;
  ready: number;
  missing: number;
  pendingMetadata: number;
  needsAttention: number;
  selectedAssetId: string | null;
  recentAssets: AiAssetSummaryItem[];
}

export type AiProductContextPurpose =
  | 'image-placement'
  | 'workflow-draft'
  | 'text-insertion'
  | 'selected-text-editing';

export type AiProductCommandType =
  | 'ADD_IMAGE_ASSET_TO_TIMELINE'
  | 'RUN_WORKFLOW'
  | 'ADD_TITLE_TEXT'
  | 'ADD_CAPTION_TEXT'
  | 'UPDATE_SELECTED_TEXT_STYLE';

export interface AiProductCommandDescriptor {
  type: AiProductCommandType;
  requiredArgs: string[];
  optionalArgs: string[];
}

export interface AiProductContextPack {
  purpose: AiProductContextPurpose;
  summaryMarkdown: string;
  availableCommands: AiProductCommandDescriptor[];
  constraints: string[];
  data: {
    projectContentEnd: number;
    validScopes: Array<{
      id: string;
      role: 'main' | 'overlay' | 'text';
      preferred: boolean;
    }>;
    readyImageAssetIds: string[];
    readyAudioAssetIds?: string[];
    selectedAssetId: string | null;
    selectedTextLayerId?: string | null;
  };
}

export interface AiChatAttachment {
  assetId: string;
  assetKind: AiAssetKind;
  displayName: string;
  status: AiAssetStatus;
  mimeType: string;
  sourceUrlAvailable: boolean;
  durationSeconds?: number | null;
  audioAnalysis?: {
    energy: number;
    mood: AiAudioMood;
  } | null;
  description: string;
  tags: string[];
  subject?: string;
  mood?: string;
  usageHint?: string;
}

export interface AiAssetRecommendationCandidate {
  assetId?: string;
  title: string;
  reason: string;
  suggestedTags?: string[];
  prompt?: string;
}

export interface AiAssetRecommendationEnvelope {
  reply: string;
  candidates: AiAssetRecommendationCandidate[];
  uploadCta?: string;
  promptSuggestion?: string;
}

export interface AiAssetMetadataSuggestion {
  description: string;
  tags: string[];
  subject?: string;
  mood?: string;
  usageHint?: string;
}

export interface AiChatConversationMessage {
  role: AiChatRole;
  content: string;
  images?: string[];
  attachments?: AiChatAttachment[];
}

export interface AiChatEditorContext {
  canvasWidth: number;
  canvasHeight: number;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  selectedLayerType: string | null;
  selectedLayerName: string | null;
  selectionCount: number;
  layerCount: number;
  visibleLayerCount: number;
  projectName: string;
  assetSummary?: AiAssetSummary;
  productContextPacks?: AiProductContextPack[];
}

export interface AiChatTranscriptMessage {
  role: AiChatTranscriptRole;
  content: string;
  images?: string[];
}

export interface AiChatStartRequest {
  requestId: string;
  messages: AiChatConversationMessage[];
  editorContext?: AiChatEditorContext;
  phase?: AiChatWorkflowPhase;
}

export interface AiChatStartResult {
  success: boolean;
  error?: string;
}

export interface AiChatCancelResult {
  success: boolean;
  error?: string;
}

export type AiChatEvent =
  | {
      type: 'delta';
      requestId: string;
      delta: string;
    }
  | {
      type: 'done';
      requestId: string;
      content: string;
    }
  | {
      type: 'error';
      requestId: string;
      error: string;
    };

export const AI_ASSISTANT_ACTION_KINDS = [
  'ADD_LAYER',
  'UPDATE_LAYER_PROPS',
  'UPDATE_TRANSFORM',
  'TOGGLE_VISIBILITY',
  'REORDER_LAYER',
  'REMOVE_LAYER',
  'SEEK_TIMELINE',
  'ADD_IMAGE_ASSET_TO_TIMELINE',
  'RUN_WORKFLOW',
  'ADD_TITLE_TEXT',
  'ADD_CAPTION_TEXT',
  'UPDATE_SELECTED_TEXT_STYLE',
] as const;

export type AiAssistantActionKind = (typeof AI_ASSISTANT_ACTION_KINDS)[number];
export type AiChatWorkflowPhase = 'planner' | 'executor' | 'asset-metadata';

export interface AiAddLayerAction {
  type: 'ADD_LAYER';
  targetScopeId?: string;
  manifest: Partial<ILayerManifest>;
}

export type AiUpdateLayerAction = IUpdateLayerPropsIntent;
export type AiUpdateTransformAction = IUpdateTransformIntent;
export type AiToggleVisibilityAction = IToggleVisibilityIntent;
export type AiReorderLayerAction = IReorderLayerIntent;
export type AiRemoveLayerAction = IRemoveLayerIntent;
export interface AiSeekTimelineAction {
  type: 'SEEK_TIMELINE';
  timeSeconds: number;
}

export interface AiAddImageAssetToTimelineAction {
  type: 'ADD_IMAGE_ASSET_TO_TIMELINE';
  assetId: string;
  placement: 'start' | 'end';
  durationSeconds: number;
  fit?: 'cover' | 'contain';
  scopeRole?: 'main' | 'overlay';
}

export interface AiRunWorkflowAction {
  type: 'RUN_WORKFLOW';
  workflowId: string;
  presetId?: string;
  assetBindings: Partial<Record<'audio' | 'image', string>>;
  fieldValues?: Record<string, string>;
}

export interface AiAddTitleTextAction {
  type: 'ADD_TITLE_TEXT';
  text: string;
  placement?: 'center' | 'top' | 'bottom';
  durationSeconds?: number;
  startTime?: number;
}

export interface AiAddCaptionTextAction {
  type: 'ADD_CAPTION_TEXT';
  text: string;
  placement?: 'center' | 'top' | 'bottom';
  durationSeconds?: number;
  startTime?: number;
}

export interface AiUpdateSelectedTextStyleAction {
  type: 'UPDATE_SELECTED_TEXT_STYLE';
  patch: Record<string, unknown>;
}

export type AiAssistantAction =
  | AiAddLayerAction
  | AiUpdateLayerAction
  | AiUpdateTransformAction
  | AiToggleVisibilityAction
  | AiReorderLayerAction
  | AiRemoveLayerAction
  | AiSeekTimelineAction
  | AiAddImageAssetToTimelineAction
  | AiRunWorkflowAction
  | AiAddTitleTextAction
  | AiAddCaptionTextAction
  | AiUpdateSelectedTextStyleAction;

export interface AiAssistantActionPlan {
  reply: string;
  actions: AiAssistantAction[];
}

export function normalizeAiChatPrompt(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

export interface BuildOllamaChatMessagesInput {
  messages: AiChatConversationMessage[];
  editorContext?: AiChatEditorContext;
  phase?: AiChatWorkflowPhase;
}

export function buildOllamaChatMessages(
  input: BuildOllamaChatMessagesInput,
): AiChatTranscriptMessage[] {
  return buildAiChatTranscriptMessages(input);
}

export function buildAiChatTranscriptMessages(
  input: BuildOllamaChatMessagesInput,
): AiChatTranscriptMessage[] {
  const { messages, editorContext, phase = 'executor' } = input;
  const normalizedMessages = messages
    .map((message) => ({
      role: message.role,
      content:
        message.role === 'user'
          ? appendAttachmentContext(normalizeAiChatPrompt(message.content), message.attachments)
          : message.content,
      ...(message.images && message.images.length > 0 ? { images: message.images } : {}),
    }))
    .filter((message) => message.content.trim().length > 0 || Boolean(message.images?.length));

  return [
    {
      role: 'system',
      content:
        phase === 'planner'
          ? buildPlannerSystemPrompt(editorContext)
          : phase === 'asset-metadata'
            ? buildAssetMetadataSystemPrompt(editorContext)
            : buildExecutorSystemPrompt(editorContext),
    },
    ...normalizedMessages,
  ];
}

export function createAiChatId(prefix = 'ai-chat'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildPlannerSystemPrompt(editorContext?: AiChatEditorContext): string {
  const contextLines: string[] = [];

  if (editorContext) {
    contextLines.push(
      `현재 캔버스는 ${editorContext.canvasWidth}x${editorContext.canvasHeight}이고, 프로젝트 이름은 "${editorContext.projectName}"입니다.`,
      `선택된 레이어는 ${describeMaybeNull(editorContext.selectedLayerId)} / label=${describeMaybeNull(editorContext.selectedLayerType)} / name=${describeMaybeNull(editorContext.selectedLayerName)} 입니다.`,
      `현재 선택 개수는 ${editorContext.selectionCount}개이고, 선택 ID 목록은 ${describeIdList(editorContext.selectedLayerIds)} 입니다.`,
      `레이어 개수는 ${editorContext.layerCount}개이며, 현재 보이는 레이어는 ${editorContext.visibleLayerCount}개입니다.`,
    );

    if (editorContext.assetSummary) {
      const summary = editorContext.assetSummary;
      contextLines.push(
        `프로젝트 자산은 총 ${summary.total}개이며, ready ${summary.ready}개, missing ${summary.missing}개, pending_metadata ${summary.pendingMetadata}개, needs_attention ${summary.needsAttention}개입니다.`,
        `최근 자산 후보는 ${describeAssetSummaryItems(summary.recentAssets)} 입니다.`,
        `현재 선택된 자산은 ${describeMaybeNull(summary.selectedAssetId)} 입니다.`,
      );
    }

    contextLines.push(...describeProductContextPacks(editorContext.productContextPacks));
  }

  return [
    '당신은 Rendium Studio의 내부 AI 편집 플래너입니다.',
    '사용자 요청을 보고, 현재 제공되는 편집 기능만 조합해서 가능한 작업 계획을 세우세요.',
    '출력 형식은 반드시 사람에게 읽히는 짧은 한국어이며, 첫 줄에는 MODE: EDIT_PLAN, MODE: ANSWER_ONLY, 또는 MODE: UNSUPPORTED 중 하나를 정확히 적으세요.',
    'MODE: EDIT_PLAN일 때만 다음 줄부터 짧은 계획을 설명하고, JSON 코드블록이나 액션 JSON은 절대 쓰지 마세요.',
    '타임라인 점프나 특정 시점 이동 요청도 실행 가능한 작업으로 보고 MODE: EDIT_PLAN을 사용하세요.',
    '현재 선택 개수(selectionCount)가 0인데 사용자 요청이 선택된 레이어를 전제로 한다면, 편집 계획을 만들지 말고 MODE: ANSWER_ONLY로 먼저 레이어 선택이 필요하다고 안내하세요.',
    '편집이 아닌 질문이면 MODE: ANSWER_ONLY를 사용하고 답변만 적으세요.',
    '제공 기능으로 해결할 수 없는 편집 요청이면 MODE: UNSUPPORTED를 사용하고 이유를 간단히 설명하세요.',
    '이미지, 배경, 텍스처, 자산 추천을 묻는 질문이면 간결한 답변 뒤에 반드시 JSON 코드블록 하나를 추가해 AiAssetRecommendationEnvelope를 반환하세요.',
    '사용자 메시지에 첨부 자산이 있으면 해당 assetId, 이름, 메타데이터를 우선 근거로 삼고, 편집 계획이나 추천 후보에서 프로젝트 자산을 언급할 때 assetId를 정확히 적으세요.',
    '첨부 이미지나 프로젝트 이미지 자산을 영상 끝/타임라인 끝에 배치하는 편집 요청은 실행 가능한 작업으로 보고 MODE: EDIT_PLAN을 사용하세요.',
    '오디오와 이미지 자산으로 workflow 초안을 만들거나 제목/자막 텍스트를 넣는 요청도 실행 가능한 작업으로 보고 MODE: EDIT_PLAN을 사용하세요.',
    '추천 JSON에는 reply 문자열과 candidates 배열을 넣으세요.',
    'candidates는 최대 3개까지 제안하고, 프로젝트 자산을 추천할 때는 assetId를 정확히 적으세요.',
    '적절한 기존 자산이 없으면 candidates는 빈 배열로 두고 uploadCta와 promptSuggestion만 제안하세요.',
    `현재 사용할 수 있는 편집 기능은 ${AI_ASSISTANT_ACTION_KINDS.join(', ')} 입니다.`,
    '사용자: "12.5초 지점으로 이동해줘"',
    'assistant: "MODE: EDIT_PLAN\\n12.5초 지점으로 이동하겠습니다."',
    ...contextLines,
  ].join(' ');
}

function buildAssetMetadataSystemPrompt(editorContext?: AiChatEditorContext): string {
  const contextLines: string[] = [];

  if (editorContext?.assetSummary) {
    contextLines.push(
      `프로젝트 자산 요약: 총 ${editorContext.assetSummary.total}개, ready ${editorContext.assetSummary.ready}개, missing ${editorContext.assetSummary.missing}개, pending_metadata ${editorContext.assetSummary.pendingMetadata}개, needs_attention ${editorContext.assetSummary.needsAttention}개.`,
      `최근 자산: ${describeAssetSummaryItems(editorContext.assetSummary.recentAssets)}.`,
    );
  }

  return [
    '당신은 Rendium Studio의 자산 메타데이터 생성기입니다.',
    '주어진 이미지 한 장을 보고 프로젝트 검색에 도움이 되는 간결한 메타데이터만 생성하세요.',
    '반드시 마지막에 JSON 코드블록 하나만 출력하고, 그 JSON에는 description, tags, subject, mood, usageHint 필드를 넣으세요.',
    'description은 1~2문장으로 짧고 구체적으로 작성하세요.',
    'tags는 3~8개의 짧은 키워드 배열로 작성하세요.',
    'subject, mood, usageHint는 가능할 때만 채우고, 확신이 없으면 빈 문자열을 사용하세요.',
    '추가 설명이나 사과 문구는 쓰지 마세요.',
    ...contextLines,
  ].join(' ');
}

function buildExecutorSystemPrompt(editorContext?: AiChatEditorContext): string {
  const contextLines: string[] = [];

  if (editorContext) {
    contextLines.push(
      `현재 캔버스는 ${editorContext.canvasWidth}x${editorContext.canvasHeight}이고, 프로젝트 이름은 "${editorContext.projectName}"입니다.`,
      `선택된 레이어는 ${describeMaybeNull(editorContext.selectedLayerId)} / label=${describeMaybeNull(editorContext.selectedLayerType)} / name=${describeMaybeNull(editorContext.selectedLayerName)} 입니다.`,
      `현재 선택 개수는 ${editorContext.selectionCount}개이고, 선택 ID 목록은 ${describeIdList(editorContext.selectedLayerIds)} 입니다.`,
      `레이어 개수는 ${editorContext.layerCount}개이며, 현재 보이는 레이어는 ${editorContext.visibleLayerCount}개입니다.`,
    );

    contextLines.push(...describeProductContextPacks(editorContext.productContextPacks));
  }

  return [
    '당신은 Rendium Studio의 내부 AI 실행 변환기입니다.',
    '이 단계에서는 이전 플래너의 계획과 사용자 요청을 바탕으로, 엔진이 바로 실행할 수 있는 표준 JSON만 출력하세요.',
    '절대 HTML, CSS, Flutter, React Native 같은 예시 코드를 제공하지 마세요.',
    '절대 "현재 프레임워크를 알 수 없어..." 같은 회피 답변을 하지 마세요.',
    '사용자의 요청이 편집 동작이면, 반드시 실행 가능한 액션 계획으로 변환하세요.',
    '사람이 읽는 짧은 한국어 1~2문장을 먼저 쓰고, 그 다음 줄에 JSON 코드블록을 하나만 붙이세요.',
    '반드시 응답의 마지막에 JSON 코드블록 하나를 추가하고, 그 안에는 reply 문자열과 actions 배열만 넣으세요.',
    'JSON 코드블록 외에는 어떤 코드블록도 쓰지 마세요.',
    `actions 배열에는 허용된 편집 액션만 넣으세요. 허용 type: ${AI_ASSISTANT_ACTION_KINDS.join(', ')}.`,
    '새 레이어를 추가할 때는 ADD_LAYER를 사용하고, manifest는 canonical kind/source/control shape만 사용하세요.',
    '첨부 이미지나 프로젝트 이미지 자산을 영상 끝/타임라인 끝에 배치할 때는 ADD_LAYER가 아니라 ADD_IMAGE_ASSET_TO_TIMELINE을 사용하세요.',
    'ADD_IMAGE_ASSET_TO_TIMELINE은 assetId, placement:"start" 또는 "end", durationSeconds, fit:"cover"를 사용하세요. 인트로/시작 부분은 placement:"start"입니다.',
    '오디오와 이미지 자산으로 편집 가능한 초안을 만들 때는 RUN_WORKFLOW를 사용하세요.',
    'RUN_WORKFLOW는 workflowId:"audio-visual-draft", assetBindings:{audio,image}, fieldValues:{titleText,titlePlacement} 형태로 쓰세요.',
    '제목이나 자막 텍스트를 추가할 때는 raw ADD_LAYER 대신 ADD_TITLE_TEXT 또는 ADD_CAPTION_TEXT를 사용하세요.',
    '선택된 텍스트 레이어의 문구나 스타일을 바꿀 때는 UPDATE_SELECTED_TEXT_STYLE을 사용하세요. 흰색은 color:[1,1,1,1], 외곽선은 outlineWidth:2와 outlineColor:[0,0,0,1]처럼 구체적인 patch로 쓰세요.',
    'ADD_LAYER에는 insertAtIndex를 쓰지 말고, action.targetScopeId로만 scope를 지정하세요.',
    'ADD_LAYER targetScopeId에는 canvas, main, overlay 같은 임의 문자열을 절대 쓰지 마세요. 실제 scope:start layer id를 모르면 targetScopeId를 생략하세요.',
    'UPDATE_LAYER_PROPS, UPDATE_TRANSFORM, TOGGLE_VISIBILITY, REORDER_LAYER, REMOVE_LAYER는 반드시 layerId를 사용하세요. targetScopeId는 ADD_LAYER에서만 사용하세요.',
    '타임라인 이동이 필요하면 SEEK_TIMELINE을 사용하고, timeSeconds에 초 단위를 넣으세요. JUMP_TO_TIME라는 표현이 떠오르더라도 최종 JSON에는 SEEK_TIMELINE만 쓰세요.',
    '각 action은 type 필드를 사용해야 하며, ADD_LAYER manifest 안에는 kind 필드를 반드시 넣으세요.',
    '위치, 크기, 회전은 반드시 transform.position, transform.scale, transform.rotation 또는 UPDATE_TRANSFORM의 position, scale, rotation 필드로만 표현하세요. x/y, scaleX/scaleY 같은 축약형은 쓰지 마세요.',
    '실행이 필요 없는 질문이면 actions는 빈 배열로 두세요. 편집 요청인데 actions가 비어 있으면 안 됩니다.',
    '사용자 메시지에 첨부 자산이 있으면 해당 assetId, 이름, 메타데이터를 우선 근거로 삼고, 첨부 자산을 레이어로 추가하거나 참조할 때는 자산의 assetId와 sourceUrlAvailable 상태를 유지하세요.',
    'ADD_LAYER는 새 레이어를 생성하는 의미입니다.',
    'ADD_TITLE_TEXT와 ADD_CAPTION_TEXT는 text, placement, durationSeconds, startTime만 넣고 scope id나 manifest는 만들지 마세요.',
    '타임라인 이동 액션은 가능하면 actions 배열의 마지막에 두세요.',
    '크게/작게/빨간색 같은 스타일 힌트는 가능한 한 구체적인 source.params 값으로 변환하세요.',
    '아래 예시는 반드시 같은 형식으로 따르세요.',
    '사용자: "제목을 화면 중앙에 추가해줘"',
    'assistant reply: "화면 중앙에 제목 텍스트를 추가하겠습니다."',
    'assistant JSON: {"reply":"화면 중앙에 제목 텍스트를 추가하겠습니다.","actions":[{"type":"ADD_TITLE_TEXT","text":"제목","placement":"center","durationSeconds":5}]}',
    '사용자: "12.5초 지점으로 이동해줘"',
    'assistant reply: "12.5초 지점으로 이동하겠습니다."',
    'assistant JSON: {"reply":"12.5초 지점으로 이동하겠습니다.","actions":[{"type":"SEEK_TIMELINE","timeSeconds":12.5}]}',
    ...contextLines,
  ].join(' ');
}

function appendAttachmentContext(content: string, attachments?: AiChatAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return content;
  }

  const attachmentLines = attachments.map((attachment, index) => {
    const metadata = [
      `kind=${attachment.assetKind}`,
      attachment.description ? `description=${attachment.description}` : '',
      attachment.tags.length > 0 ? `tags=${attachment.tags.join(', ')}` : '',
      attachment.subject ? `subject=${attachment.subject}` : '',
      attachment.mood ? `mood=${attachment.mood}` : '',
      attachment.usageHint ? `usageHint=${attachment.usageHint}` : '',
      attachment.durationSeconds ? `durationSeconds=${attachment.durationSeconds}` : '',
      attachment.audioAnalysis
        ? `audioMood=${attachment.audioAnalysis.mood}; audioEnergy=${attachment.audioAnalysis.energy}`
        : '',
    ]
      .filter(Boolean)
      .join('; ');

    return [
      `${index + 1}. assetId=${attachment.assetId}`,
      `name="${attachment.displayName}"`,
      `kind=${attachment.assetKind}`,
      `status=${attachment.status}`,
      `mimeType=${attachment.mimeType}`,
      `sourceUrlAvailable=${attachment.sourceUrlAvailable ? 'yes' : 'no'}`,
      metadata ? `metadata: ${metadata}` : 'metadata: empty',
    ].join(', ');
  });

  return [content, '', '첨부 자산:', ...attachmentLines].join('\n');
}

function describeMaybeNull(value: string | null): string {
  return value && value.length > 0 ? value : 'none';
}

function describeIdList(ids: string[]): string {
  return ids.length > 0 ? ids.join(', ') : 'none';
}

function describeAssetSummaryItems(items: AiAssetSummaryItem[]): string {
  if (items.length === 0) {
    return 'none';
  }

  return items
    .map((item) => {
      const tags = item.tags.length > 0 ? ` tags=${item.tags.join('|')}` : '';
      const description = item.description.length > 0 ? ` desc="${item.description}"` : '';
      const duration = item.durationSeconds ? ` duration=${item.durationSeconds}s` : '';
      const mood = item.audioMood ? ` audioMood=${item.audioMood}` : '';
      return `${item.id}(${item.displayName}; kind=${item.assetKind}; status=${item.status}; usage=${item.usageCount}${duration}${mood}${tags}${description})`;
    })
    .join(', ');
}

function describeProductContextPacks(packs?: AiProductContextPack[]): string[] {
  if (!packs || packs.length === 0) {
    return [];
  }

  return packs.map((pack) => {
    const commands = pack.availableCommands
      .map(
        (command) =>
          `${command.type}(required=${command.requiredArgs.join('|')}; optional=${command.optionalArgs.join('|')})`,
      )
      .join(', ');
    const validScopes =
      pack.data.validScopes.length > 0
        ? pack.data.validScopes
            .map((scope) => `${scope.id}:${scope.role}${scope.preferred ? ':preferred' : ''}`)
            .join(', ')
        : 'none';
    const readyImageAssetIds =
      pack.data.readyImageAssetIds.length > 0 ? pack.data.readyImageAssetIds.join(', ') : 'none';
    const readyAudioAssetIds =
      pack.data.readyAudioAssetIds && pack.data.readyAudioAssetIds.length > 0
        ? pack.data.readyAudioAssetIds.join(', ')
        : 'none';
    return [
      `Product Context Pack [${pack.purpose}]`,
      pack.summaryMarkdown,
      `projectContentEnd=${pack.data.projectContentEnd}`,
      `validScopes=${validScopes}`,
      `readyImageAssetIds=${readyImageAssetIds}`,
      `readyAudioAssetIds=${readyAudioAssetIds}`,
      `selectedAssetId=${describeMaybeNull(pack.data.selectedAssetId)}`,
      `selectedTextLayerId=${describeMaybeNull(pack.data.selectedTextLayerId ?? null)}`,
      `availableCommands=${commands || 'none'}`,
      `constraints=${pack.constraints.join(' | ') || 'none'}`,
    ].join('\n');
  });
}
