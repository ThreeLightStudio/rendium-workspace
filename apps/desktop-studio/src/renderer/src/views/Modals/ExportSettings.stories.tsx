import type { Meta, StoryObj } from '@storybook/react';
import { ExportSettingsModal } from '../../components/ExportSettingsModal';
import { createLocaleStoryDecorator } from '../../storybook/localeStoryShell';
import { createViewsScenarioDecorator } from '../viewsStoryDecorators';
import {
  PROJECT_LOADED_ASSETS,
  PROJECT_LOADED_FIXTURE,
  PROJECT_LOADED_MANIFEST,
  STORYBOOK_PROJECT_ID,
} from '../viewsStoryFixtures';

const meta: Meta<typeof ExportSettingsModal> = {
  title: 'Export/Settings Modal',
  component: ExportSettingsModal,
  decorators: [createLocaleStoryDecorator()],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isOpen: true,
    onClose: () => undefined,
    onStart: () => undefined,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const DefaultOpen: Story = {
  decorators: [
    createViewsScenarioDecorator({
      projectId: STORYBOOK_PROJECT_ID,
      projectName: PROJECT_LOADED_FIXTURE.name,
      manifest: PROJECT_LOADED_MANIFEST,
      rightPanelView: 'project',
      assets: PROJECT_LOADED_ASSETS,
    }),
  ],
};
