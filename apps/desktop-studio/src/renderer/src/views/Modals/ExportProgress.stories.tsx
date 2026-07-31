import type { Meta, StoryObj } from '@storybook/react';
import { ExportModal } from '../../components/ExportModal';
import { createLocaleStoryDecorator } from '../../storybook/localeStoryShell';
import { createViewsScenarioDecorator } from '../viewsStoryDecorators';
import {
  PROJECT_LOADED_ASSETS,
  PROJECT_LOADED_FIXTURE,
  PROJECT_LOADED_MANIFEST,
  STORYBOOK_PROJECT_ID,
} from '../viewsStoryFixtures';

const meta: Meta<typeof ExportModal> = {
  title: 'Export/Progress Modal',
  component: ExportModal,
  decorators: [createLocaleStoryDecorator()],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isExporting: true,
    progress: 0.42,
    status: 'Rendering Frame... 42%',
    error: null,
    onCancel: () => undefined,
    onClose: () => undefined,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Encoding: Story = {
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: PROJECT_LOADED_FIXTURE.name,
      manifest: PROJECT_LOADED_MANIFEST,
      rightPanelView: 'layers',
      assets: PROJECT_LOADED_ASSETS,
    }),
  ],
};

export const Completed: Story = {
  args: {
    isExporting: false,
    progress: 1,
    status: 'Completed',
    error: null,
  },
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: PROJECT_LOADED_FIXTURE.name,
      manifest: PROJECT_LOADED_MANIFEST,
      rightPanelView: 'layers',
      assets: PROJECT_LOADED_ASSETS,
    }),
  ],
};

export const Cancelled: Story = {
  args: {
    isExporting: false,
    progress: 0,
    status: 'Cancelled',
    error: null,
  },
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: PROJECT_LOADED_FIXTURE.name,
      manifest: PROJECT_LOADED_MANIFEST,
      rightPanelView: 'layers',
      assets: PROJECT_LOADED_ASSETS,
    }),
  ],
};

export const Failed: Story = {
  args: {
    isExporting: false,
    progress: 0.42,
    status: 'Failed',
    error: 'WebGPU device not found',
  },
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: PROJECT_LOADED_FIXTURE.name,
      manifest: PROJECT_LOADED_MANIFEST,
      rightPanelView: 'layers',
      assets: PROJECT_LOADED_ASSETS,
    }),
  ],
};

export const TechnicalDetailsOpen: Story = {
  args: {
    isExporting: true,
    progress: 0.42,
    status: 'Rendering Frame... 42%',
    error: null,
    defaultTechnicalDetailsOpen: true,
  },
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: PROJECT_LOADED_FIXTURE.name,
      manifest: PROJECT_LOADED_MANIFEST,
      rightPanelView: 'layers',
      assets: PROJECT_LOADED_ASSETS,
    }),
  ],
};
