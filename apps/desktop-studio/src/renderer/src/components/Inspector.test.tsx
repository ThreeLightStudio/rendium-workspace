// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const dispatchIntent = vi.fn();
  const dispatchTransient = vi.fn();
  const imageSource = { width: 1280, height: 720, close: vi.fn() };
  const layer = {
    id: 'image-1',
    name: 'Image Layer',
    kind: 'visual',
    startTime: 0,
    duration: 5,
    visible: true,
    opacity: 1,
  };
  const manifestLayer = {
    id: 'image-1',
    kind: 'visual',
    name: 'Image Layer',
    startTime: 0,
    duration: 5,
    source: {
      sourceId: 'source:image-1',
      provider: 'raster',
      track: 'visual',
      params: {
        sourceUrl: null,
        fit: 'contain',
      },
    },
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    },
    appearance: {
      visible: true,
      opacity: 1,
    },
  };

  const ingestFile = vi.fn(async () => 'rendium-asset://project-1/files/hash-123.png');

  return {
    dispatchIntent,
    dispatchTransient,
    imageSource,
    layer,
    manifestLayer,
    ingestFile,
  };
});

vi.mock('@rendium/engine', () => ({
  engineStore: {
    getLayerById: vi.fn(),
    getManifest: vi.fn(() => ({
      layers: { 'image-1': mocks.manifestLayer },
      layerOrder: ['image-1'],
    })),
    executeAtomicIntentBatch: vi.fn(),
  },
}));

vi.mock('../hooks/useEngineStore', () => ({
  useEngineStore: () => ({
    layers: [mocks.layer],
    dispatchIntent: mocks.dispatchIntent,
    dispatchTransient: mocks.dispatchTransient,
    duration: 10,
    getLayerById: (id: string) => (id === 'image-1' ? mocks.layer : undefined),
    width: 1920,
    height: 1080,
  }),
}));

vi.mock('../i18n/locale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../stores/studioStore', () => ({
  useStudioStore: {
    getState: () => ({
      clearSelection: vi.fn(),
      selectLayers: vi.fn(),
    }),
  },
}));

vi.mock('../utils/canonicalLayer', () => ({
  buildLayerPatchFromConfig: vi.fn((_layer, config) => ({
    ...(typeof config.name === 'string' ? { name: config.name } : {}),
    source: {
      sourceId: config.sourceUrl ?? 'source:image-1',
      provider: 'raster',
      track: 'visual',
      params: {
        sourceUrl: config.sourceUrl ?? null,
      },
    },
  })),
  getManifestForLayer: (id: string) => (id === 'image-1' ? mocks.manifestLayer : undefined),
  getSourceParam: (layer: typeof mocks.manifestLayer | undefined, key: string) =>
    layer?.source.params[key as keyof typeof layer.source.params],
  getStudioLayerType: () => 'image',
}));

vi.mock('./ImageControlPanel', () => ({
  ImageControlPanel: ({ onUpdate }: { onUpdate: (config: Record<string, unknown>) => void }) => (
    <button
      type="button"
      id="mock-image-upload"
      onClick={() =>
        onUpdate({
          imageSource: mocks.imageSource,
          sourceUrl: 'rendium-asset://project-1/files/hash-123.png',
          name: 'cover.png',
        })
      }
    >
      upload
    </button>
  ),
}));

vi.mock('./Inspector/AudioControlPanel', () => ({
  AudioControlPanel: () => null,
}));

vi.mock('./Inspector/BackgroundControlPanel', () => ({
  BackgroundControlPanel: () => null,
}));

vi.mock('./Inspector/TextControlPanel', () => ({
  TextControlPanel: () => null,
}));

vi.mock('./Inspector/TransformControlPanel', () => ({
  TransformControlPanel: () => null,
}));

vi.mock('./SpectrumControlPanel', () => ({
  SpectrumControlPanel: () => null,
}));

vi.mock('../stores/useProjectAssetsStore', () => ({
  useProjectAssetsStore: Object.assign(
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (selector: (state: any) => any) =>
      selector({
        assets: [],
        ingestFile: mocks.ingestFile,
      }),
    {
      getState: () => ({
        ingestFile: mocks.ingestFile,
      }),
    },
  ),
}));

vi.mock('./Inspector/ui', () => ({
  InspectorDisclosure: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  InspectorField: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  InspectorFileInput: (props: Record<string, unknown>) => <input type="file" {...props} />,
  InspectorGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  InspectorNumberInput: (props: Record<string, unknown>) => <input {...props} />,
  InspectorRangeInput: (props: Record<string, unknown>) => <input {...props} />,
  InspectorSection: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  InspectorValue: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

const { Inspector } = await import('./Inspector');

beforeEach(() => {
  mocks.dispatchIntent.mockClear();
  mocks.dispatchTransient.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('Inspector image commits', () => {
  it('hides the selected layer inspector when the playhead is outside its time range', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Inspector selectedLayerId="image-1" selectedLayerIds={['image-1']} currentTime={6} />,
      );
    });

    expect(container.querySelector<HTMLInputElement>('#input-image-source')).toBeNull();

    await act(async () => root.unmount());
    document.body.removeChild(container);
  });

  it('pushes uploaded image bitmap through transient runtime update before persisting JSON source', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Inspector selectedLayerId="image-1" selectedLayerIds={['image-1']} />);
    });

    const fileInput = container.querySelector<HTMLInputElement>('#input-image-source');
    if (!fileInput) {
      throw new Error('Image source file input was not rendered.');
    }

    const file = new File(['image'], 'cover.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    const originalCreateImageBitmap = global.createImageBitmap;
    global.createImageBitmap = vi.fn().mockResolvedValue(mocks.imageSource);

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    global.createImageBitmap = originalCreateImageBitmap;

    expect(mocks.dispatchTransient).toHaveBeenCalledWith({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: 'image-1',
      partial: {
        imageSource: mocks.imageSource,
        sourceUrl: 'rendium-asset://project-1/files/hash-123.png',
      },
    });
    expect(mocks.dispatchIntent).toHaveBeenCalledWith({
      type: 'UPDATE_LAYER_PROPS',
      layerId: 'image-1',
      patch: expect.objectContaining({
        name: 'cover.png',
        source: expect.objectContaining({
          params: {
            sourceUrl: 'rendium-asset://project-1/files/hash-123.png',
          },
        }),
      }),
    });
    expect(mocks.dispatchIntent.mock.calls[0]?.[0]?.patch).not.toHaveProperty('imageSource');

    await act(async () => {
      root.unmount();
    });
  });
});
