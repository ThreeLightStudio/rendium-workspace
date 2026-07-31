// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const applyPendingExecution = vi.fn(async () => undefined);
const cancelPendingExecution = vi.fn();
const setAutoApplyEdits = vi.fn();

const aiChatStoreState = {
  pendingExecution: {
    requestId: 'request-1',
    reply: 'Ready to apply this plan.',
    actions: [
      {
        type: 'ADD_LAYER',
        manifest: {
          id: 'layer-1',
          kind: 'visual',
          source: {
            provider: 'text',
            params: {
              text: 'Title',
            },
          },
        },
      },
    ],
    status: 'ready',
    createdLayerIds: [],
  },
  autoApplyEdits: false,
  setAutoApplyEdits,
  applyPendingExecution,
  cancelPendingExecution,
};

vi.mock('@rendium/engine', () => ({
  INTENT_TYPES: {
    ADD_LAYER: 'ADD_LAYER',
    UPDATE_LAYER_PROPS: 'UPDATE_LAYER_PROPS',
    UPDATE_TRANSFORM: 'UPDATE_TRANSFORM',
    TOGGLE_VISIBILITY: 'TOGGLE_VISIBILITY',
    REORDER_LAYER: 'REORDER_LAYER',
    REMOVE_LAYER: 'REMOVE_LAYER',
  },
  normalizeTransformFields: () => undefined,
}));

vi.mock('../i18n/locale', () => ({
  translate: (key: string) => key,
}));

vi.mock('../stores/useAiChatStore', () => ({
  useAiChatStore: (selector: (state: unknown) => unknown) => selector(aiChatStoreState),
}));

const { AiActionPreview } = await import('./AiActionPreview');

function renderAiActionPreview() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  return { container, root };
}

async function mountAiActionPreview() {
  const rendered = renderAiActionPreview();

  await act(async () => {
    rendered.root.render(<AiActionPreview />);
  });

  return rendered;
}

async function unmountAiActionPreview(
  container: HTMLDivElement,
  root: ReturnType<typeof createRoot>,
) {
  await act(async () => {
    root.unmount();
  });

  document.body.removeChild(container);
}

beforeEach(() => {
  applyPendingExecution.mockClear();
  cancelPendingExecution.mockClear();
  setAutoApplyEdits.mockClear();
  aiChatStoreState.autoApplyEdits = false;
  aiChatStoreState.pendingExecution.status = 'ready';
});

describe('AiActionPreview', () => {
  it('keeps apply, cancel, and auto-apply actions wired', async () => {
    const { container, root } = await mountAiActionPreview();

    const buttons = Array.from(container.querySelectorAll('button'));
    const applyButton = buttons.find((button) => button.textContent === 'ai.planReadyLabel');
    const cancelButton = buttons.find((button) => button.textContent === 'global.cancel');
    const autoApplyCheckbox = container.querySelector('input[type="checkbox"]');

    expect(applyButton).toBeTruthy();
    expect(cancelButton).toBeTruthy();
    expect(autoApplyCheckbox).toBeTruthy();

    await act(async () => {
      applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      autoApplyCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(applyPendingExecution).toHaveBeenCalledTimes(1);
    expect(cancelPendingExecution).toHaveBeenCalledTimes(1);
    expect(setAutoApplyEdits).toHaveBeenCalledWith(true);

    await unmountAiActionPreview(container, root);
  });
});
