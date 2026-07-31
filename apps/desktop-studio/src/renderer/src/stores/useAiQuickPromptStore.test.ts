// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { AI_QUICK_PROMPTS_STORAGE_KEY } from '../utils/aiQuickPrompts';

const { useAiQuickPromptStore } = await import('./useAiQuickPromptStore');

beforeEach(() => {
  window.localStorage.clear();
  useAiQuickPromptStore.getState().reloadPrompts();
});

describe('useAiQuickPromptStore', () => {
  it('loads seed prompts and persists CRUD updates', () => {
    expect(useAiQuickPromptStore.getState().prompts).toHaveLength(3);

    const created = useAiQuickPromptStore.getState().addPrompt('Custom', 'Custom prompt');
    expect(created).not.toBeNull();

    const afterCreate = useAiQuickPromptStore.getState().prompts;
    expect(afterCreate).toHaveLength(4);
    expect(afterCreate.at(-1)).toMatchObject({
      label: 'Custom',
      prompt: 'Custom prompt',
    });

    const createdId = created?.id ?? '';
    expect(
      useAiQuickPromptStore.getState().editPrompt(createdId, 'Updated', 'Updated prompt'),
    ).toBe(true);
    expect(
      useAiQuickPromptStore.getState().prompts.find((prompt) => prompt.id === createdId),
    ).toMatchObject({
      label: 'Updated',
      prompt: 'Updated prompt',
    });

    expect(useAiQuickPromptStore.getState().removePrompt(createdId)).toBe(true);
    expect(useAiQuickPromptStore.getState().prompts).toHaveLength(3);

    useAiQuickPromptStore.getState().resetPrompts();
    expect(useAiQuickPromptStore.getState().prompts).toHaveLength(3);
    expect(
      JSON.parse(window.localStorage.getItem(AI_QUICK_PROMPTS_STORAGE_KEY) ?? '[]'),
    ).toHaveLength(3);
  });

  it('rejects blank prompt input', () => {
    expect(useAiQuickPromptStore.getState().addPrompt('   ', 'prompt')).toBeNull();
    expect(useAiQuickPromptStore.getState().addPrompt('label', '   ')).toBeNull();
  });
});
