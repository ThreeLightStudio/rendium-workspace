import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const selectLayer = vi.fn();
  const selectLayers = vi.fn();
  const clearSelection = vi.fn();
  const executeAtomicIntentBatch = vi.fn();
  const toastSuccess = vi.fn();
  const toastError = vi.fn();
  const seekTimeline = vi.fn(() => true);
  const hasTimelineSeekHandler = vi.fn(() => true);
  const getSnapshot = vi.fn(() => ({
    width: 1920,
    height: 1080,
    projectDuration: 12,
  }));
  const normalizeTransformFields = vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const transform = value as Record<string, unknown>;
    const source =
      transform.transform &&
      typeof transform.transform === 'object' &&
      !Array.isArray(transform.transform)
        ? (transform.transform as Record<string, unknown>)
        : transform;
    const position =
      isNumber(source.x) || isNumber(source.y)
        ? {
            x: isNumber(source.x) ? source.x : 0,
            y: isNumber(source.y) ? source.y : 0,
          }
        : isPlainPosition(source.position)
          ? source.position
          : undefined;
    const scale =
      isNumber(source.scaleX) || isNumber(source.scaleY)
        ? {
            x: isNumber(source.scaleX) ? source.scaleX : 1,
            y: isNumber(source.scaleY) ? source.scaleY : 1,
          }
        : isPlainScale(source.scale)
          ? source.scale
          : undefined;
    const rotation = isNumber(source.rotation) ? source.rotation : undefined;

    if (!position && !scale && rotation === undefined) {
      return undefined;
    }

    return {
      position,
      scale,
      rotation,
    };
  });
  const getManifest = vi.fn(() => ({
    projectSettings: {
      canvas: {
        size: {
          width: 1920,
          height: 1080,
        },
      },
    },
    layers: {
      'existing-layer': {
        id: 'existing-layer',
        kind: 'control',
        startTime: 0,
        duration: 1,
        control: {
          role: 'scopeStart',
          params: {
            scopeRole: 'text',
          },
        },
      },
    },
    layerOrder: ['existing-layer'],
  }));
  const getParentSequenceStartLayer = vi.fn(() => undefined);
  const getLayerById = vi.fn(() => undefined);

  return {
    selectLayer,
    selectLayers,
    clearSelection,
    executeAtomicIntentBatch,
    toastSuccess,
    toastError,
    seekTimeline,
    hasTimelineSeekHandler,
    getSnapshot,
    getManifest,
    getParentSequenceStartLayer,
    getLayerById,
    normalizeTransformFields,
  };
});

vi.mock('@rendium/engine', () => ({
  INTENT_TYPES: {
    ADD_LAYER: 'ADD_LAYER',
    UPDATE_LAYER_PROPS: 'UPDATE_LAYER_PROPS',
    UPDATE_TRANSFORM: 'UPDATE_TRANSFORM',
    TOGGLE_VISIBILITY: 'TOGGLE_VISIBILITY',
    REORDER_LAYER: 'REORDER_LAYER',
    REMOVE_LAYER: 'REMOVE_LAYER',
    SCOPE_START: 'SCOPE_START',
    SCOPE_END: 'SCOPE_END',
  },
  EDITABLE_INTENT_TYPES: [
    'ADD_LAYER',
    'UPDATE_LAYER_PROPS',
    'UPDATE_TRANSFORM',
    'TOGGLE_VISIBILITY',
    'REORDER_LAYER',
    'REMOVE_LAYER',
  ],
  TEXT_CONFIG: {
    DEFAULT_FONT_FAMILY: 'Arial, sans-serif',
    DEFAULT_FONT_SIZE: 24,
    DEFAULT_COLOR: [1, 1, 1, 1],
    DEFAULT_ALIGN: 'center',
    DEFAULT_OUTLINE_COLOR: [0, 0, 0, 1],
    DEFAULT_OUTLINE_WIDTH: 0,
    DEFAULT_ANCHOR: { x: 0, y: 0 },
  },
  EngineSelectors: {
    getCanvasCenter: (width: number, height: number) => ({ x: width / 2, y: height / 2 }),
    getCanvasCenterFromSnapshot: (snapshot: { width: number; height: number }) => ({
      x: snapshot.width / 2,
      y: snapshot.height / 2,
    }),
  },
  IMAGE_CONFIG: {
    DEFAULT_FIT: 'contain',
    DEFAULT_POSITION: { x: 0, y: 0 },
    DEFAULT_SCALE: { x: 1, y: 1 },
    DEFAULT_OPACITY: 1,
  },
  AUDIO_CONFIG: {
    DEFAULT_VOLUME: 1,
    DEFAULT_MUTED: false,
  },
  normalizeTransformFields: mocks.normalizeTransformFields,
  getParentSequenceStartLayer: mocks.getParentSequenceStartLayer,
  engineStore: {
    executeAtomicIntentBatch: mocks.executeAtomicIntentBatch,
    getSnapshot: mocks.getSnapshot,
    getManifest: mocks.getManifest,
    getLayerById: mocks.getLayerById,
  },
}));

vi.mock('../../stores/studioStore', () => ({
  useStudioStore: {
    getState: () => ({
      selectedLayerIds: [],
      selectLayer: mocks.selectLayer,
      selectLayers: mocks.selectLayers,
      clearSelection: mocks.clearSelection,
    }),
  },
}));

vi.mock('../../components/ToastSystem', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('../../services/timelinePlaybackController', () => ({
  seekTimeline: mocks.seekTimeline,
  hasTimelineSeekHandler: mocks.hasTimelineSeekHandler,
  registerTimelineSeekHandler: vi.fn(),
}));

const { parseAiAssistantResponse } = await import('../aiActionParser');
const { parseAiPlannerResponse } = await import('../aiPlanParser');
const { parseAiAssetMetadataResponse } = await import('../aiAssetMetadataParser');
const { executeAiActionPlan } = await import('../aiActionExecutor');
const { useProjectAssetsStore } = await import('../../stores/useProjectAssetsStore');

afterEach(() => {
  vi.clearAllMocks();
  useProjectAssetsStore.setState({
    activeProjectId: null,
    assets: [],
    // biome-ignore lint/suspicious/noExplicitAny: test state reset
  } as any);
});

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainPosition(value: unknown): value is { x: number; y: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    isNumber((value as { x?: unknown }).x) &&
    isNumber((value as { y?: unknown }).y)
  );
}

function isPlainScale(value: unknown): value is { x: number; y: number } {
  return isPlainPosition(value);
}

describe('parseAiAssistantResponse', () => {
  it('keeps canonical engine intent actions and rejects lowercase legacy fields', () => {
    const parsed = parseAiAssistantResponse(`
      {
        "reply": "done",
        "actions": [
          {
            "type": "ADD_LAYER",
            "manifest": {
              "id": "text-layer-1",
              "kind": "visual",
              "startTime": 0,
              "duration": 5,
              "source": {
                "sourceId": "text:text-layer-1",
                "provider": "text",
                "track": "visual",
                "params": { "text": "Hello" }
              }
            }
          },
          {
            "kind": "create_text_layer",
            "text": "legacy"
          }
        ]
      }
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]).toMatchObject({
      type: 'ADD_LAYER',
      manifest: {
        id: 'text-layer-1',
        kind: 'visual',
        startTime: 0,
        duration: 5,
        source: {
          sourceId: 'text:text-layer-1',
          provider: 'text',
          track: 'visual',
          params: { text: 'Hello' },
        },
      },
    });
  });

  it('does not expose raw JSON as the display reply for JSON-only envelopes', () => {
    const parsed = parseAiAssistantResponse(
      JSON.stringify({
        reply: '',
        actions: [
          {
            type: 'ADD_LAYER',
            manifest: {
              kind: 'visual',
              source: {
                provider: 'text',
                params: {
                  text: 'Hello',
                },
              },
            },
          },
        ],
      }),
    );

    expect(parsed.parseError).toBeNull();
    expect(parsed.reply).toBe('');
    expect(parsed.actions).toHaveLength(1);
  });

  it('suppresses malformed raw JSON when no valid envelope is present', () => {
    const parsed = parseAiAssistantResponse('{"reply":"보이면 안 됩니다.", "actions": [');

    expect(parsed.reply).toBe('');
    expect(parsed.actions).toHaveLength(0);
    expect(parsed.parseError).toBe('Missing JSON action envelope.');
  });

  it('rejects primitive JSON action envelopes before reading action fields', () => {
    const parsed = parseAiAssistantResponse('[]');

    expect(parsed.reply).toBe('');
    expect(parsed.actions).toHaveLength(0);
    expect(parsed.parseError).toBe('Missing JSON action envelope.');
  });

  it('normalizes timeline jump actions into canonical seek payloads', () => {
    const parsed = parseAiAssistantResponse(`
      {
        "reply": "jump",
        "actions": [
          {
            "type": "JUMP_TO_TIME",
            "timecode": "00:00:12.500"
          }
        ]
      }
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]).toMatchObject({
      type: 'SEEK_TIMELINE',
      timeSeconds: 12.5,
    });
  });

  it('accepts deterministic workflow actions', () => {
    const parsed = parseAiAssistantResponse(`
      {
        "reply": "workflow를 만들겠습니다.",
        "actions": [
          {
            "type": "RUN_WORKFLOW",
            "workflowId": "audio-visual-draft",
            "assetBindings": {
              "audio": "audio-1",
              "image": "image-1"
            },
            "fieldValues": {
              "titleText": "Night Drive",
              "titlePlacement": "bottom"
            }
          }
        ]
      }
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]).toMatchObject({
      type: 'RUN_WORKFLOW',
      workflowId: 'audio-visual-draft',
      assetBindings: {
        audio: 'audio-1',
        image: 'image-1',
      },
      fieldValues: {
        titleText: 'Night Drive',
        titlePlacement: 'bottom',
      },
    });
  });

  it('parses product text commands with safe defaults', () => {
    const parsed = parseAiAssistantResponse(`
      {
        "reply": "제목과 자막을 추가하겠습니다.",
        "actions": [
          {
            "type": "ADD_TITLE_TEXT",
            "text": "Night Drive",
            "placement": "top",
            "durationSeconds": 6
          },
          {
            "type": "ADD_CAPTION_TEXT",
            "text": "첫 번째 장면",
            "startTime": 2
          },
          {
            "type": "UPDATE_SELECTED_TEXT_STYLE",
            "patch": { "fontSize": 64, "color": [1, 1, 1, 1] }
          }
        ]
      }
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.actions).toEqual([
      {
        type: 'ADD_TITLE_TEXT',
        text: 'Night Drive',
        placement: 'top',
        durationSeconds: 6,
      },
      {
        type: 'ADD_CAPTION_TEXT',
        text: '첫 번째 장면',
        startTime: 2,
      },
      {
        type: 'UPDATE_SELECTED_TEXT_STYLE',
        patch: { fontSize: 64, color: [1, 1, 1, 1] },
      },
    ]);
  });

  it('parses image asset timeline actions with safe defaults', () => {
    const parsed = parseAiAssistantResponse(`
      Cherry Coke 이미지를 인트로에 추가하겠습니다.
      \`\`\`json
      {
        "reply": "Cherry Coke 이미지를 인트로에 추가하겠습니다.",
        "actions": [
          {
            "type": "ADD_IMAGE_ASSET_TO_TIMELINE",
            "assetId": "asset-recovered-1",
            "placement": "start"
          }
        ]
      }
      \`\`\`
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.actions).toEqual([
      {
        type: 'ADD_IMAGE_ASSET_TO_TIMELINE',
        assetId: 'asset-recovered-1',
        placement: 'start',
        durationSeconds: 7,
      },
    ]);
  });

  it('normalizes legacy transform shorthands into canonical action fields', () => {
    const parsed = parseAiAssistantResponse(`
      {
        "reply": "done",
        "actions": [
          {
            "type": "ADD_LAYER",
            "manifest": {
              "id": "intro-text-layer",
              "kind": "visual",
              "source": {
                "provider": "text",
                "track": "visual",
                "params": {
                  "text": "Intro"
                }
              },
              "transform": {
                "x": 120,
                "y": 80,
                "scaleX": 1.2,
                "scaleY": 1.2,
                "rotation": 15
              }
            }
          },
          {
            "type": "UPDATE_TRANSFORM",
            "layerId": "layer-1",
            "transform": {
              "x": 240,
              "y": 180,
              "scaleX": 1.5,
              "scaleY": 1.5,
              "rotation": 30
            }
          }
        ]
      }
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.actions[0]).toMatchObject({
      type: 'ADD_LAYER',
      manifest: {
        id: 'intro-text-layer',
        kind: 'visual',
        source: {
          provider: 'text',
          track: 'visual',
          params: {
            text: 'Intro',
          },
        },
        transform: {
          position: { x: 120, y: 80 },
          scale: { x: 1.2, y: 1.2 },
          rotation: 15,
        },
      },
    });
    expect(parsed.actions[1]).toMatchObject({
      type: 'UPDATE_TRANSFORM',
      layerId: 'layer-1',
      position: { x: 240, y: 180 },
      scale: { x: 1.5, y: 1.5 },
      rotation: 30,
    });
  });

  it('accepts targetScopeId as a layer target alias for non-add actions', () => {
    const parsed = parseAiAssistantResponse(`
      {
        "reply": "move it",
        "actions": [
          {
            "type": "UPDATE_TRANSFORM",
            "targetScopeId": "text-layer-1",
            "transform": {
              "position": { "x": 1080, "y": 660 },
              "scale": { "x": 1, "y": 1 },
              "rotation": 0
            }
          }
        ]
      }
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]).toMatchObject({
      type: 'UPDATE_TRANSFORM',
      layerId: 'text-layer-1',
      position: { x: 1080, y: 660 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    });
  });
});

describe('parseAiPlannerResponse', () => {
  it('reads planner mode headers and the body text', () => {
    const parsed = parseAiPlannerResponse(`
      MODE: EDIT_PLAN
      텍스트 레이어를 추가하고 가운데에 배치합니다.
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.mode).toBe('EDIT_PLAN');
    expect(parsed.reply).toBe('텍스트 레이어를 추가하고 가운데에 배치합니다.');
  });

  it('defaults to answer-only when the header is missing', () => {
    const parsed = parseAiPlannerResponse('그냥 설명만 해보겠습니다.');

    expect(parsed.mode).toBe('ANSWER_ONLY');
    expect(parsed.reply).toBe('그냥 설명만 해보겠습니다.');
    expect(parsed.parseError).toBe('Missing planner mode header.');
  });

  it('parses asset recommendation envelopes from planner replies', () => {
    const parsed = parseAiPlannerResponse(`
      MODE: ANSWER_ONLY
      배경으로는 이런 톤이 어울립니다.
      \`\`\`json
      {
        "reply": "배경으로는 이런 톤이 어울립니다.",
        "candidates": [
          {
            "assetId": "asset-1",
            "title": "Warm Background",
            "reason": "현재 톤과 가장 잘 맞습니다.",
            "suggestedTags": ["background", "warm"]
          }
        ],
        "uploadCta": "업로드하기"
      }
      \`\`\`
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.recommendation).toMatchObject({
      reply: '배경으로는 이런 톤이 어울립니다.',
      candidates: [
        {
          assetId: 'asset-1',
          title: 'Warm Background',
          reason: '현재 톤과 가장 잘 맞습니다.',
          suggestedTags: ['background', 'warm'],
        },
      ],
      uploadCta: '업로드하기',
    });
    expect(parsed.reply).toBe('배경으로는 이런 톤이 어울립니다.');
  });

  it('ignores primitive planner recommendation envelopes', () => {
    const parsed = parseAiPlannerResponse(`
      MODE: ANSWER_ONLY
      \`\`\`json
      []
      \`\`\`
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.recommendation).toBeNull();
  });
});

describe('parseAiAssetMetadataResponse', () => {
  it('rejects primitive metadata envelopes before reading metadata fields', () => {
    const parsed = parseAiAssetMetadataResponse(`
      \`\`\`json
      []
      \`\`\`
    `);

    expect(parsed.metadata).toBeNull();
    expect(parsed.reply).toBe('');
    expect(parsed.parseError).toBe('Asset metadata JSON envelope must be an object.');
  });

  it('parses object metadata envelopes from unknown input', () => {
    const parsed = parseAiAssetMetadataResponse(`
      \`\`\`json
      {
        "metadata": {
          "description": " Calm cover ",
          "tags": [" calm ", 10, "blue"],
          "subject": "water",
          "mood": "quiet",
          "usageHint": "background"
        }
      }
      \`\`\`
    `);

    expect(parsed.parseError).toBeNull();
    expect(parsed.metadata).toEqual({
      description: 'Calm cover',
      tags: ['calm', 'blue'],
      subject: 'water',
      mood: 'quiet',
      usageHint: 'background',
    });
  });
});

describe('executeAiActionPlan', () => {
  it('normalizes ADD_LAYER and dispatches canonical engine intents', async () => {
    const result = await executeAiActionPlan({
      reply: 'add layer',
      actions: [
        {
          type: 'ADD_LAYER',
          manifest: {
            kind: 'visual',
            source: {
              sourceId: 'text:test',
              provider: 'text',
              track: 'visual',
              params: {
                text: 'Hello world',
              },
            },
          },
        },
        {
          type: 'TOGGLE_VISIBILITY',
          layerId: 'existing-layer',
          visible: false,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.createdLayerIds).toHaveLength(1);
    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledTimes(1);
    expect(mocks.selectLayer).toHaveBeenCalledWith(result.createdLayerIds[0]);
    expect(mocks.seekTimeline).toHaveBeenCalledWith(0);

    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'ADD_LAYER',
        manifest: expect.objectContaining({
          id: result.createdLayerIds[0],
          kind: 'visual',
          name: 'Hello world',
          startTime: 0,
          duration: 12,
          transform: expect.objectContaining({
            position: { x: 960, y: 540 },
            scale: { x: 1, y: 1 },
            rotation: 0,
          }),
          source: expect.objectContaining({
            provider: 'text',
            params: expect.objectContaining({
              text: 'Hello world',
              fontFamily: 'Arial, sans-serif',
              fontSize: 24,
              fontWeight: 'bold',
              align: 'center',
              outlineWidth: 0,
              anchor: { x: 0.5, y: 0.5 },
            }),
          }),
        }),
      }),
      {
        type: 'TOGGLE_VISIBILITY',
        layerId: 'existing-layer',
        visible: false,
      },
    ]);
  });

  it('normalizes legacy transform shorthands when mapping intents', async () => {
    const result = await executeAiActionPlan({
      reply: 'move text',
      actions: [
        {
          type: 'ADD_LAYER',
          manifest: {
            kind: 'visual',
            source: {
              sourceId: 'text:test',
              provider: 'text',
              track: 'visual',
              params: {
                text: 'Intro',
              },
            },
            transform: {
              x: 120,
              y: 80,
              scaleX: 1.2,
              scaleY: 1.2,
              rotation: 15,
            },
          },
        } as never,
        {
          type: 'UPDATE_TRANSFORM',
          layerId: 'existing-layer',
          transform: {
            x: 240,
            y: 180,
            scaleX: 1.5,
            scaleY: 1.5,
            rotation: 30,
          },
        } as never,
      ],
    });

    expect(result.success).toBe(true);
    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'ADD_LAYER',
        manifest: expect.objectContaining({
          transform: expect.objectContaining({
            position: { x: 120, y: 80 },
            scale: { x: 1.2, y: 1.2 },
            rotation: 15,
          }),
        }),
      }),
      {
        type: 'UPDATE_TRANSFORM',
        layerId: 'existing-layer',
        position: { x: 240, y: 180 },
        scale: { x: 1.5, y: 1.5 },
        rotation: 30,
      },
    ]);
  });

  it('executes timeline jump actions without persisting history', async () => {
    const result = await executeAiActionPlan({
      reply: 'jump to 12.5',
      actions: [
        {
          type: 'SEEK_TIMELINE',
          timeSeconds: 12.5,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(mocks.executeAtomicIntentBatch).not.toHaveBeenCalled();
    expect(mocks.seekTimeline).toHaveBeenCalledWith(12.5);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      '타임라인 이동 완료',
      expect.objectContaining({
        message: '00:00:12.500로 이동했습니다.',
      }),
    );
  });

  it('auto-focuses the earliest changed timeline position after edit actions', async () => {
    mocks.getManifest.mockReturnValueOnce({
      projectSettings: {
        canvas: {
          size: {
            width: 1920,
            height: 1080,
          },
        },
      },
      layers: {
        'timeline-layer': {
          id: 'timeline-layer',
          kind: 'visual',
          startTime: 30,
          duration: 5,
        },
      },
      layerOrder: ['timeline-layer'],
    } as unknown as ReturnType<typeof mocks.getManifest>);

    const result = await executeAiActionPlan({
      reply: 'move earlier',
      actions: [
        {
          type: 'UPDATE_LAYER_PROPS',
          layerId: 'timeline-layer',
          patch: {
            startTime: 5,
          },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      {
        type: 'UPDATE_LAYER_PROPS',
        layerId: 'timeline-layer',
        patch: {
          startTime: 5,
        },
      },
    ]);
    expect(mocks.seekTimeline).toHaveBeenCalledWith(5);
  });

  it('creates image and audio layers from selected workflow assets', async () => {
    mocks.getManifest.mockReturnValueOnce({
      projectSettings: {
        canvas: {
          size: {
            width: 1920,
            height: 1080,
          },
        },
      },
      layers: {
        'project-anchor': {
          id: 'project-anchor',
          kind: 'control',
          startTime: 0,
          duration: 1,
          control: {
            role: 'scopeStart',
            params: {
              scopeRole: 'main',
              isProjectAnchor: true,
            },
          },
        },
        'scope-overlay': {
          id: 'scope-overlay',
          kind: 'control',
          startTime: 0,
          duration: 1,
          control: {
            role: 'scopeStart',
            params: {
              scopeRole: 'overlay',
            },
          },
        },
        'scope-main': {
          id: 'scope-main',
          kind: 'control',
          startTime: 0,
          duration: 1,
          control: {
            role: 'scopeStart',
            params: {
              scopeRole: 'main',
            },
          },
        },
        'scope-text': {
          id: 'scope-text',
          kind: 'control',
          startTime: 0,
          duration: 1,
          control: {
            role: 'scopeStart',
            params: {
              scopeRole: 'text',
            },
          },
        },
      },
      layerOrder: ['scope-main', 'scope-text'],
    } as unknown as ReturnType<typeof mocks.getManifest>);
    useProjectAssetsStore.setState({
      activeProjectId: 'project-1',
      assets: [
        {
          id: 'image-asset',
          projectId: 'project-1',
          assetKind: 'image',
          contentHash: 'hash-image',
          displayName: 'cover.png',
          sourceUrl: 'rendium-asset://project-1/files/hash-image.png',
          lastKnownSourceUrl: 'rendium-asset://project-1/files/hash-image.png',
          importedFromPath: null,
          thumbnailDataUrl: 'data:image/png;base64,AAA',
          mimeType: 'image/png',
          width: 1280,
          height: 720,
          durationSeconds: null,
          audioAnalysis: null,
          status: 'ready',
          usageCount: 0,
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: null,
          metadata: {
            description: '',
            tags: [],
            subject: '',
            mood: '',
            usageHint: '',
          },
          metadataOrigin: 'unknown',
          lastEditedBy: null,
          hasUserOverride: false,
        },
        {
          id: 'audio-asset',
          projectId: 'project-1',
          assetKind: 'audio',
          contentHash: 'hash-audio',
          displayName: 'song.mp3',
          sourceUrl: 'rendium-asset://project-1/files/hash-audio.mp3',
          lastKnownSourceUrl: 'rendium-asset://project-1/files/hash-audio.mp3',
          importedFromPath: null,
          thumbnailDataUrl: null,
          mimeType: 'audio/mpeg',
          width: null,
          height: null,
          durationSeconds: 180,
          audioAnalysis: {
            energy: 0.7,
            mood: 'energetic',
          },
          status: 'ready',
          usageCount: 0,
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: null,
          metadata: {
            description: '',
            tags: [],
            subject: '',
            mood: '',
            usageHint: '',
          },
          metadataOrigin: 'unknown',
          lastEditedBy: null,
          hasUserOverride: false,
        },
        // biome-ignore lint/suspicious/noExplicitAny: test asset mock
      ] as any,
    });

    const result = await executeAiActionPlan({
      reply: 'create video',
      actions: [
        {
          type: 'RUN_WORKFLOW',
          workflowId: 'audio-visual-draft',
          assetBindings: {
            audio: 'audio-asset',
            image: 'image-asset',
          },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.createdLayerIds).toHaveLength(0);
    expect(mocks.executeAtomicIntentBatch).not.toHaveBeenCalled();
  });

  it('adds an image asset at the current timeline end without model-provided scope ids', async () => {
    const timelineSnapshot = {
      width: 1920,
      height: 1080,
      duration: 24,
      projectDuration: 30,
    } as unknown as ReturnType<typeof mocks.getSnapshot>;
    const imagePlacementManifest = {
      projectSettings: {
        canvas: {
          size: {
            width: 1920,
            height: 1080,
          },
        },
      },
      layers: {
        'scope-main': {
          id: 'scope-main',
          kind: 'control',
          startTime: 0,
          duration: 1,
          control: {
            role: 'scopeStart',
            params: {
              scopeRole: 'main',
            },
          },
        },
      },
      layerOrder: ['project-anchor', 'scope-overlay', 'scope-main'],
    } as unknown as ReturnType<typeof mocks.getManifest>;
    mocks.getSnapshot.mockReturnValueOnce(timelineSnapshot);
    mocks.getManifest.mockReturnValueOnce(imagePlacementManifest);
    useProjectAssetsStore.setState({
      activeProjectId: 'project-1',
      assets: [
        {
          id: 'image-asset',
          projectId: 'project-1',
          assetKind: 'image',
          contentHash: 'hash-image',
          displayName: 'Cherry Coke_source',
          sourceUrl: 'rendium-asset://project-1/files/hash-image.png',
          lastKnownSourceUrl: 'rendium-asset://project-1/files/hash-image.png',
          importedFromPath: null,
          thumbnailDataUrl: 'data:image/png;base64,AAA',
          mimeType: 'image/png',
          width: 1280,
          height: 720,
          durationSeconds: null,
          audioAnalysis: null,
          status: 'pending_metadata',
          usageCount: 0,
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: null,
          metadata: {
            description: '',
            tags: [],
            subject: '',
            mood: '',
            usageHint: '',
          },
          metadataOrigin: 'unknown',
          lastEditedBy: null,
          hasUserOverride: false,
        },
        // biome-ignore lint/suspicious/noExplicitAny: test asset mock
      ] as any,
    });

    const result = await executeAiActionPlan({
      reply: 'add image',
      actions: [
        {
          type: 'ADD_IMAGE_ASSET_TO_TIMELINE',
          assetId: 'image-asset',
          placement: 'end',
          durationSeconds: 7,
          fit: 'cover',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.createdLayerIds).toHaveLength(1);
    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'ADD_LAYER',
        targetScopeId: 'scope-main',
        manifest: expect.objectContaining({
          kind: 'visual',
          name: 'Cherry Coke_source',
          startTime: 24,
          duration: 7,
          source: expect.objectContaining({
            provider: 'raster',
            params: expect.objectContaining({
              sourceUrl: 'rendium-asset://project-1/files/hash-image.png',
              sourceWidth: 1280,
              sourceHeight: 720,
              fit: 'cover',
            }),
          }),
        }),
      }),
    ]);
    expect(mocks.selectLayer).toHaveBeenCalledWith(result.createdLayerIds[0]);
    expect(mocks.seekTimeline).toHaveBeenCalledWith(24);

    mocks.executeAtomicIntentBatch.mockClear();
    mocks.selectLayer.mockClear();
    mocks.seekTimeline.mockClear();
    mocks.getSnapshot.mockReturnValueOnce(timelineSnapshot);
    mocks.getManifest.mockReturnValueOnce(imagePlacementManifest);

    const introResult = await executeAiActionPlan({
      reply: 'add image to intro',
      actions: [
        {
          type: 'ADD_IMAGE_ASSET_TO_TIMELINE',
          assetId: 'image-asset',
          placement: 'start',
          durationSeconds: 5,
          fit: 'cover',
        },
      ],
    });

    expect(introResult.success).toBe(true);
    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'ADD_LAYER',
        targetScopeId: 'scope-main',
        manifest: expect.objectContaining({
          startTime: 0,
          duration: 5,
          source: expect.objectContaining({
            params: expect.objectContaining({
              sourceWidth: 1280,
              sourceHeight: 720,
              fit: 'cover',
            }),
          }),
        }),
      }),
    ]);
    expect(mocks.seekTimeline).toHaveBeenCalledWith(0);
  });

  it('executes title text through ProductCommand defaults instead of raw ADD_LAYER manifests', async () => {
    const result = await executeAiActionPlan({
      reply: 'add title',
      actions: [
        {
          type: 'ADD_TITLE_TEXT',
          text: 'Night Drive',
          placement: 'center',
          durationSeconds: 6,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.createdLayerIds).toHaveLength(1);
    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'ADD_LAYER',
        targetScopeId: 'existing-layer',
        manifest: expect.objectContaining({
          kind: 'visual',
          name: 'Night Drive',
          startTime: 0,
          duration: 6,
          source: expect.objectContaining({
            provider: 'text',
            params: expect.objectContaining({
              text: 'Night Drive',
              fontSize: 72,
              anchor: { x: 0.5, y: 0.5 },
            }),
          }),
          transform: expect.objectContaining({
            position: { x: 960, y: 540 },
          }),
        }),
      }),
    ]);
    expect(mocks.selectLayer).toHaveBeenCalledWith(result.createdLayerIds[0]);
  });

  it('fails image asset timeline actions when the asset source is missing', async () => {
    useProjectAssetsStore.setState({
      activeProjectId: 'project-1',
      assets: [
        {
          id: 'missing-image',
          projectId: 'project-1',
          assetKind: 'image',
          contentHash: 'hash-image',
          displayName: 'Missing image',
          sourceUrl: null,
          lastKnownSourceUrl: null,
          importedFromPath: null,
          thumbnailDataUrl: null,
          mimeType: 'image/png',
          width: null,
          height: null,
          durationSeconds: null,
          audioAnalysis: null,
          status: 'needs_attention',
          usageCount: 0,
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: null,
          metadata: {
            description: '',
            tags: [],
            subject: '',
            mood: '',
            usageHint: '',
          },
          metadataOrigin: 'unknown',
          lastEditedBy: null,
          hasUserOverride: false,
        },
        // biome-ignore lint/suspicious/noExplicitAny: test asset mock
      ] as any,
    });

    const result = await executeAiActionPlan({
      reply: 'add image',
      actions: [
        {
          type: 'ADD_IMAGE_ASSET_TO_TIMELINE',
          assetId: 'missing-image',
          placement: 'end',
          durationSeconds: 7,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('소스 파일이 없어 적용할 수 없습니다.');
    expect(mocks.executeAtomicIntentBatch).not.toHaveBeenCalled();
  });

  it('reports a timeline jump failure when seeking is unavailable at execution time', async () => {
    mocks.seekTimeline.mockReturnValue(false);

    const result = await executeAiActionPlan({
      reply: 'jump to 12.5',
      actions: [
        {
          type: 'SEEK_TIMELINE',
          timeSeconds: 12.5,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('타임라인 이동을 사용할 수 없습니다.');
    expect(mocks.toastError).toHaveBeenCalledWith(
      '타임라인 이동 실패',
      expect.objectContaining({
        message: '타임라인 이동을 사용할 수 없습니다.',
      }),
    );
  });

  it('fails fast when an action cannot be mapped to an engine intent', async () => {
    const result = await executeAiActionPlan({
      reply: 'bad plan',
      actions: [
        {
          type: 'ADD_LAYER',
          manifest: {
            kind: 'bogus' as never,
          },
        } as never,
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('지원하지 않는 액션');
    expect(mocks.executeAtomicIntentBatch).not.toHaveBeenCalled();
  });

  it('returns failure when the engine batch throws', async () => {
    mocks.executeAtomicIntentBatch.mockImplementation(() => {
      throw new Error('batch exploded');
    });

    const result = await executeAiActionPlan({
      reply: 'boom',
      actions: [
        {
          type: 'ADD_LAYER',
          manifest: {
            kind: 'visual',
            source: {
              sourceId: 'text:test',
              provider: 'text',
              track: 'visual',
              params: {
                text: 'Hello',
              },
            },
          },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('batch exploded');
  });
});
