import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../stores/studioStore';
import { TIMELINE_SOFT_TARGET_SECONDS } from '../utils/timelineViewport';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MockSnapshot = {
  layers: Array<{
    id: string;
    type: string;
    startTime: number;
    duration: number;
    isSystem: boolean;
    isProjectAnchor: boolean;
  }>;
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

const { resumeSharedContext, engineStoreMock, setMockSnapshot } = vi.hoisted(() => {
  const resumeSharedContext = vi.fn(() => Promise.resolve(undefined));
  const defaultSnapshot: MockSnapshot = {
    layers: [
      {
        id: 'content-layer',
        type: 'text',
        startTime: 0,
        duration: 30,
        isSystem: false,
        isProjectAnchor: false,
      },
    ],
    layerOrder: ['content-layer'],
    hoveredLayerId: null,
    duration: 30,
    projectDuration: 35,
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
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(() => mockSnapshot),
    undo: vi.fn(),
    redo: vi.fn(),
    setPxPerSec: vi.fn(),
    getManifest: vi.fn(() => ({
      projectSettings: {
        canvas: {
          backgroundColor: [0.05, 0.05, 0.07, 1],
        },
      },
    })),
    _internalScene: null,
  };

  return { resumeSharedContext, engineStoreMock, setMockSnapshot };
});

vi.mock('@rendium/engine', () => ({
  AudioLayer: {
    resumeSharedContext,
    sharedSampleRate: 44100,
  },
  BACKGROUND_CONFIG: {
    DEFAULT_COLOR: [0.05, 0.05, 0.07, 1],
  },
  engineStore: engineStoreMock,
  getAutomationValues: vi.fn(() => ({
    spectrumSensitivity: 1,
    shakeIntensity: 0,
  })),
}));

vi.mock('../services/timelinePlaybackController', () => ({
  registerTimelineSeekHandler: vi.fn(() => () => undefined),
  hasTimelineSeekHandler: vi.fn(() => false),
  seekTimeline: vi.fn(() => false),
}));

const { useEngineLoop } = await import('./useEngineLoop');

let latest: ReturnType<typeof useEngineLoop> | null = null;

function Harness({ disabled = false }: { disabled?: boolean } = {}): React.JSX.Element {
  const canvasRef = { current: null } as React.RefObject<HTMLCanvasElement | null>;
  latest = useEngineLoop(canvasRef, { disabled });
  return <canvas ref={canvasRef} />;
}

beforeEach(() => {
  resumeSharedContext.mockClear();
  (engineStoreMock as { _internalScene: unknown })._internalScene = null;
  setMockSnapshot({
    layers: [
      {
        id: 'content-layer',
        type: 'text',
        startTime: 0,
        duration: 30,
        isSystem: false,
        isProjectAnchor: false,
      },
    ],
    layerOrder: ['content-layer'],
    hoveredLayerId: null,
    duration: 30,
    projectDuration: 35,
    pxPerSec: 20,
    width: 1920,
    height: 1080,
    undoStackSize: 0,
    redoStackSize: 0,
  });
  useStudioStore.setState({ timelineExtent: TIMELINE_SOFT_TARGET_SECONDS });
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useEngineLoop', () => {
  it('clamps seek to the current timeline extent without expanding it', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness disabled />);
    });

    await act(async () => {
      latest?.seek(TIMELINE_SOFT_TARGET_SECONDS + 800);
    });

    expect(latest?.currentTime).toBe(TIMELINE_SOFT_TARGET_SECONDS);
    expect(useStudioStore.getState().timelineExtent).toBe(TIMELINE_SOFT_TARGET_SECONDS);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('allows playback from an empty project starting at 0 seconds', async () => {
    setMockSnapshot({
      layers: [],
      layerOrder: [],
      hoveredLayerId: null,
      duration: 0,
      projectDuration: 5,
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
      latest?.seek(0);
    });

    await act(async () => {
      latest?.togglePlay();
    });

    expect(latest?.canPlay).toBe(true);
    expect(latest?.currentTime).toBe(0);
    expect(latest?.isPlaying).toBe(true);
    expect(resumeSharedContext).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('samples linked audio frequency data at the current preview time while seeking', async () => {
    const getFrequencyData = vi.fn(() => new Uint8Array([0, 128, 255]));
    const getLayerById = vi.fn(() => ({
      sourceUrl: null,
      volume: 1,
      muted: false,
      clipOffset: 0,
      audioBuffer: null,
      getFrequencyData,
    }));
    const normalizedFrames: Float32Array[] = [];
    const update = vi.fn(
      (_time: number, _deltaTime: number, getAudioData: (audioId: string) => Float32Array) => {
        normalizedFrames.push(getAudioData('audio-layer'));
      },
    );
    (engineStoreMock as { _internalScene: unknown })._internalScene = {
      getLayerById,
      layers: [],
      update,
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      latest?.seek(2.5);
    });

    expect(update).toHaveBeenCalledWith(2.5, 0, expect.any(Function));
    expect(getLayerById).toHaveBeenCalledWith('audio-layer');
    expect(getFrequencyData).toHaveBeenCalledWith(2.5);
    const normalizedFrame = normalizedFrames[0];
    expect(normalizedFrame?.[0]).toBe(0);
    expect(normalizedFrame?.[1]).toBeCloseTo(128 / 255);
    expect(normalizedFrame?.[2]).toBe(1);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('blocks Play only while active media is loading, not after a source has failed', async () => {
    const scheduledFrames: FrameRequestCallback[] = [];
    const passEncoder = { end: vi.fn() } as unknown as GPURenderPassEncoder;
    const commandEncoder = {
      beginRenderPass: vi.fn(() => passEncoder),
      finish: vi.fn(() => ({})),
    } as unknown as GPUCommandEncoder;
    const device = {
      createCommandEncoder: vi.fn(() => commandEncoder),
      queue: { submit: vi.fn() },
    } as unknown as GPUDevice;
    const scene = {
      layers: [],
      getActiveMediaLayersReadiness: vi.fn(() => 'failed'),
      update: vi.fn(),
      draw: vi.fn(),
    };

    (engineStoreMock as { _internalScene: unknown })._internalScene = scene;
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: vi.fn(async () => ({ requestDevice: async () => device })),
        getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      configure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({})) })),
    } as unknown as GPUCanvasContext);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const failedFrame = scheduledFrames.shift();
    if (!failedFrame) throw new Error('Expected the initial render frame.');
    await act(async () => {
      await failedFrame(0);
    });

    expect(latest?.mediaReadiness).toBe('failed');
    expect(latest?.isMediaReady).toBe(false);
    expect(latest?.canPlay).toBe(true);

    scene.getActiveMediaLayersReadiness.mockReturnValue('loading');
    const loadingFrame = scheduledFrames.shift();
    if (!loadingFrame) throw new Error('Expected the follow-up render frame.');
    await act(async () => {
      await loadingFrame(16);
    });

    expect(latest?.mediaReadiness).toBe('loading');
    expect(latest?.canPlay).toBe(false);

    scene.getActiveMediaLayersReadiness.mockReturnValue('ready');
    const readyFrame = scheduledFrames.shift();
    if (!readyFrame) throw new Error('Expected the ready-state render frame.');
    await act(async () => {
      await readyFrame(32);
    });

    expect(latest?.mediaReadiness).toBe('ready');
    expect(latest?.canPlay).toBe(true);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });
});
