import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const {
  sendMessage,
  openAssetsPanel,
  selectAsset,
  previewAsset,
  useAssetInScene,
  ingestFiles,
  ingestFile,
  chooseWorkflowBackground,
  projectAssets,
} = vi.hoisted(() => {
  const sendMessage = vi.fn();
  const openAssetsPanel = vi.fn();
  const selectAsset = vi.fn();
  const previewAsset = vi.fn();
  const useAssetInScene = vi.fn();
  const ingestFiles = vi.fn(async () => ['asset-123']);
  const ingestFile = vi.fn(async () => 'asset-123');
  const chooseWorkflowBackground = vi.fn();
  const projectAssets = [
    {
      id: 'asset-123',
      projectId: 'project-1',
      assetKind: 'image',
      contentHash: 'hash-123',
      displayName: 'city.png',
      sourceUrl: 'rendium-asset://project-1/files/hash-123.png',
      lastKnownSourceUrl: 'rendium-asset://project-1/files/hash-123.png',
      importedFromPath: null,
      thumbnailDataUrl: null,
      mimeType: 'image/png',
      width: 320,
      height: 180,
      durationSeconds: null,
      audioAnalysis: null,
      status: 'ready',
      usageCount: 0,
      createdAt: 1,
      updatedAt: 1,
      lastUsedAt: null,
      metadata: {
        description: 'A city skyline',
        tags: ['city'],
        subject: 'skyline',
        mood: 'bright',
        usageHint: 'background',
      },
      metadataOrigin: 'user',
      lastEditedBy: 'user',
      hasUserOverride: true,
    },
  ];
  return {
    sendMessage,
    openAssetsPanel,
    selectAsset,
    previewAsset,
    useAssetInScene,
    ingestFiles,
    ingestFile,
    chooseWorkflowBackground,
    projectAssets,
  };
});
const aiChatStoreState: {
  messages: unknown[];
  isGenerating: boolean;
  sendMessage: typeof sendMessage;
  pendingExecution: unknown;
  assetRecommendation: unknown;
  workflowDraft: unknown;
  chooseWorkflowBackground: typeof chooseWorkflowBackground;
} = {
  messages: [],
  isGenerating: false,
  sendMessage,
  pendingExecution: null,
  assetRecommendation: null,
  workflowDraft: null,
  chooseWorkflowBackground,
};

function renderAiChatPanel() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  return { container, root };
}

async function mountAiChatPanel() {
  const rendered = renderAiChatPanel();

  await act(async () => {
    rendered.root.render(<AiChatPanel />);
  });

  return rendered;
}

async function unmountAiChatPanel(container: HTMLDivElement, root: ReturnType<typeof createRoot>) {
  await act(async () => {
    root.unmount();
  });

  document.body.removeChild(container);
}

function findButtonByLabel(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === label,
  );
}

function findButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text),
  );
}

async function typeComposerDraft(container: HTMLElement, value: string) {
  const textarea = container.querySelector('#ai-chat-input') as HTMLTextAreaElement | null;
  expect(textarea).toBeTruthy();

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    valueSetter?.call(textarea, value);
    textarea?.dispatchEvent(new Event('input', { bubbles: true }));
  });

  return textarea as HTMLTextAreaElement;
}

function setInputFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
}

function dispatchClipboardPaste(textarea: HTMLTextAreaElement, files: File[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
    },
  });
  textarea.dispatchEvent(event);
}

function dispatchFileDrop(target: HTMLElement, files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files,
      types: ['Files'],
    },
  });
  target.dispatchEvent(event);
}

vi.mock('../i18n/locale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
    formatTimeOfDay: () => '10:00',
  }),
}));

vi.mock('../stores/useAiChatStore', () => ({
  useAiChatStore: (selector: (state: unknown) => unknown) => selector(aiChatStoreState),
}));

vi.mock('../stores/useProjectAssetsStore', () => {
  const state = {
    selectedAssetId: null,
    assets: projectAssets,
    previewAsset,
    selectAsset,
    useAssetInScene,
    ingestFiles,
    ingestFile,
  };
  const useProjectAssetsStore = (selector: (state: unknown) => unknown) => selector(state);
  useProjectAssetsStore.getState = () => state;
  return { useProjectAssetsStore };
});

vi.mock('../stores/studioStore', () => ({
  useStudioStore: (selector: (state: unknown) => unknown) =>
    selector({
      openAssetsPanel,
    }),
}));

vi.mock('./AiActionPreview', () => ({
  AiActionPreview: () => null,
}));

const { AiChatPanel } = await import('./AiChatPanel');

beforeEach(() => {
  sendMessage.mockClear();
  openAssetsPanel.mockClear();
  selectAsset.mockClear();
  previewAsset.mockClear();
  useAssetInScene.mockClear();
  ingestFiles.mockClear();
  chooseWorkflowBackground.mockClear();
  aiChatStoreState.messages = [];
  aiChatStoreState.isGenerating = false;
  aiChatStoreState.pendingExecution = null;
  aiChatStoreState.assetRecommendation = null;
  aiChatStoreState.workflowDraft = null;
});

describe('AiChatPanel', () => {
  it('renders assistant insights inside the message scroller instead of a separate insights scroller', async () => {
    aiChatStoreState.assetRecommendation = {
      reply: '추천 문구',
      promptSuggestion: '프롬프트 제안',
      uploadCta: '업로드',
      candidates: [],
    };

    const { container, root } = await mountAiChatPanel();
    const messageScroller = container.querySelector('.ai-chat-panel__messages');

    expect(container.querySelector('.ai-chat-panel__insights')).toBeNull();
    expect(messageScroller?.querySelector('.ai-chat-panel__message--insight')).toBeTruthy();
    expect(messageScroller?.querySelector('.ai-chat-panel__bubble--insight')).toBeTruthy();
    expect(messageScroller?.textContent).toContain('추천 문구');

    await unmountAiChatPanel(container, root);
  });

  it('sends a typed composer prompt when the send button is clicked', async () => {
    const { container, root } = await mountAiChatPanel();

    await typeComposerDraft(container, 'Summarize the layout.');
    const sendButton = findButtonByLabel(container, 'ai.send');
    expect(sendButton).toBeTruthy();

    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sendMessage).toHaveBeenCalledWith('Summarize the layout.', []);

    await unmountAiChatPanel(container, root);
  });

  it('attaches an existing image asset before sending a prompt', async () => {
    const { container, root } = await mountAiChatPanel();

    const attachFromAssetsButton = findButtonByLabel(container, 'ai.attachFromAssets');
    expect(attachFromAssetsButton).toBeTruthy();

    await act(async () => {
      attachFromAssetsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const assetButton = findButtonByText(container, 'city.png');
    expect(assetButton).toBeTruthy();

    await act(async () => {
      assetButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await typeComposerDraft(container, 'Use this asset as the background.');
    const sendButton = findButtonByLabel(container, 'ai.send');
    expect(sendButton).toBeTruthy();

    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sendMessage).toHaveBeenCalledWith(
      'Use this asset as the background.',
      expect.arrayContaining([
        expect.objectContaining({
          assetId: 'asset-123',
          displayName: 'city.png',
        }),
      ]),
    );

    await unmountAiChatPanel(container, root);
  });

  it('attaches files from the file picker into composer chips', async () => {
    const { container, root } = await mountAiChatPanel();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const file = new File(['image'], 'city.png', { type: 'image/png' });
    setInputFiles(fileInput as HTMLInputElement, [file]);

    await act(async () => {
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(ingestFile).toHaveBeenCalledWith(file);
    expect(container.querySelector('.ai-chat-panel__attachments')?.textContent).toContain(
      'city.png',
    );

    await unmountAiChatPanel(container, root);
  });

  it('removes an attachment chip before sending a typed prompt', async () => {
    const { container, root } = await mountAiChatPanel();

    const attachFromAssetsButton = findButtonByLabel(container, 'ai.attachFromAssets');
    await act(async () => {
      attachFromAssetsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const assetButton = findButtonByText(container, 'city.png');
    await act(async () => {
      assetButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const removeButton = findButtonByLabel(container, 'ai.removeAttachment');
    expect(removeButton).toBeTruthy();

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await typeComposerDraft(container, 'Summarize the layout.');
    const sendButton = findButtonByLabel(container, 'ai.send');
    expect(sendButton).toBeTruthy();

    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sendMessage).toHaveBeenCalledWith('Summarize the layout.', []);

    await unmountAiChatPanel(container, root);
  });

  it('attaches dropped files through the same upload path', async () => {
    const { container, root } = await mountAiChatPanel();
    const composer = container.querySelector('.ai-chat-panel__composer') as HTMLElement | null;
    expect(composer).toBeTruthy();

    const file = new File(['image'], 'drop.png', { type: 'image/png' });

    await act(async () => {
      dispatchFileDrop(composer as HTMLElement, [file]);
    });

    expect(ingestFile).toHaveBeenCalledWith(file);

    await unmountAiChatPanel(container, root);
  });

  it('attaches pasted image files through the same upload path', async () => {
    const { container, root } = await mountAiChatPanel();
    const textarea = container.querySelector('#ai-chat-input') as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();

    const file = new File(['image'], 'paste.png', { type: 'image/png' });

    await act(async () => {
      dispatchClipboardPaste(textarea as HTMLTextAreaElement, [file]);
    });

    expect(ingestFile).toHaveBeenCalledWith(file);

    await unmountAiChatPanel(container, root);
  });

  it('disables composer actions while attachment upload is pending', async () => {
    let resolveUpload: (assetId: string) => void = () => undefined;
    ingestFile.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveUpload = resolve;
        }),
    );

    const { container, root } = await mountAiChatPanel();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    const sendButton = findButtonByLabel(container, 'ai.send') as HTMLButtonElement | undefined;
    const attachButton = findButtonByLabel(container, 'ai.attachFile') as
      | HTMLButtonElement
      | undefined;

    expect(fileInput).toBeTruthy();
    expect(sendButton).toBeTruthy();
    expect(attachButton).toBeTruthy();

    const file = new File(['image'], 'pending.png', { type: 'image/png' });
    setInputFiles(fileInput as HTMLInputElement, [file]);

    await act(async () => {
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(sendButton?.disabled).toBe(true);
    expect(attachButton?.disabled).toBe(true);

    await act(async () => {
      resolveUpload('asset-123');
    });

    await unmountAiChatPanel(container, root);
  });
});
