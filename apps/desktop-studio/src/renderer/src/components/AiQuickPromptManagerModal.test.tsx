import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const localStorageMock = (() => {
  let values = new Map<string, string>();

  return {
    clear: vi.fn(() => {
      values = new Map();
    }),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

vi.mock('../i18n/locale', () => ({
  translate: (key: string) => key,
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./ui/styles', () => ({
  modalCardClass: 'modalCardClass',
  modalOverlayClass: 'modalOverlayClass',
  primaryButtonClass: () => 'primaryButtonClass',
  sectionLabelClass: 'sectionLabelClass',
  surfaceCardClass: 'surfaceCardClass',
}));

const { useAiQuickPromptStore } = await import('../stores/useAiQuickPromptStore');
const { AiQuickPromptManagerModal } = await import('./AiQuickPromptManagerModal');

beforeEach(() => {
  window.localStorage.clear();
  useAiQuickPromptStore.getState().reloadPrompts();
});

describe('AiQuickPromptManagerModal', () => {
  it('renders and closes the dialog', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onClose = vi.fn();

    await act(async () => {
      root.render(<AiQuickPromptManagerModal isOpen onClose={onClose} />);
    });

    expect(document.body.textContent).toContain('ai.quickPromptManagerTitle');

    const closeButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'global.close',
    );
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });
});
