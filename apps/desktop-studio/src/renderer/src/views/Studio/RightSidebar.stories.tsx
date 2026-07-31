import type { Meta, StoryObj } from '@storybook/react';
import { RightPanel } from '../../components/RightPanel';
import { useStudioStore } from '../../stores/studioStore';
import { useAiChatStore } from '../../stores/useAiChatStore';
import { PANEL_STORY_PARAMETERS, createPanelStoryDecorator } from '../../storybook/panelStoryShell';
import { createStoryAsset } from '../../storybook/storybookFixtures';
import { createViewsScenarioDecorator } from '../viewsStoryDecorators';
import {
  AI_ASSISTANT_MANIFEST,
  AI_ASSISTANT_MESSAGES,
  AI_ASSISTANT_PENDING_EXECUTION,
  PROJECT_LOADED_FIXTURE,
  PROJECT_LOADED_MANIFEST,
  STORYBOOK_PROJECT_ID,
} from '../viewsStoryFixtures';

const meta: Meta<typeof RightPanel> = {
  title: 'Studio/Right Sidebar',
  component: RightPanel,
  decorators: [createPanelStoryDecorator()],
  parameters: PANEL_STORY_PARAMETERS,
  args: {
    onSelectLayer: () => undefined,
    selectedLayerId: null,
    currentTime: 12,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const ASSETS_OPEN_STORY_ASSETS = [
  createStoryAsset({
    id: 'asset-right-sidebar-opening-plate',
    displayName: 'Opening Plate With A Long Name',
    thumbnailLabel: 'Plate',
    thumbnailColor: '#0f766e',
    status: 'ready',
    usageCount: 8,
    metadata: {
      description: 'Ready background plate for the active scene.',
      tags: ['opening', 'background'],
      subject: 'City skyline',
      mood: 'Confident',
      usageHint: 'Main scene background',
    },
    // biome-ignore lint/suspicious/noExplicitAny: storybook mock workaround
  } as any),
  createStoryAsset({
    id: 'asset-right-sidebar-missing-reference',
    displayName: 'Missing Client Reference',
    sourceUrl: null,
    lastKnownSourceUrl:
      '/mock/path/Projects/rendium-workspace/assets/references/client-final/missing-reference.png',
    thumbnailLabel: null,
    status: 'missing',
    usageCount: 3,
    metadata: {
      description: 'Missing media shows the asset recovery state in the right sidebar.',
      tags: ['missing', 'review'],
      subject: 'Reference frame',
      mood: 'Needs review',
      usageHint: 'Relink before export',
    },
    // biome-ignore lint/suspicious/noExplicitAny: storybook mock workaround
  } as any),
];

export const LayersOverview: Story = {
  name: 'Layers Overview',
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: PROJECT_LOADED_FIXTURE.name,
      manifest: PROJECT_LOADED_MANIFEST,
      rightPanelView: 'layers',
      assets: [],
    }),
    (Story) => {
      useStudioStore.setState({
        rightPanelTab: 'inspector',
        rightPanelView: 'layers',
        selectedLayerId: null,
        selectedLayerIds: [],
      });
      useAiChatStore.setState({
        messages: [],
        isGenerating: false,
        pendingExecution: null,
        assetRecommendation: null,
        autoApplyEdits: false,
      });

      return Story();
    },
  ],
};

export const AssetsOpen: Story = {
  name: 'Assets Open',
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: PROJECT_LOADED_FIXTURE.name,
      manifest: PROJECT_LOADED_MANIFEST,
      rightPanelView: 'layers',
      assets: ASSETS_OPEN_STORY_ASSETS,
      selectedAssetId: 'asset-right-sidebar-missing-reference',
      // biome-ignore lint/suspicious/noExplicitAny: storybook mock workaround
    } as any),
    (Story) => {
      useStudioStore.setState({
        rightPanelTab: 'inspector',
        rightPanelView: 'layers',
        selectedLayerId: null,
        selectedLayerIds: [],
      });
      useAiChatStore.setState({
        messages: [],
        isGenerating: false,
        pendingExecution: null,
        assetRecommendation: null,
        autoApplyEdits: false,
      });

      return Story();
    },
  ],
};

export const AiAssistantSmoke: Story = {
  name: 'AI Assistant Smoke',
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: AI_ASSISTANT_MANIFEST.projectInfo.name,
      manifest: AI_ASSISTANT_MANIFEST,
      rightPanelView: 'layers',
      assets: [],
    }),
    (Story) => {
      useStudioStore.setState({
        rightPanelTab: 'ai',
        rightPanelView: 'layers',
        selectedLayerId: null,
        selectedLayerIds: [],
      });
      useAiChatStore.setState({
        messages: AI_ASSISTANT_MESSAGES,
        isGenerating: true,
        pendingExecution: AI_ASSISTANT_PENDING_EXECUTION,
        assetRecommendation: null,
        autoApplyEdits: false,
      });

      return Story();
    },
  ],
};
