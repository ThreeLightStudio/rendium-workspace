// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_QUICK_PROMPTS_STORAGE_KEY,
  buildAiQuickPrompts,
  createAiQuickPrompt,
  deleteAiQuickPrompt,
  resetAiQuickPrompts,
  saveAiQuickPrompts,
  updateAiQuickPrompt,
} from './aiQuickPrompts';

const t = (key: string) => key;

function createLocalStorageMock(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createLocalStorageMock(),
  });

  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('aiQuickPrompts helpers', () => {
  it('seeds default prompts on first load', () => {
    const prompts = buildAiQuickPrompts(t as never);

    expect(prompts).toEqual([
      {
        id: 'seed-layout-summary',
        label: 'ai.quickPromptLayoutSummary',
        prompt: 'ai.quickPromptLayoutSummaryPrompt',
      },
      {
        id: 'seed-selected-layer',
        label: 'ai.quickPromptExplainSelectedLayer',
        prompt: 'ai.quickPromptExplainSelectedLayerPrompt',
      },
      {
        id: 'seed-jump-to-time',
        label: 'ai.quickPromptJumpToTime',
        prompt: 'ai.quickPromptJumpToTimePrompt',
      },
    ]);

    expect(window.localStorage.getItem(AI_QUICK_PROMPTS_STORAGE_KEY)).toBe(JSON.stringify(prompts));
  });

  it('creates, updates, deletes, and resets prompts', () => {
    const seeded = buildAiQuickPrompts(t as never);
    const created = createAiQuickPrompt({
      label: '  Custom label  ',
      prompt: '  Custom prompt  ',
    });

    const saved = saveAiQuickPrompts([...seeded, created]);
    expect(saved).toContainEqual({
      id: created.id,
      label: 'Custom label',
      prompt: 'Custom prompt',
    });

    const updated = updateAiQuickPrompt(saved, created.id, {
      label: 'Edited label',
      prompt: 'Edited prompt',
    });
    expect(updated).toContainEqual({
      id: created.id,
      label: 'Edited label',
      prompt: 'Edited prompt',
    });

    const deleted = deleteAiQuickPrompt(updated, created.id);
    expect(deleted).not.toContainEqual(
      expect.objectContaining({
        id: created.id,
      }),
    );

    const reset = resetAiQuickPrompts(t as never);
    expect(reset).toEqual(seeded);
  });

  it('keeps malformed stored prompts intact while returning defaults', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storedValue = '{not-json';

    window.localStorage.setItem(AI_QUICK_PROMPTS_STORAGE_KEY, storedValue);

    const prompts = buildAiQuickPrompts(t as never);

    expect(prompts).toHaveLength(3);
    expect(window.localStorage.getItem(AI_QUICK_PROMPTS_STORAGE_KEY)).toBe(storedValue);
    expect(warn).toHaveBeenCalledWith(
      'Unable to read AI quick prompts from localStorage.',
      expect.objectContaining({
        key: AI_QUICK_PROMPTS_STORAGE_KEY,
        reason: 'malformed-json',
        error: expect.any(SyntaxError),
      }),
    );
  });

  it('keeps non-array stored prompts intact while returning defaults', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storedValue = JSON.stringify({ id: 'prompt-1' });

    window.localStorage.setItem(AI_QUICK_PROMPTS_STORAGE_KEY, storedValue);

    const prompts = buildAiQuickPrompts(t as never);

    expect(prompts).toHaveLength(3);
    expect(window.localStorage.getItem(AI_QUICK_PROMPTS_STORAGE_KEY)).toBe(storedValue);
    expect(warn).toHaveBeenCalledWith(
      'Unable to read AI quick prompts from localStorage.',
      expect.objectContaining({
        key: AI_QUICK_PROMPTS_STORAGE_KEY,
        reason: 'non-array-payload',
      }),
    );
  });

  it('keeps all-invalid prompt arrays intact while returning defaults', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storedValue = JSON.stringify([
      {
        id: '',
        label: 'Missing id',
        prompt: 'Prompt',
      },
      {
        id: 'prompt-2',
        label: '   ',
        prompt: 'Prompt',
      },
    ]);

    window.localStorage.setItem(AI_QUICK_PROMPTS_STORAGE_KEY, storedValue);

    const prompts = buildAiQuickPrompts(t as never);

    expect(prompts).toHaveLength(3);
    expect(window.localStorage.getItem(AI_QUICK_PROMPTS_STORAGE_KEY)).toBe(storedValue);
    expect(warn).toHaveBeenCalledWith(
      'Unable to read AI quick prompts from localStorage.',
      expect.objectContaining({
        key: AI_QUICK_PROMPTS_STORAGE_KEY,
        reason: 'no-valid-prompts',
      }),
    );
  });
});
