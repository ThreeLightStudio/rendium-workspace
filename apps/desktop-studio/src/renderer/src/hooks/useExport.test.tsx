import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockSnapshot = {
  layers: Array<{ id: string }>;
  layerOrder: string[];
  hoveredLayerId: string | null;
  duration: number;
  projectDuration: number;
  pxPerSec: number;
  width: number;
  height: number;
  undoStackSize: number;
  redoStackSize: number;
};

const { abortMock, exportVideoMock, engineStoreMock, resolveExportProfileMock, setMockSnapshot } =
  vi.hoisted(() => {
    const abortMock = vi.fn(async () => undefined);
    const exportVideoMock = vi.fn(async () => undefined);
    const resolveExportProfileMock = vi.fn(() => ({
      format: 'mp4' as const,
      resolutionPreset: '1080p' as const,
      label: '1080p',
      width: 1920,
      height: 1080,
      bitrate: 8_800_000,
      fps: 30 as const,
      recommended: 'Default / PC export',
    }));

    const defaultSnapshot: MockSnapshot = {
      layers: [{ id: 'content-layer' }],
      layerOrder: ['content-layer'],
      hoveredLayerId: null,
      duration: 12,
      projectDuration: 99,
      pxPerSec: 20,
      width: 1920,
      height: 1080,
      undoStackSize: 0,
      redoStackSize: 0,
    };

    let mockSnapshot = defaultSnapshot;

    const setMockSnapshot = (nextSnapshot: MockSnapshot) => {
      mockSnapshot = nextSnapshot;
    };

    const engineStoreMock = {
      getSnapshot: vi.fn(() => mockSnapshot),
      getManifest: vi.fn(() => ({
        projectSettings: {
          canvas: {
            backgroundColor: [0.05, 0.05, 0.07, 1],
          },
        },
      })),
      _internalScene: { layers: [{ id: 'content-layer' }] },
    };

    return {
      abortMock,
      exportVideoMock,
      engineStoreMock,
      resolveExportProfileMock,
      setMockSnapshot,
    };
  });

vi.mock('@rendium/engine', () => ({
  BACKGROUND_CONFIG: {
    DEFAULT_COLOR: [0.05, 0.05, 0.07, 1],
  },
  engineStore: engineStoreMock,
}));

vi.mock('../pipeline/WebCodecsPipeline', () => ({
  WebCodecsPipeline: vi.fn().mockImplementation(() => ({
    exportVideo: exportVideoMock,
    abort: abortMock,
  })),
}));

vi.mock('../utils/exportSettings', () => ({
  DEFAULT_EXPORT_SETTINGS: {
    format: 'mp4',
    resolutionPreset: '1080p',
    fps: 30,
  },
  resolveExportProfile: resolveExportProfileMock,
}));

const { useExport } = await import('./useExport');

let latest: ReturnType<typeof useExport> | null = null;

function Harness(): React.JSX.Element {
  latest = useExport();
  return <div />;
}

beforeEach(() => {
  abortMock.mockClear();
  exportVideoMock.mockClear();
  resolveExportProfileMock.mockClear();
  engineStoreMock.getSnapshot.mockClear();
  engineStoreMock.getManifest.mockClear();
  setMockSnapshot({
    layers: [{ id: 'content-layer' }],
    layerOrder: ['content-layer'],
    hoveredLayerId: null,
    duration: 12,
    projectDuration: 99,
    pxPerSec: 20,
    width: 1920,
    height: 1080,
    undoStackSize: 0,
    redoStackSize: 0,
  });
  latest = null;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useExport', () => {
  it('passes snapshot.duration to the export pipeline', async () => {
    setMockSnapshot({
      layers: [{ id: 'content-layer' }],
      layerOrder: ['content-layer'],
      hoveredLayerId: null,
      duration: 12,
      projectDuration: 99,
      pxPerSec: 20,
      width: 1920,
      height: 1080,
      undoStackSize: 0,
      redoStackSize: 0,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      await latest?.startExport();
    });

    expect(resolveExportProfileMock).toHaveBeenCalledTimes(1);
    expect(exportVideoMock).toHaveBeenCalledTimes(1);

    const call = exportVideoMock.mock.calls[0] as unknown as
      | [
          unknown,
          {
            duration: number;
            width: number;
            height: number;
            fps: number;
            bitrate: number;
          },
        ]
      | undefined;
    const sceneArg = call?.[0];
    const optionsArg = call?.[1];
    expect(sceneArg).toBe(engineStoreMock._internalScene);
    expect(optionsArg).toMatchObject({
      duration: 12,
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 8_800_000,
    });

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });
});
