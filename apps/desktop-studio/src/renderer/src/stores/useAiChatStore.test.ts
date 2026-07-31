import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const start = vi.fn();
  const cancel = vi.fn();
  const onEventListeners: Array<(event: unknown) => void> = [];
  const getSnapshot = vi.fn(() => ({
    width: 1920,
    height: 1080,
    projectDuration: 12,
    layers: [{ id: 'layer-1' }, { id: 'layer-2' }],
  }));
  const getManifest = vi.fn(() => ({
    projectSettings: {
      canvas: {
        size: {
          width: 1920,
          height: 1080,
        },
      },
    },
    projectInfo: {
      name: 'Test Project',
    },
    layers: {
      'layer-1': {
        id: 'layer-1',
        kind: 'visual',
        name: 'Layer 1',
        startTime: 0,
        duration: 5,
        source: {
          sourceId: 'text:layer-1',
          provider: 'text',
          track: 'visual',
          params: { text: 'Layer 1' },
        },
      },
    },
    layerOrder: ['layer-1'],
  }));
  const getLayerById = vi.fn(() => ({ id: 'layer-1', name: 'Layer 1' }));
  const getParentSequenceStartLayer = vi.fn(() => undefined);
  const selectLayer = vi.fn();
  const executeAiActionPlan = vi.fn();
  const toastSuccess = vi.fn();
  const toastWarning = vi.fn();
  const toastError = vi.fn();
  const normalizeTransformFields = vi.fn(() => undefined);

  return {
    start,
    cancel,
    onEventListeners,
    getSnapshot,
    getManifest,
    getLayerById,
    getParentSequenceStartLayer,
    selectLayer,
    executeAiActionPlan,
    toastSuccess,
    toastWarning,
    toastError,
    normalizeTransformFields,
  };
});

vi.mock('@rendium/engine', () => ({
  engineStore: {
    getSnapshot: mocks.getSnapshot,
    getManifest: mocks.getManifest,
    getLayerById: mocks.getLayerById,
  },
  getParentSequenceStartLayer: mocks.getParentSequenceStartLayer,
  normalizeTransformFields: mocks.normalizeTransformFields,
}));

vi.mock('../ai/aiActionExecutor', () => ({
  executeAiActionPlan: mocks.executeAiActionPlan,
}));

vi.mock('../components/ToastSystem', () => ({
  toast: {
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
    error: mocks.toastError,
  },
}));

vi.mock('./studioStore', () => ({
  useStudioStore: {
    getState: () => ({
      selectedLayerId: 'layer-1',
      selectedLayerIds: ['layer-1'],
      selectLayer: mocks.selectLayer,
    }),
  },
}));

const aiChatApi = {
  start: mocks.start,
  cancel: mocks.cancel,
  onEvent: (listener: (event: unknown) => void) => {
    mocks.onEventListeners.push(listener);
    return () => {
      const index = mocks.onEventListeners.indexOf(listener);
      if (index >= 0) {
        mocks.onEventListeners.splice(index, 1);
      }
    };
  },
};

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

vi.stubGlobal('window', {
  localStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
  navigator: {
    language: 'en-US',
    platform: 'MacIntel',
  },
  api: {
    aiChat: aiChatApi,
  },
});

const { useAiChatStore } = await import('./useAiChatStore');

afterEach(() => {
  vi.clearAllMocks();
  useAiChatStore.setState({
    messages: [],
    isGenerating: false,
    pendingExecution: null,
    assetRecommendation: null,
    workflowDraft: null,
    autoApplyEdits: false,
  });
});

describe('useAiChatStore 2-step workflow', () => {
  it('runs planner then executor for edit requests', async () => {
    mocks.start.mockResolvedValue({ success: true });

    const sendMessagePromise = useAiChatStore.getState().sendMessage('텍스트를 중앙에 추가해줘');
    await sendMessagePromise;

    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: 'planner',
      }),
    );

    const plannerRequestId = mocks.start.mock.calls[0]?.[0]?.requestId as string;
    expect(plannerRequestId).toBeTruthy();

    const plannerListener = mocks.onEventListeners[0];
    expect(plannerListener).toBeTypeOf('function');

    plannerListener({
      type: 'delta',
      requestId: plannerRequestId,
      delta: 'MODE: EDIT_PLAN\n텍스트 레이어를 추가하고 중앙에 배치합니다.',
    });

    expect(useAiChatStore.getState().messages[1]?.content).toContain('MODE: EDIT_PLAN');

    plannerListener({
      type: 'done',
      requestId: plannerRequestId,
      content: 'MODE: EDIT_PLAN\n텍스트 레이어를 추가하고 중앙에 배치합니다.',
    });

    await flushPromises();

    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.start).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        phase: 'executor',
      }),
    );

    const executorRequestId = mocks.start.mock.calls[1]?.[0]?.requestId as string;
    expect(executorRequestId).toBeTruthy();

    const executorListener = mocks.onEventListeners[0];
    expect(executorListener).toBeTypeOf('function');

    executorListener({
      type: 'delta',
      requestId: executorRequestId,
      delta: [
        '```json',
        JSON.stringify({
          reply: '레이어를 추가하겠습니다.',
          actions: [
            {
              type: 'ADD_LAYER',
              manifest: {
                kind: 'visual',
                source: {
                  provider: 'text',
                  track: 'visual',
                  params: {
                    text: 'Hello Rendium',
                  },
                },
              },
            },
          ],
        }),
      ].join('\n'),
    });

    expect(useAiChatStore.getState().messages[2]?.content).toBe('');

    executorListener({
      type: 'done',
      requestId: executorRequestId,
      content: [
        '레이어를 추가하겠습니다.',
        '```json',
        JSON.stringify({
          reply: '레이어를 추가하겠습니다.',
          actions: [
            {
              type: 'ADD_LAYER',
              manifest: {
                kind: 'visual',
                source: {
                  provider: 'text',
                  track: 'visual',
                  params: {
                    text: 'Hello Rendium',
                  },
                },
              },
            },
          ],
        }),
        '```',
      ].join('\n'),
    });

    const state = useAiChatStore.getState();
    expect(state.pendingExecution).not.toBeNull();
    expect(state.pendingExecution?.actions).toHaveLength(1);
    expect(state.messages[2]?.content).toBe('레이어를 추가하겠습니다.');
    expect(state.isGenerating).toBe(false);
    expect(state.messages).toHaveLength(3);
  });

  it('stops after planner when the response is answer-only', async () => {
    mocks.start.mockResolvedValue({ success: true });

    await useAiChatStore.getState().sendMessage('현재 레이어가 몇 개인지 알려줘');

    const plannerRequestId = mocks.start.mock.calls[0]?.[0]?.requestId as string;
    const plannerListener = mocks.onEventListeners[0];

    plannerListener({
      type: 'done',
      requestId: plannerRequestId,
      content: 'MODE: ANSWER_ONLY\n현재는 2개의 레이어가 있습니다.',
    });

    await flushPromises();

    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(useAiChatStore.getState().isGenerating).toBe(false);
    expect(useAiChatStore.getState().pendingExecution).toBeNull();
    expect(useAiChatStore.getState().messages).toHaveLength(2);
  });

  it('passes message attachments through to planner requests', async () => {
    mocks.start.mockResolvedValue({ success: true });

    await useAiChatStore.getState().sendMessage('이 이미지를 배경으로 써줘', [
      {
        assetId: 'asset-123',
        assetKind: 'image',
        displayName: 'city.png',
        status: 'ready',
        mimeType: 'image/png',
        sourceUrlAvailable: true,
        description: 'A city skyline',
        tags: ['city'],
        subject: 'skyline',
        mood: 'bright',
        usageHint: 'background',
      },
    ]);

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'planner',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: '이 이미지를 배경으로 써줘',
            attachments: [
              expect.objectContaining({
                assetId: 'asset-123',
                displayName: 'city.png',
              }),
            ],
          }),
        ],
      }),
    );
  });

  it('prepares a deterministic workflow draft before asking the model', async () => {
    await useAiChatStore.getState().sendMessage('이 파일들로 workflow 만들어줘', [
      {
        assetId: 'image-1',
        assetKind: 'image',
        displayName: 'night.png',
        status: 'ready',
        mimeType: 'image/png',
        sourceUrlAvailable: true,
        description: '',
        tags: [],
        mood: 'dark',
        usageHint: 'background',
      },
      {
        assetId: 'image-2',
        assetKind: 'image',
        displayName: 'city.png',
        status: 'ready',
        mimeType: 'image/png',
        sourceUrlAvailable: true,
        description: '',
        tags: [],
      },
      {
        assetId: 'audio-1',
        assetKind: 'audio',
        displayName: 'song.mp3',
        status: 'ready',
        mimeType: 'audio/mpeg',
        sourceUrlAvailable: true,
        description: '',
        tags: [],
        durationSeconds: 180,
        audioAnalysis: {
          energy: 0.7,
          mood: 'energetic',
        },
      },
    ]);

    const state = useAiChatStore.getState();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(state.workflowDraft).toMatchObject({
      audioAssetId: 'audio-1',
      candidates: [
        expect.objectContaining({
          assetId: 'image-1',
        }),
        expect.objectContaining({
          assetId: 'image-2',
        }),
      ],
    });
    expect(state.pendingExecution).toBeNull();

    state.chooseWorkflowBackground('image-2');

    expect(useAiChatStore.getState().workflowDraft).toBeNull();
    expect(useAiChatStore.getState().pendingExecution).toMatchObject({
      actions: [
        {
          type: 'RUN_WORKFLOW',
          workflowId: 'audio-visual-draft',
          assetBindings: {
            audio: 'audio-1',
            image: 'image-2',
          },
        },
      ],
    });
  });

  it('executes timeline jumps immediately without creating a preview card', async () => {
    mocks.start.mockResolvedValue({ success: true });
    mocks.executeAiActionPlan.mockResolvedValue({
      success: true,
      createdLayerIds: [],
      executedIntents: [],
    });

    await useAiChatStore.getState().sendMessage('12.5초 지점으로 이동해줘');

    const plannerRequestId = mocks.start.mock.calls[0]?.[0]?.requestId as string;
    const plannerListener = mocks.onEventListeners[0];

    plannerListener({
      type: 'done',
      requestId: plannerRequestId,
      content: 'MODE: EDIT_PLAN\n12.5초 지점으로 이동하겠습니다.',
    });

    await flushPromises();

    const executorRequestId = mocks.start.mock.calls[1]?.[0]?.requestId as string;
    const executorListener = mocks.onEventListeners[0];

    executorListener({
      type: 'done',
      requestId: executorRequestId,
      content: [
        '12.5초 지점으로 이동하겠습니다.',
        '```json',
        JSON.stringify({
          reply: '12.5초 지점으로 이동하겠습니다.',
          actions: [
            {
              type: 'SEEK_TIMELINE',
              timeSeconds: 12.5,
            },
          ],
        }),
        '```',
      ].join('\n'),
    });

    await flushPromises();

    expect(mocks.executeAiActionPlan).toHaveBeenCalledWith({
      reply: '12.5초 지점으로 이동하겠습니다.',
      actions: [
        {
          type: 'SEEK_TIMELINE',
          timeSeconds: 12.5,
        },
      ],
    });
    expect(useAiChatStore.getState().pendingExecution).toBeNull();
    expect(useAiChatStore.getState().isGenerating).toBe(false);
    expect(useAiChatStore.getState().messages).toHaveLength(3);
    expect(useAiChatStore.getState().messages[2]?.content).toBe('12.5초 지점으로 이동하겠습니다.');
  });
});
