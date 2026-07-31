import { create } from 'zustand';
import { translate } from '../i18n/locale';
import {
  type AiQuickPrompt,
  buildAiQuickPrompts,
  createAiQuickPrompt,
  deleteAiQuickPrompt,
  resetAiQuickPrompts,
  saveAiQuickPrompts,
  updateAiQuickPrompt,
} from '../utils/aiQuickPrompts';

interface AiQuickPromptState {
  prompts: AiQuickPrompt[];
  reloadPrompts: () => void;
  addPrompt: (label: string, prompt: string) => AiQuickPrompt | null;
  editPrompt: (id: string, label: string, prompt: string) => boolean;
  removePrompt: (id: string) => boolean;
  resetPrompts: () => void;
}

function getInitialPrompts(): AiQuickPrompt[] {
  return buildAiQuickPrompts(translate);
}

export const useAiQuickPromptStore = create<AiQuickPromptState>((set, get) => ({
  prompts: getInitialPrompts(),
  reloadPrompts: () => {
    set({ prompts: buildAiQuickPrompts(translate) });
  },
  addPrompt: (label, prompt) => {
    const trimmedLabel = label.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedLabel || !trimmedPrompt) {
      return null;
    }

    const nextPrompt = createAiQuickPrompt({ label: trimmedLabel, prompt: trimmedPrompt });
    const nextPrompts = saveAiQuickPrompts([...get().prompts, nextPrompt]);
    set({ prompts: nextPrompts });
    return nextPrompt;
  },
  editPrompt: (id, label, prompt) => {
    const trimmedLabel = label.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedLabel || !trimmedPrompt) {
      return false;
    }

    const nextPrompts = updateAiQuickPrompt(get().prompts, id, {
      label: trimmedLabel,
      prompt: trimmedPrompt,
    });
    set({ prompts: nextPrompts });
    return true;
  },
  removePrompt: (id) => {
    const nextPrompts = deleteAiQuickPrompt(get().prompts, id);
    set({ prompts: nextPrompts });
    return true;
  },
  resetPrompts: () => {
    set({ prompts: resetAiQuickPrompts(translate) });
  },
}));
