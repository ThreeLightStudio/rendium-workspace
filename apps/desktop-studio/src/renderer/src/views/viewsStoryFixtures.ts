import type { AiAssetRecommendationEnvelope, AiAssistantAction } from '../services/AiService';
import type { AiExecutionCardState } from '../stores/useAiChatStore';
import {
  STORY_PROJECT_ID,
  type StoryProjectFixture,
  createStoryAsset,
  createStoryProjectManifest,
} from '../storybook/storybookFixtures';

export const EMPTY_EDITOR_FIXTURE: StoryProjectFixture = {
  name: 'Empty Editor',
  layers: [],
};

export const EMPTY_EDITOR_MANIFEST = createStoryProjectManifest(EMPTY_EDITOR_FIXTURE);

export const PROJECT_LOADED_FIXTURE: StoryProjectFixture = {
  name: 'Loaded Storybook Project',
  layers: [
    {
      id: 'root-start',
      studioType: 'scope:start',
      name: 'Project Root',
      isProjectAnchor: true,
      scopeRole: 'composite',
    },
    {
      id: 'intro-start',
      studioType: 'scope:start',
      name: 'Intro Sequence',
      scopeRole: 'main',
    },
    {
      id: 'hero-shot',
      studioType: 'image',
      name: 'Hero Shot',
      startTime: 0,
      duration: 6,
    },
    {
      id: 'title-text',
      studioType: 'text',
      name: 'Title',
      startTime: 0.5,
      duration: 5,
      params: {
        text: 'Rendium Desktop Studio',
      },
    },
    {
      id: 'voice-track',
      studioType: 'audio',
      name: 'Voice Track',
      startTime: 0,
      duration: 6,
      params: {
        sourceUrl: null,
        volume: 0.9,
        muted: false,
      },
    },
    {
      id: 'intro-end',
      studioType: 'scope:end',
      name: 'Intro Sequence End',
    },
    {
      id: 'outro-start',
      studioType: 'scope:start',
      name: 'Outro Sequence',
      scopeRole: 'overlay',
    },
    {
      id: 'cta-image',
      studioType: 'image',
      name: 'Call To Action',
      startTime: 7,
      duration: 3,
    },
    {
      id: 'outro-end',
      studioType: 'scope:end',
      name: 'Outro Sequence End',
    },
    {
      id: 'root-end',
      studioType: 'scope:end',
      name: 'Project Root End',
      isProjectAnchor: true,
    },
  ],
};

export const PROJECT_LOADED_ASSETS = [
  createStoryAsset({
    id: 'asset-hero-shot',
    displayName: 'Hero Shot',
    contentHash: 'hash-hero-shot',
  }),
  createStoryAsset({
    id: 'asset-cta',
    displayName: 'CTA Plate',
    contentHash: 'hash-cta-plate',
  }),
];

export const PROJECT_LOADED_MANIFEST = createStoryProjectManifest(PROJECT_LOADED_FIXTURE);

export const AI_ASSISTANT_PROJECT = {
  name: 'AI Assistant Project',
  layers: [
    {
      id: 'root-start',
      studioType: 'scope:start',
      name: 'Project Root',
      isProjectAnchor: true,
      scopeRole: 'composite',
    },
    {
      id: 'main-start',
      studioType: 'scope:start',
      name: 'Main media',
      scopeRole: 'main',
    },
    {
      id: 'scene-image',
      studioType: 'image',
      name: 'Scene Image',
      startTime: 0,
      duration: 8,
    },
    {
      id: 'scene-caption',
      studioType: 'text',
      name: 'Scene Caption',
      startTime: 1,
      duration: 6,
      params: {
        text: 'Need a stronger ending?',
      },
    },
    {
      id: 'main-end',
      studioType: 'scope:end',
      name: 'Main media end',
    },
    {
      id: 'root-end',
      studioType: 'scope:end',
      name: 'Project Root End',
      isProjectAnchor: true,
    },
  ],
} satisfies StoryProjectFixture;

export const AI_ASSISTANT_MESSAGES = [
  {
    id: 'ai-message-user-1',
    role: 'user' as const,
    content: 'Can you tighten the intro and add a stronger closing card?',
    timestamp: 1_700_000_020_000,
  },
  {
    id: 'ai-message-assistant-1',
    role: 'assistant' as const,
    content: 'I found a short edit plan that keeps the main beat intact.',
    timestamp: 1_700_000_021_000,
  },
  {
    id: 'ai-message-assistant-2',
    role: 'assistant' as const,
    content: '',
    timestamp: 1_700_000_022_000,
  },
] satisfies Array<{
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}>;

export const AI_ASSISTANT_IMAGE_PROMPT_MESSAGES = [
  {
    id: 'ai-message-user-image-prompt',
    role: 'user' as const,
    content: '이 음악에 맞는 이미지 생성용 프롬프트를 알려주세요',
    timestamp: 1_700_000_030_000,
    attachments: [
      {
        assetId: 'asset-cherry-coke-audio',
        assetKind: 'audio' as const,
        displayName: 'Cherry Coke.mp3',
        status: 'ready' as const,
        mimeType: 'audio/mpeg',
        sourceUrlAvailable: true,
        durationSeconds: 28,
        audioAnalysis: {
          bpm: 112,
          energy: 0.74,
          mood: 'balanced',
        },
        description: 'Bright pop track with a refreshing, fizzy mood.',
        tags: ['pop', 'refreshing', 'bright'],
        subject: 'Cherry Coke',
        mood: 'Refreshing',
        usageHint: 'Generate a matching background image prompt.',
      },
    ],
  },
  {
    id: 'ai-message-assistant-image-prompt',
    role: 'assistant' as const,
    content:
      "음악의 균형 잡힌 분위기와 'Cherry Coke'라는 이름에 어울리는 상큼하고 청량한 이미지 프롬프트를 제안합니다.",
    timestamp: 1_700_000_031_000,
  },
] satisfies Array<{
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: Array<{
    assetId: string;
    assetKind: 'image' | 'audio';
    displayName: string;
    status: 'ready' | 'pending_metadata' | 'needs_attention' | 'missing';
    mimeType: string;
    sourceUrlAvailable: boolean;
    durationSeconds?: number;
    audioAnalysis?: {
      bpm: number;
      energy: number;
      mood: 'calm' | 'balanced' | 'energetic';
    } | null;
    description: string;
    tags: string[];
    subject?: string;
    mood?: string;
    usageHint?: string;
  }>;
}>;

export const AI_ASSISTANT_EMPTY_IMAGE_RECOMMENDATION = {
  reply:
    "음악의 균형 잡힌 분위기와 'Cherry Coke'라는 이름에 어울리는 상큼하고 청량한 이미지 프롬프트를 제안합니다.",
  promptSuggestion:
    'A refreshing glass of cherry cola with ice cubes and splashing soda, vibrant red colors, cinematic lighting, high resolution, 4k',
  uploadCta: '이미지 업로드',
  candidates: [],
} satisfies AiAssetRecommendationEnvelope;

const AI_SEEK_TIMELINE_ACTION: AiAssistantAction = {
  type: 'SEEK_TIMELINE',
  timeSeconds: 4.5,
};

export const AI_ASSISTANT_PENDING_EXECUTION: AiExecutionCardState = {
  requestId: 'ai-request-1',
  reply: 'Trim the intro, keep the hero shot, and introduce a stronger outro.',
  actions: [AI_SEEK_TIMELINE_ACTION],
  status: 'ready' as const,
  createdLayerIds: [],
};

export const AI_ASSISTANT_MANIFEST = createStoryProjectManifest(AI_ASSISTANT_PROJECT);

export const STORYBOOK_PROJECT_ID = STORY_PROJECT_ID;
