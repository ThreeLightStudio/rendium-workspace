// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  const openAssetsPanel = vi.fn();
  const selectAsset = vi.fn();
  const previewAsset = vi.fn();
  const useAssetInScene = vi.fn();
  const ingestFiles = vi.fn(async () => ['asset-123']);
  const ingestFile = vi.fn(async () => 'asset-123');
  return {
    openAssetsPanel,
    selectAsset,
    previewAsset,
    useAssetInScene,
    ingestFiles,
    ingestFile,
  };
});

vi.mock('@styled-system/css', () => ({
  css: () => 'mock-css',
  cva: () => () => 'mock-cva',
  cx: (...values: Array<string | false | null | undefined>) =>
    values
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' '),
}));

vi.mock('../i18n/locale', () => ({
  useLocale: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    formatTimeOfDay: () => '10:00',
  }),
}));

vi.mock('../stores/useAiChatStore', () => ({
  useAiChatStore: (selector: (state: unknown) => unknown) =>
    selector({
      messages: [],
      isGenerating: false,
      sendMessage: vi.fn(),
      assetRecommendation: {
        reply: '추천 문구',
        promptSuggestion: '프롬프트 제안',
        uploadCta: '업로드',
        candidates: [],
      },
    }),
}));

vi.mock('../stores/useProjectAssetsStore', () => ({
  useProjectAssetsStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectedAssetId: null,
      assets: [],
      previewAsset: mocks.previewAsset,
      selectAsset: mocks.selectAsset,
      useAssetInScene: mocks.useAssetInScene,
      ingestFiles: mocks.ingestFiles,
      ingestFile: mocks.ingestFile,
    }),
}));

vi.mock('../stores/studioStore', () => ({
  useStudioStore: (selector: (state: unknown) => unknown) =>
    selector({
      openAssetsPanel: mocks.openAssetsPanel,
    }),
}));

vi.mock('./AssetUploadDropzone', () => ({
  AssetUploadDropzone: ({
    onFiles,
  }: {
    onFiles: (files: File[]) => Promise<unknown> | unknown;
  }) => (
    <button
      type="button"
      onClick={() => {
        void onFiles([new File(['image'], 'example.png', { type: 'image/png' })]);
      }}
    >
      mock-upload
    </button>
  ),
}));

const { AiChatPanel } = await import('./AiChatPanel');

beforeEach(() => {
  mocks.openAssetsPanel.mockClear();
  mocks.selectAsset.mockClear();
  mocks.previewAsset.mockClear();
  mocks.useAssetInScene.mockClear();
  mocks.ingestFiles.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AiChatPanel recommendation section', () => {
  it('opens the assets view and selects the uploaded asset after upload', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AiChatPanel />);
    });

    const uploadButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'mock-upload',
    );
    expect(uploadButton).toBeTruthy();

    await act(async () => {
      uploadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mocks.ingestFile).toHaveBeenCalledTimes(1);
    expect(mocks.openAssetsPanel).toHaveBeenCalledTimes(1);
    expect(mocks.selectAsset).toHaveBeenCalledWith('asset-123');

    await act(async () => {
      root.unmount();
    });
  });
});
