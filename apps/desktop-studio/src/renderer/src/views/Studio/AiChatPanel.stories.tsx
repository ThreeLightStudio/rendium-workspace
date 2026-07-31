import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { AiChatPanel } from '../../components/AiChatPanel';
import type { AiAssetRecommendationEnvelope } from '../../services/AiService';
import type { ProjectAssetRecord } from '../../stores/projectAssetTypes';
import {
  type AiChatMessage,
  type AiExecutionCardState,
  type AiWorkflowDraftState,
  useAiChatStore,
} from '../../stores/useAiChatStore';
import { useProjectAssetsStore } from '../../stores/useProjectAssetsStore';
import { createPanelStoryDecorator } from '../../storybook/panelStoryShell';
import {
  createStoryAsset,
  createStorybookFixtureDecorator,
} from '../../storybook/storybookFixtures';
import {
  AI_ASSISTANT_EMPTY_IMAGE_RECOMMENDATION,
  AI_ASSISTANT_IMAGE_PROMPT_MESSAGES,
  AI_ASSISTANT_MESSAGES,
  AI_ASSISTANT_PENDING_EXECUTION,
  STORYBOOK_PROJECT_ID,
} from '../viewsStoryFixtures';

const meta: Meta<typeof AiChatPanel> = {
  title: 'AI Chat/Panel',
  component: AiChatPanel,
  decorators: [createPanelStoryDecorator({ runtimeFrame: 'right-panel-ai-content' })],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const ATTACHABLE_ASSETS = [
  createStoryAsset({
    id: 'asset-chat-hero-frame',
    displayName: 'Hero Frame.png',
    thumbnailLabel: 'Hero',
    thumbnailColor: '#0f766e',
    usageCount: 6,
    metadata: {
      description: 'Opening hero frame with clear subject separation.',
      tags: ['hero', 'opening', 'image'],
      subject: 'Hero product frame',
      mood: 'Confident',
      usageHint: 'Use as the main visual background.',
    },
    // biome-ignore lint/suspicious/noExplicitAny: storybook mock workaround
  } as any),
  createStoryAsset({
    id: 'asset-chat-audio-bed',
    displayName: 'Cherry Coke.mp3',
    assetKind: 'audio',
    mimeType: 'audio/mpeg',
    durationSeconds: 28,
    audioAnalysis: {
      energy: 0.74,
      mood: 'balanced',
    },
    thumbnailLabel: 'Audio',
    thumbnailColor: '#7c3aed',
    usageCount: 3,
    metadata: {
      description: 'Bright pop track with a refreshing, fizzy mood.',
      tags: ['pop', 'refreshing', 'bright'],
      subject: 'Cherry Coke',
      mood: 'Refreshing',
      usageHint: 'Generate a matching image prompt.',
    },
    // biome-ignore lint/suspicious/noExplicitAny: storybook mock workaround
  } as any),
];

const ASSET_RECOMMENDATION_READY = {
  reply: 'I found one ready project asset that fits the requested opening mood.',
  candidates: [
    {
      assetId: 'asset-chat-hero-frame',
      title: 'Use the hero frame as the opener',
      reason: 'It already has strong subject separation and enough quiet space for title text.',
      suggestedTags: ['opening', 'title-safe', 'hero'],
    },
    {
      title: 'Generate a tighter outro card',
      reason: 'No matching outro asset exists yet, so this stays as a generation prompt.',
      suggestedTags: ['outro', 'cta'],
    },
  ],
  uploadCta: 'Upload a matching visual',
} satisfies AiAssetRecommendationEnvelope;

const MUSIC_VIDEO_DRAFT = {
  requestId: 'workflow-draft-story',
  reply: 'Choose the background image for the workflow draft.',
  audioAssetId: 'asset-chat-audio-bed',
  titleText: 'Cherry Coke',
  titlePlacement: 'center' as const,
  candidates: [
    {
      assetId: 'asset-chat-hero-frame',
      title: 'Hero Frame.png',
      reason: 'Balanced audio energy pairs well with the clean hero composition.',
    },
    {
      assetId: 'asset-chat-secondary-frame',
      title: 'Neon Splash.png',
      reason: 'The brighter palette would emphasize the pop track.',
    },
  ],
} satisfies AiWorkflowDraftState;

function createAiChatStoryDecorator({
  messages = [],
  isGenerating = false,
  pendingExecution = null,
  assetRecommendation = null,
  workflowDraft = null,
  assets = ATTACHABLE_ASSETS,
}: {
  messages?: AiChatMessage[];
  isGenerating?: boolean;
  pendingExecution?: AiExecutionCardState | null;
  assetRecommendation?: AiAssetRecommendationEnvelope | null;
  workflowDraft?: AiWorkflowDraftState | null;
  assets?: ProjectAssetRecord[];
} = {}): Decorator {
  const fixtureDecorator = createStorybookFixtureDecorator({
    projectId: STORYBOOK_PROJECT_ID,
    rightPanelView: 'layers',
    assets,
    recommendation: assetRecommendation,
  });

  return (Story, context) =>
    fixtureDecorator(() => {
      useProjectAssetsStore.setState({
        assets,
      });
      useAiChatStore.setState({
        messages,
        isGenerating,
        pendingExecution,
        assetRecommendation,
        workflowDraft,
        autoApplyEdits: false,
      });

      return Story();
    }, context);
}

export const Empty: Story = {
  decorators: [createAiChatStoryDecorator()],
};

export const Conversation: Story = {
  decorators: [
    createAiChatStoryDecorator({
      messages: AI_ASSISTANT_IMAGE_PROMPT_MESSAGES,
    }),
  ],
};

export const GeneratingWithActionPreview: Story = {
  name: 'Generating With Action Preview',
  decorators: [
    createAiChatStoryDecorator({
      messages: AI_ASSISTANT_MESSAGES,
      isGenerating: true,
      pendingExecution: AI_ASSISTANT_PENDING_EXECUTION,
    }),
  ],
};

export const ImagePromptNoRecommendations: Story = {
  name: 'Image Prompt No Recommendations',
  decorators: [
    createAiChatStoryDecorator({
      messages: AI_ASSISTANT_IMAGE_PROMPT_MESSAGES,
      assetRecommendation: AI_ASSISTANT_EMPTY_IMAGE_RECOMMENDATION,
    }),
  ],
};

export const AssetRecommendationsReady: Story = {
  name: 'Asset Recommendations Ready',
  decorators: [
    createAiChatStoryDecorator({
      messages: AI_ASSISTANT_MESSAGES.slice(0, 2),
      assetRecommendation: ASSET_RECOMMENDATION_READY,
    }),
  ],
};

export const WorkflowDraft: Story = {
  name: 'Workflow Draft',
  decorators: [
    createAiChatStoryDecorator({
      messages: AI_ASSISTANT_IMAGE_PROMPT_MESSAGES,
      workflowDraft: MUSIC_VIDEO_DRAFT,
    }),
  ],
};

export const ConversationWithMultipleInsights: Story = {
  name: 'Conversation With Multiple Insights',
  decorators: [
    createAiChatStoryDecorator({
      messages: AI_ASSISTANT_MESSAGES,
      pendingExecution: AI_ASSISTANT_PENDING_EXECUTION,
      assetRecommendation: ASSET_RECOMMENDATION_READY,
      workflowDraft: MUSIC_VIDEO_DRAFT,
    }),
  ],
};
