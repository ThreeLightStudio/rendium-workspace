import type { Meta, StoryObj } from '@storybook/react';
import { StudioEditor } from '../../components/StudioEditor';
import { useStudioStore } from '../../stores/studioStore';
import { useAiChatStore } from '../../stores/useAiChatStore';
import { createLocaleStoryDecorator } from '../../storybook/localeStoryShell';
import { createViewsScenarioDecorator } from '../viewsStoryDecorators';
import {
  EMPTY_EDITOR_FIXTURE,
  EMPTY_EDITOR_MANIFEST,
  PROJECT_LOADED_ASSETS,
  PROJECT_LOADED_FIXTURE,
  PROJECT_LOADED_MANIFEST,
  STORYBOOK_PROJECT_ID,
} from '../viewsStoryFixtures';

const meta: Meta<typeof StudioEditor> = {
  title: 'Studio/Main Editor',
  component: StudioEditor,
  decorators: [createLocaleStoryDecorator()],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    activeProjectId: STORYBOOK_PROJECT_ID,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyState: Story = {
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: EMPTY_EDITOR_FIXTURE.name,
      manifest: EMPTY_EDITOR_MANIFEST,
      rightPanelView: 'layers',
      assets: [],
      recommendation: null,
    }),
    (Story) => {
      useStudioStore.setState({
        selectedLayerId: null,
        selectedLayerIds: [],
        hoveredLayerId: null,
        rightPanelTab: 'inspector',
        rightPanelView: 'layers',
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

export const ProjectLoaded: Story = {
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: PROJECT_LOADED_FIXTURE.name,
      manifest: PROJECT_LOADED_MANIFEST,
      assets: PROJECT_LOADED_ASSETS,
    }),
    (Story) => {
      useStudioStore.setState({
        selectedLayerId: 'hero-shot',
        selectedLayerIds: ['hero-shot'],
        hoveredLayerId: 'title-text',
        rightPanelTab: 'inspector',
        rightPanelView: 'layers',
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
