import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { setLocale } from '../i18n/locale';
import { useAiQuickPromptStore } from '../stores/useAiQuickPromptStore';
import { createLocaleStoryDecorator } from '../storybook/localeStoryShell';
import { AI_QUICK_PROMPTS_STORAGE_KEY } from '../utils/aiQuickPrompts';
import { AiQuickPromptManagerModal } from './AiQuickPromptManagerModal';

const createQuickPromptStoryDecorator = (): Decorator => {
  return (Story) => {
    setLocale('en');
    window.localStorage.removeItem(AI_QUICK_PROMPTS_STORAGE_KEY);
    useAiQuickPromptStore.getState().reloadPrompts();

    return <Story />;
  };
};

const meta: Meta<typeof AiQuickPromptManagerModal> = {
  title: 'AI/Quick Prompt Manager Modal',
  component: AiQuickPromptManagerModal,
  decorators: [createLocaleStoryDecorator(), createQuickPromptStoryDecorator()],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isOpen: true,
    onClose: () => undefined,
    disabled: false,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const DefaultOpen: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
