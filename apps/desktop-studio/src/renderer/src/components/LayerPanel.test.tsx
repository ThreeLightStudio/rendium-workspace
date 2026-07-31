// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAudioDurationFromUrl } from '../utils/audio';
import { UnsupportedVideoFileError } from '../utils/videoImport';

const mocks = vi.hoisted(() => {
  const dispatchIntent = vi.fn();
  const executeAtomicIntentBatch = vi.fn();
  const onSelectLayer = vi.fn();
  const openProjectSettings = vi.fn();
  const showLayerPanel = vi.fn();
  const toastError = vi.fn();
  const toastWarning = vi.fn();
  const scopeRole = { current: 'overlay' as 'main' | 'overlay' };
  const scopeLayer = {
    id: 'scope-1',
    name: 'Overlay',
    kind: 'control',
    startTime: 12,
    duration: 20,
  };
  const tree: Array<{ layer: unknown; depth: number; children: unknown[] }> = [
    {
      layer: scopeLayer,
      depth: 1,
      children: [],
    },
  ];
  const manifest = {
    layers: {
      'scope-1': scopeLayer,
    },
  };

  return {
    dispatchIntent,
    executeAtomicIntentBatch,
    onSelectLayer,
    openProjectSettings,
    showLayerPanel,
    toastError,
    toastWarning,
    scopeRole,
    scopeLayer,
    tree,
    manifest,
  };
});

vi.mock('@rendium/engine', () => ({
  INTENT_TYPES: {
    REMOVE_LAYER: 'REMOVE_LAYER',
  },
  engineStore: {
    getManifest: () => mocks.manifest,
    executeAtomicIntentBatch: mocks.executeAtomicIntentBatch,
  },
}));

vi.mock('../hooks/useEngineStore', () => ({
  useEngineStore: () => ({
    dispatchIntent: mocks.dispatchIntent,
    width: 1920,
    height: 1080,
    layers: [mocks.scopeLayer],
    layerOrder: ['scope-1'],
  }),
}));

vi.mock('../hooks/useLayerTree', () => ({
  useLayerTree: () => ({
    tree: mocks.tree,
    visibleDisplayNodes: [mocks.scopeLayer],
    toggleScope: vi.fn(),
  }),
}));

vi.mock('../hooks/useLayerPanelDrag', () => ({
  useLayerPanelDrag: () => ({
    draggingId: null,
    dropIndicator: null,
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
  }),
}));

vi.mock('../stores/studioStore', () => ({
  useStudioStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectedLayerIds: [],
      hoveredLayerId: null,
      setHoveredLayer: vi.fn(),
      collapsedScopes: new Set<string>(),
      openProjectSettings: mocks.openProjectSettings,
      showLayerPanel: mocks.showLayerPanel,
      openAssetsPanel: vi.fn(),
      clearSelection: vi.fn(),
      selectLayers: vi.fn(),
    }),
}));

const mockIngestFile = vi.fn(async (file: File) => {
  const kind = file.type.split('/')[0] || 'asset';
  const sourceUrl = `rendium-asset://project-1/files/mock-${kind}.${file.name.split('.').pop() ?? 'bin'}`;
  if (kind === 'video') {
    const state = useProjectAssetsStoreMock.getState();
    state.assets = [
      {
        sourceUrl,
        durationSeconds: 13,
        width: 1280,
        height: 720,
      },
      ...state.assets.filter((asset) => asset.sourceUrl !== sourceUrl),
    ];
  }
  return sourceUrl;
});

type ProjectAssetsStoreMockState = {
  assets: Array<{
    sourceUrl: string;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
  }>;
  ingestFile: typeof mockIngestFile;
};

function createProjectAssetsStoreMockState(): ProjectAssetsStoreMockState {
  return {
    assets: [],
    ingestFile: mockIngestFile,
  };
}

const projectAssetsStoreState = createProjectAssetsStoreMockState();

const useProjectAssetsStoreMock = Object.assign(
  <T,>(selector: (state: ProjectAssetsStoreMockState) => T): T => selector(projectAssetsStoreState),
  {
    getState: () => projectAssetsStoreState,
  },
);

vi.mock('../stores/useProjectAssetsStore', () => ({
  useProjectAssetsStore: useProjectAssetsStoreMock,
}));

vi.mock('../i18n/locale', () => ({
  translate: (key: string) => key,
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../utils/canonicalLayer', () => ({
  createAudioLayerManifest: vi.fn((options) => ({
    id: options.id,
    kind: 'audio',
    name: options.name,
    startTime: options.startTime,
    duration: options.duration,
    source: {
      sourceId: options.sourceUrl,
      provider: 'audio-file',
      track: 'audio',
      params: {
        sourceUrl: options.sourceUrl,
      },
    },
  })),
  createImageLayerManifest: vi.fn((options) => ({
    id: options.id,
    kind: 'visual',
    name: 'Image Layer',
    startTime: options.startTime,
    duration: options.duration,
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    },
    source: {
      sourceId: `source:${options.id}`,
      provider: 'raster',
      track: 'visual',
      params: {
        sourceUrl: options.sourceUrl ?? null,
        fit: 'contain',
        ...(Number.isFinite(options.sourceWidth) && Number(options.sourceWidth) > 0
          ? { sourceWidth: Number(options.sourceWidth) }
          : {}),
        ...(Number.isFinite(options.sourceHeight) && Number(options.sourceHeight) > 0
          ? { sourceHeight: Number(options.sourceHeight) }
          : {}),
      },
    },
  })),
  createSpectrumLayerManifest: vi.fn(),
  createVideoLayerManifest: vi.fn((options) => ({
    id: options.id,
    kind: 'visual',
    name: options.name,
    startTime: options.startTime,
    duration: options.duration,
    source: {
      sourceId: options.sourceUrl,
      provider: 'video',
      track: 'visual',
      params: {
        sourceUrl: options.sourceUrl,
        sourceWidth: options.sourceWidth,
        sourceHeight: options.sourceHeight,
        fit: options.fit ?? 'contain',
      },
    },
  })),
  createVideoAudioLayerManifest: vi.fn((options) => ({
    id: options.id,
    kind: 'audio',
    name: options.name,
    startTime: options.startTime,
    duration: options.duration,
    source: {
      sourceId: options.sourceUrl,
      provider: 'video',
      track: 'audio',
      params: {
        sourceUrl: options.sourceUrl,
        volume: options.volume ?? 1,
        muted: options.muted ?? false,
      },
    },
  })),
  getAllowedStudioLayerTypes: () => ['image', 'video', 'audio'],
  getScopeRole: () => mocks.scopeRole.current,
  getStudioLayerType: (layer: { id: string }) => (layer.id === 'scope-1' ? 'scope:start' : 'image'),
  isProjectAnchorManifest: () => false,
  isScopeStartManifest: (layer: { id: string }) => layer.id === 'scope-1',
  isScopeEndManifest: () => false,
}));

vi.mock('../utils/audio', () => ({
  readAudioDurationFromUrl: vi.fn(async () => 13),
}));

vi.mock('../utils/textLayer', () => ({
  buildCenteredTextLayerManifest: vi.fn(),
}));

vi.mock('../services/projectAssetFilesystem', () => ({
  storeProjectAssetFile: vi.fn(),
}));

vi.mock('./ToastSystem', () => ({
  toast: {
    error: mocks.toastError,
    warning: mocks.toastWarning,
  },
}));

vi.mock('./LayerPanelItem', () => ({
  LayerPanelItem: ({
    layer,
    onToggleSequence,
    onRemove,
  }: {
    layer: { id: string; name?: string };
    onToggleSequence?: () => void;
    onRemove?: () => void;
  }) => (
    <>
      <button type="button" onClick={onToggleSequence}>
        {layer.name ?? layer.id}
      </button>
      {onRemove && (
        <button type="button" title={`remove-${layer.id}`} onClick={onRemove}>
          Remove {layer.id}
        </button>
      )}
    </>
  ),
}));

const { LayerPanel } = await import('./LayerPanel');
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function flushAsyncHandlers(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.dispatchIntent.mockClear();
  mocks.executeAtomicIntentBatch.mockClear();
  mocks.onSelectLayer.mockClear();
  mocks.openProjectSettings.mockClear();
  mocks.showLayerPanel.mockClear();
  mocks.toastError.mockClear();
  mocks.toastWarning.mockClear();
  projectAssetsStoreState.assets = [];
  projectAssetsStoreState.ingestFile = mockIngestFile;
  mockIngestFile.mockClear();
  vi.mocked(readAudioDurationFromUrl).mockResolvedValue(13);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:mock-media'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(Math, 'random').mockReturnValue(0.123456);
  mocks.tree[0].children = [];
  mocks.manifest.layers = { 'scope-1': mocks.scopeLayer };
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});

describe('LayerPanel linked video deletion', () => {
  it('removes a selected linked audio and video together in one history batch', async () => {
    const videoLayer = {
      id: 'video-1',
      name: 'Screen Recording',
      kind: 'visual',
      startTime: 0,
      duration: 13,
      source: { provider: 'video', track: 'visual' },
    };
    const audioLayer = {
      id: 'video-1-audio',
      name: 'Screen Recording Audio',
      kind: 'audio',
      startTime: 0,
      duration: 13,
      source: { provider: 'video', track: 'audio' },
    };
    mocks.manifest.layers = {
      'scope-1': mocks.scopeLayer,
      [videoLayer.id]: videoLayer,
      [audioLayer.id]: audioLayer,
    };
    mocks.tree[0].children = [
      { layer: videoLayer, depth: 2, children: [] },
      { layer: audioLayer, depth: 2, children: [] },
    ];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LayerPanel
          onSelectLayer={mocks.onSelectLayer}
          selectedLayerId="video-1-audio"
          currentTime={18}
        />,
      );
    });

    const removeAudio = container.querySelector('[title="remove-video-1-audio"]');
    expect(removeAudio).not.toBeNull();
    await act(async () => {
      removeAudio?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      { type: 'REMOVE_LAYER', layerId: 'video-1-audio' },
      { type: 'REMOVE_LAYER', layerId: 'video-1' },
    ]);
    expect(mocks.dispatchIntent).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});

describe('LayerPanel image add flow', () => {
  it('creates a main media image layer at canvas size', async () => {
    mocks.scopeRole.current = 'main';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <LayerPanel onSelectLayer={mocks.onSelectLayer} selectedLayerId={null} currentTime={18} />,
      );
    });

    const addRowButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('layer.addMainMedia'),
    );
    if (!addRowButton) {
      throw new Error('Add row button was not rendered.');
    }

    await act(async () => {
      addRowButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const imageButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Image'),
    );
    if (!imageButton) {
      throw new Error('Image add button was not rendered.');
    }

    await act(async () => {
      imageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"][accept="image/*"]',
    );
    if (!fileInput) {
      throw new Error('Image file input was not found.');
    }

    const file = new File(['image'], 'example.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    const originalCreateImageBitmap = global.createImageBitmap;
    global.createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 1920, height: 1080, close: vi.fn() });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncHandlers();
    });

    global.createImageBitmap = originalCreateImageBitmap;

    expect(mocks.dispatchIntent).toHaveBeenCalledWith({
      type: 'ADD_LAYER',
      targetScopeId: 'scope-1',
      manifest: expect.objectContaining({
        id: 'image-4fzyo',
        kind: 'visual',
        startTime: 6,
        duration: 5,
        transform: expect.objectContaining({
          scale: expect.objectContaining({
            x: 1,
            y: 1,
          }),
        }),
        source: expect.objectContaining({
          params: expect.objectContaining({
            sourceUrl: 'rendium-asset://project-1/files/mock-image.png',
            sourceWidth: 1920,
            sourceHeight: 1080,
          }),
        }),
      }),
    });
    expect(mocks.onSelectLayer).toHaveBeenCalledWith('image-4fzyo');

    await act(async () => {
      root.unmount();
    });
  });

  it('creates an overlay group image layer at the smaller element size', async () => {
    mocks.scopeRole.current = 'overlay';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <LayerPanel onSelectLayer={mocks.onSelectLayer} selectedLayerId={null} currentTime={18} />,
      );
    });

    const addRowButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('layer.addOverlay'),
    );
    if (!addRowButton) {
      throw new Error('Add row button was not rendered.');
    }

    await act(async () => {
      addRowButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const imageButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Image'),
    );
    if (!imageButton) {
      throw new Error('Image add button was not rendered.');
    }

    await act(async () => {
      imageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"][accept="image/*"]',
    );
    if (!fileInput) {
      throw new Error('Image file input was not found.');
    }

    const file = new File(['image'], 'example.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    const originalCreateImageBitmap = global.createImageBitmap;
    global.createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 640, height: 360, close: vi.fn() });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncHandlers();
    });

    global.createImageBitmap = originalCreateImageBitmap;

    expect(mocks.dispatchIntent).toHaveBeenCalledWith({
      type: 'ADD_LAYER',
      targetScopeId: 'scope-1',
      manifest: expect.objectContaining({
        id: 'image-4fzyo',
        kind: 'visual',
        startTime: 6,
        duration: 5,
        transform: expect.objectContaining({
          scale: expect.objectContaining({
            x: 640 / 1920,
            y: 360 / 1080,
          }),
        }),
        source: expect.objectContaining({
          params: expect.objectContaining({
            sourceUrl: 'rendium-asset://project-1/files/mock-image.png',
            sourceWidth: 640,
            sourceHeight: 360,
          }),
        }),
      }),
    });
    expect(mocks.onSelectLayer).toHaveBeenCalledWith('image-4fzyo');

    await act(async () => {
      root.unmount();
    });
  });
});

describe('LayerPanel media add flow', () => {
  async function renderAndOpenAddMenu(label: string) {
    mocks.scopeRole.current = 'main';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <LayerPanel onSelectLayer={mocks.onSelectLayer} selectedLayerId={null} currentTime={18} />,
      );
    });

    const addRowButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('layer.addMainMedia'),
    );
    if (!addRowButton) {
      throw new Error('Add row button was not rendered.');
    }

    await act(async () => {
      addRowButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const mediaButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(label),
    );
    if (!mediaButton) {
      throw new Error(`${label} add button was not rendered.`);
    }

    await act(async () => {
      mediaButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    return { container, root };
  }

  it('does not open project settings when the hidden audio input is clicked', async () => {
    const { container, root } = await renderAndOpenAddMenu('Audio');
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"][accept="audio/*"]',
    );
    if (!fileInput) {
      throw new Error('Audio file input was not found.');
    }

    expect(mocks.openProjectSettings).not.toHaveBeenCalled();
    expect(mocks.onSelectLayer).not.toHaveBeenCalledWith(null);

    await act(async () => {
      root.unmount();
    });
  });

  it('creates and selects a video layer after file selection', async () => {
    const { container, root } = await renderAndOpenAddMenu('Video');
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"][accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov"]',
    );
    if (!fileInput) {
      throw new Error('Video file input was not found.');
    }

    const file = new File(['video'], 'Screen Recording.mov', { type: 'video/quicktime' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncHandlers();
    });

    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      {
        type: 'ADD_LAYER',
        targetScopeId: 'scope-1',
        manifest: expect.objectContaining({
          id: 'video-4fzyo',
          kind: 'visual',
          startTime: 6,
          duration: 13,
          source: expect.objectContaining({
            provider: 'video',
            track: 'visual',
            params: expect.objectContaining({
              sourceUrl: 'rendium-asset://project-1/files/mock-video.mov',
              sourceWidth: 1280,
              sourceHeight: 720,
              fit: 'contain',
            }),
          }),
        }),
      },
      {
        type: 'ADD_LAYER',
        targetScopeId: 'scope-1',
        manifest: expect.objectContaining({
          id: 'video-4fzyo-audio',
          kind: 'audio',
          startTime: 6,
          duration: 13,
          source: expect.objectContaining({
            provider: 'video',
            track: 'audio',
            params: expect.objectContaining({
              sourceUrl: 'rendium-asset://project-1/files/mock-video.mov',
            }),
          }),
        }),
      },
    ]);
    expect(mocks.onSelectLayer).toHaveBeenCalledWith('video-4fzyo');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows a codec/file compatibility message instead of creating layers for an undecodable MOV', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockIngestFile.mockRejectedValueOnce(
      new UnsupportedVideoFileError('The video failed while loading for playback.'),
    );
    const { container, root } = await renderAndOpenAddMenu('Video');
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"][accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov"]',
    );
    if (!fileInput) {
      throw new Error('Video file input was not found.');
    }

    const file = new File(['broken'], 'unsupported.mov', { type: 'video/quicktime' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncHandlers();
    });

    expect(mocks.executeAtomicIntentBatch).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('assets.unsupportedVideo', {
      message: 'The video failed while loading for playback.',
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('creates and selects an audio layer after file selection', async () => {
    const { container, root } = await renderAndOpenAddMenu('Audio');
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"][accept="audio/*"]',
    );
    if (!fileInput) {
      throw new Error('Audio file input was not found.');
    }

    const file = new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncHandlers();
    });

    expect(mocks.dispatchIntent).toHaveBeenCalledWith({
      type: 'ADD_LAYER',
      targetScopeId: 'scope-1',
      manifest: expect.objectContaining({
        id: 'audio-4fzyo',
        kind: 'audio',
        startTime: 6,
        duration: 13,
        source: expect.objectContaining({
          provider: 'audio-file',
          track: 'audio',
          params: expect.objectContaining({
            sourceUrl: 'rendium-asset://project-1/files/mock-audio.mp3',
          }),
        }),
      }),
    });
    expect(mocks.onSelectLayer).toHaveBeenCalledWith('audio-4fzyo');
    expect(mocks.showLayerPanel).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('creates an audio layer with default duration when metadata is unavailable', async () => {
    vi.mocked(readAudioDurationFromUrl).mockResolvedValueOnce(null);

    const { container, root } = await renderAndOpenAddMenu('Audio');
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"][accept="audio/*"]',
    );
    if (!fileInput) {
      throw new Error('Audio file input was not found.');
    }

    const file = new File(['audio'], 'fallback.wav', { type: 'audio/wav' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncHandlers();
    });

    expect(mocks.dispatchIntent).toHaveBeenCalledWith({
      type: 'ADD_LAYER',
      targetScopeId: 'scope-1',
      manifest: expect.objectContaining({
        id: 'audio-4fzyo',
        kind: 'audio',
        startTime: 6,
        duration: 5,
        source: expect.objectContaining({
          provider: 'audio-file',
          track: 'audio',
          params: expect.objectContaining({
            sourceUrl: 'rendium-asset://project-1/files/mock-audio.wav',
          }),
        }),
      }),
    });
    expect(mocks.onSelectLayer).toHaveBeenCalledWith('audio-4fzyo');
    expect(mocks.showLayerPanel).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
