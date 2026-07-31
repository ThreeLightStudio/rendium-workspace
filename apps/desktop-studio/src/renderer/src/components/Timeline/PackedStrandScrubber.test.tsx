import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../stores/studioStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const localStorageState = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: vi.fn((key: string) => localStorageState.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageState.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      localStorageState.delete(key);
    }),
    clear: vi.fn(() => {
      localStorageState.clear();
    }),
  },
});

const mocks = vi.hoisted(() => {
  const scopeStart = {
    id: 'scope-1',
    kind: 'control',
    name: 'Scope 1',
    startTime: 0,
    duration: 30,
    control: { role: 'scopeStart' },
  };
  const layer = {
    id: 'layer-1',
    kind: 'visual',
    name: 'Layer 1',
    startTime: 10,
    duration: 10,
    source: {
      sourceId: 'video-source-1',
      provider: 'video',
    },
    isProjectAnchor: false,
    isInfinite: false,
  };
  const linkedAudio = {
    id: 'layer-1-audio',
    kind: 'audio',
    name: 'Layer 1 Audio',
    startTime: 10,
    duration: 10,
    source: {
      sourceId: 'video-source-1-audio',
      provider: 'video',
      track: 'audio',
    },
    isProjectAnchor: false,
    isInfinite: false,
  };
  const standaloneAudio = {
    id: 'music-audio',
    kind: 'audio',
    name: 'Music Bed',
    startTime: 10,
    duration: 10,
    source: {
      sourceId: 'music-source',
      provider: 'audio-file',
      track: 'audio',
    },
    isProjectAnchor: false,
    isInfinite: false,
  };
  const scopeEnd = {
    id: 'scope-1-end',
    kind: 'control',
    name: 'Scope 1 End',
    startTime: 30,
    duration: 0,
    control: { role: 'scopeEnd' },
  };

  return {
    layer,
    linkedAudio,
    standaloneAudio,
    scopeStart,
    scopeEnd,
    timelineLayers: [scopeStart, layer, scopeEnd],
    timelineLayerOrder: [scopeStart.id, layer.id, scopeEnd.id],
    dispatchIntent: vi.fn(),
    dispatchTransient: vi.fn(),
    executeAtomicIntentBatch: vi.fn(),
    getManifest: vi.fn(),
    setPxPerSec: vi.fn(),
  };
});

vi.mock('@rendium/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rendium/engine')>();

  return {
    ...actual,
    engineStore: {
      ...actual.engineStore,
      executeAtomicIntentBatch: mocks.executeAtomicIntentBatch,
      getManifest: mocks.getManifest,
    },
  };
});

vi.mock('../../hooks/useEngineStore', () => ({
  useEngineStore: () => ({
    layers: mocks.timelineLayers,
    layerOrder: mocks.timelineLayerOrder,
    hoveredLayerId: null,
    duration: 20,
    projectDuration: 25,
    pxPerSec: 20,
    width: 1920,
    height: 1080,
    dispatchIntent: mocks.dispatchIntent,
    dispatchTransient: mocks.dispatchTransient,
    setPxPerSec: mocks.setPxPerSec,
    undo: vi.fn(),
    redo: vi.fn(),
    getLayerById: vi.fn(),
  }),
}));

vi.mock('./TimeRulerCanvas', () => ({
  TimeRulerCanvas: () => <div data-f="timeline-ruler-canvas-mock" />,
}));

const { LocaleProvider } = await import('../../i18n/locale');
const { PackedStrandScrubber } = await import('./PackedStrandScrubber');

function renderScrubber(props: Partial<React.ComponentProps<typeof PackedStrandScrubber>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const seek = vi.fn();
  const onSelectLayer = vi.fn();

  act(() => {
    root.render(
      <LocaleProvider>
        <PackedStrandScrubber
          currentTime={0}
          isPlaying={false}
          timelineExtent={60}
          contentDuration={20}
          pxPerSec={20}
          seek={seek}
          onSelectLayer={onSelectLayer}
          selectedLayerId={null}
          {...props}
        />
      </LocaleProvider>,
    );
  });

  return { container, root, seek, onSelectLayer };
}

function renderScrubberIntoRoot(
  root: ReturnType<typeof createRoot>,
  props: Partial<React.ComponentProps<typeof PackedStrandScrubber>> = {},
) {
  act(() => {
    root.render(
      <LocaleProvider>
        <PackedStrandScrubber
          currentTime={0}
          isPlaying={false}
          timelineExtent={60}
          contentDuration={20}
          pxPerSec={20}
          seek={vi.fn()}
          onSelectLayer={vi.fn()}
          selectedLayerId={null}
          {...props}
        />
      </LocaleProvider>,
    );
  });
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY: 12,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}

function dispatchClick(target: Element, clientX: number): void {
  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY: 12,
    }),
  );
}

function dispatchMouseMove(target: Element, clientX: number, clientY: number): void {
  target.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    }),
  );
}

beforeEach(() => {
  mocks.dispatchIntent.mockClear();
  mocks.dispatchTransient.mockClear();
  mocks.executeAtomicIntentBatch.mockClear();
  mocks.getManifest.mockReturnValue({
    layers: {
      [mocks.scopeStart.id]: mocks.scopeStart,
      [mocks.layer.id]: mocks.layer,
      [mocks.scopeEnd.id]: mocks.scopeEnd,
    },
    layerOrder: [mocks.scopeStart.id, mocks.layer.id, mocks.scopeEnd.id],
  });
  mocks.timelineLayers = [mocks.scopeStart, mocks.layer, mocks.scopeEnd];
  mocks.timelineLayerOrder = [mocks.scopeStart.id, mocks.layer.id, mocks.scopeEnd.id];
  mocks.setPxPerSec.mockClear();
  useStudioStore.setState({
    highlightedLayerIds: [],
    hoverTime: null,
    hoveredLayerId: null,
    collapsedScopes: new Set(),
  });

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('scrubber-container')) {
      return {
        left: 0,
        top: 0,
        right: 1200,
        bottom: 100,
        width: 1200,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      };
    }

    return {
      left: 0,
      top: 0,
      right: 600,
      bottom: 100,
      width: 600,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    };
  });

  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('scrubber-scroll-container') ? 600 : 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PackedStrandScrubber layer drag history boundaries', () => {
  it('keeps the shared timeline zoom controls wired to timeline zoom actions', () => {
    const { container, root } = renderScrubber({ pxPerSec: 30 });
    const zoomOut = container.querySelector(
      '[aria-label="Zoom out timeline"]',
    ) as HTMLButtonElement | null;
    const resetZoom = container.querySelector(
      '[aria-label="Reset timeline zoom to default"]',
    ) as HTMLButtonElement | null;
    const zoomIn = container.querySelector(
      '[aria-label="Zoom in timeline"]',
    ) as HTMLButtonElement | null;

    expect(zoomOut).toBeTruthy();
    expect(resetZoom).toBeTruthy();
    expect(zoomIn).toBeTruthy();
    expect(resetZoom?.textContent).toBe('150%');

    act(() => {
      zoomOut?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      resetZoom?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      zoomIn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.setPxPerSec).toHaveBeenNthCalledWith(1, 30 / 1.1);
    expect(mocks.setPxPerSec).toHaveBeenNthCalledWith(2, 20);
    expect(mocks.setPxPerSec).toHaveBeenNthCalledWith(3, 30 * 1.1);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('does not open the layer hover tooltip above the rendered strand track', () => {
    const { container, root } = renderScrubber();
    const scrubber = container.querySelector(
      '[data-f="timeline-scrubber-container"]',
    ) as HTMLElement | null;
    const strand = container.querySelector('.strand-item') as HTMLElement | null;
    expect(scrubber).not.toBeNull();
    expect(strand).not.toBeNull();

    act(() => {
      dispatchMouseMove(scrubber as HTMLElement, 240, 12);
    });

    expect(container.querySelector('[data-f="timeline-hover-tooltip"]')).toBeNull();

    const renderedStrandY = Number.parseFloat(strand?.style.top ?? '0') + 1;

    act(() => {
      dispatchMouseMove(scrubber as HTMLElement, 240, renderedStrandY);
    });

    expect(container.querySelector('[data-f="timeline-hover-tooltip"]')).not.toBeNull();

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('treats sub-threshold strand movement as a timeline seek without committing history', () => {
    const { container, root, seek } = renderScrubber();
    const strand = container.querySelector('.strand-item');
    expect(strand).not.toBeNull();

    act(() => {
      dispatchPointer(strand as Element, 'pointerdown', 240);
      dispatchPointer(strand as Element, 'pointermove', 240.1);
      dispatchPointer(strand as Element, 'pointerup', 240.1);
      dispatchClick(strand as Element, 240.1);
    });

    expect(mocks.dispatchTransient).not.toHaveBeenCalled();
    expect(mocks.dispatchIntent).not.toHaveBeenCalled();
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek.mock.calls[0]?.[0]).toBeCloseTo(12.005);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('commits one history intent for an intentional layer drag', () => {
    const { container, root, seek } = renderScrubber();
    const strand = container.querySelector('.strand-item');
    expect(strand).not.toBeNull();

    act(() => {
      dispatchPointer(strand as Element, 'pointerdown', 240);
      dispatchPointer(strand as Element, 'pointermove', 280);
      dispatchPointer(strand as Element, 'pointerup', 280);
      dispatchClick(strand as Element, 280);
    });

    expect(mocks.dispatchTransient).toHaveBeenCalledWith({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: 'layer-1',
      partial: { startTime: 12 },
    });
    expect(mocks.dispatchIntent).toHaveBeenCalledWith({
      type: 'CHANGE_START_TIME',
      layerId: 'layer-1',
      startTime: 12,
    });
    expect(seek).not.toHaveBeenCalled();

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('drags a linked audio selection with its video in one transient and history batch', () => {
    mocks.timelineLayers = [mocks.scopeStart, mocks.layer, mocks.linkedAudio, mocks.scopeEnd];
    mocks.timelineLayerOrder = mocks.timelineLayers.map((layer) => layer.id);
    mocks.getManifest.mockReturnValue({
      layers: {
        [mocks.scopeStart.id]: mocks.scopeStart,
        [mocks.layer.id]: mocks.layer,
        [mocks.linkedAudio.id]: mocks.linkedAudio,
        [mocks.scopeEnd.id]: mocks.scopeEnd,
      },
      layerOrder: mocks.timelineLayerOrder,
    });
    const { container, root, seek } = renderScrubber();
    const audioStrand = container.querySelector('[title="Layer 1 Audio"]');
    expect(audioStrand).not.toBeNull();

    act(() => {
      dispatchPointer(audioStrand as Element, 'pointerdown', 240);
      dispatchPointer(audioStrand as Element, 'pointermove', 280);
      dispatchPointer(audioStrand as Element, 'pointerup', 280);
      dispatchClick(audioStrand as Element, 280);
    });

    expect(mocks.dispatchTransient).toHaveBeenCalledWith({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: 'layer-1-audio',
      partial: { startTime: 12 },
    });
    expect(mocks.dispatchTransient).toHaveBeenCalledWith({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: 'layer-1',
      partial: { startTime: 12 },
    });
    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledTimes(1);
    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      { type: 'CHANGE_START_TIME', layerId: 'layer-1-audio', startTime: 12 },
      { type: 'CHANGE_START_TIME', layerId: 'layer-1', startTime: 12 },
    ]);
    expect(mocks.dispatchIntent).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('keeps standalone audio independent during a timeline drag', () => {
    mocks.timelineLayers = [mocks.scopeStart, mocks.standaloneAudio, mocks.scopeEnd];
    mocks.timelineLayerOrder = mocks.timelineLayers.map((layer) => layer.id);
    mocks.getManifest.mockReturnValue({
      layers: {
        [mocks.scopeStart.id]: mocks.scopeStart,
        [mocks.standaloneAudio.id]: mocks.standaloneAudio,
        [mocks.scopeEnd.id]: mocks.scopeEnd,
      },
      layerOrder: mocks.timelineLayerOrder,
    });
    const { container, root } = renderScrubber();
    const audioStrand = container.querySelector('[title="Music Bed"]');
    expect(audioStrand).not.toBeNull();

    act(() => {
      dispatchPointer(audioStrand as Element, 'pointerdown', 240);
      dispatchPointer(audioStrand as Element, 'pointermove', 280);
      dispatchPointer(audioStrand as Element, 'pointerup', 280);
    });

    expect(mocks.dispatchTransient).toHaveBeenCalledWith({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: 'music-audio',
      partial: { startTime: 12 },
    });
    expect(mocks.dispatchIntent).toHaveBeenCalledWith({
      type: 'CHANGE_START_TIME',
      layerId: 'music-audio',
      startTime: 12,
    });
    expect(mocks.executeAtomicIntentBatch).not.toHaveBeenCalled();

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('drags a linked video selection with its audio in one transient and history batch', () => {
    mocks.timelineLayers = [mocks.scopeStart, mocks.layer, mocks.linkedAudio, mocks.scopeEnd];
    mocks.timelineLayerOrder = mocks.timelineLayers.map((layer) => layer.id);
    mocks.getManifest.mockReturnValue({
      layers: {
        [mocks.scopeStart.id]: mocks.scopeStart,
        [mocks.layer.id]: mocks.layer,
        [mocks.linkedAudio.id]: mocks.linkedAudio,
        [mocks.scopeEnd.id]: mocks.scopeEnd,
      },
      layerOrder: mocks.timelineLayerOrder,
    });
    const { container, root } = renderScrubber();
    const videoStrand = container.querySelector('[title="Layer 1"]');
    expect(videoStrand).not.toBeNull();

    act(() => {
      dispatchPointer(videoStrand as Element, 'pointerdown', 240);
      dispatchPointer(videoStrand as Element, 'pointermove', 280);
      dispatchPointer(videoStrand as Element, 'pointerup', 280);
    });

    expect(mocks.dispatchTransient).toHaveBeenCalledWith({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: 'layer-1',
      partial: { startTime: 12 },
    });
    expect(mocks.dispatchTransient).toHaveBeenCalledWith({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: 'layer-1-audio',
      partial: { startTime: 12 },
    });
    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      { type: 'CHANGE_START_TIME', layerId: 'layer-1', startTime: 12 },
      { type: 'CHANGE_START_TIME', layerId: 'layer-1-audio', startTime: 12 },
    ]);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('gives both layers of a linked pair the same selected and hovered timeline treatment', () => {
    mocks.timelineLayers = [mocks.scopeStart, mocks.layer, mocks.linkedAudio, mocks.scopeEnd];
    mocks.timelineLayerOrder = mocks.timelineLayers.map((layer) => layer.id);
    mocks.getManifest.mockReturnValue({
      layers: {
        [mocks.scopeStart.id]: mocks.scopeStart,
        [mocks.layer.id]: mocks.layer,
        [mocks.linkedAudio.id]: mocks.linkedAudio,
        [mocks.scopeEnd.id]: mocks.scopeEnd,
      },
      layerOrder: mocks.timelineLayerOrder,
    });
    const { container, root } = renderScrubber({ selectedLayerId: 'layer-1' });
    const videoStrand = container.querySelector('[title="Layer 1"]') as HTMLElement | null;
    const audioStrand = container.querySelector('[title="Layer 1 Audio"]') as HTMLElement | null;
    expect(videoStrand).not.toBeNull();
    expect(audioStrand).not.toBeNull();
    expect(videoStrand?.style.backgroundColor).toBe(audioStrand?.style.backgroundColor);
    expect(videoStrand?.style.border).toBe('1.5px solid rgb(255, 255, 255)');
    expect(audioStrand?.style.border).toBe('1.5px solid rgb(255, 255, 255)');

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('hovers both strands when either member of a linked pair is under the pointer', () => {
    mocks.timelineLayers = [mocks.scopeStart, mocks.layer, mocks.linkedAudio, mocks.scopeEnd];
    mocks.timelineLayerOrder = mocks.timelineLayers.map((layer) => layer.id);
    mocks.getManifest.mockReturnValue({
      layers: {
        [mocks.scopeStart.id]: mocks.scopeStart,
        [mocks.layer.id]: mocks.layer,
        [mocks.linkedAudio.id]: mocks.linkedAudio,
        [mocks.scopeEnd.id]: mocks.scopeEnd,
      },
      layerOrder: mocks.timelineLayerOrder,
    });
    const { container, root } = renderScrubber();
    const scrubber = container.querySelector('[data-f="timeline-scrubber-container"]');
    const videoStrand = container.querySelector('[title="Layer 1"]') as HTMLElement | null;
    const audioStrand = container.querySelector('[title="Layer 1 Audio"]') as HTMLElement | null;
    expect(scrubber).not.toBeNull();
    expect(videoStrand).not.toBeNull();
    expect(audioStrand).not.toBeNull();

    act(() => {
      dispatchMouseMove(
        scrubber as HTMLElement,
        240,
        Number.parseFloat(audioStrand?.style.top ?? '0') + 1,
      );
    });

    expect(videoStrand?.style.border).toBe('1px solid rgba(255, 255, 255, 0.4)');
    expect(audioStrand?.style.border).toBe('1px solid rgba(255, 255, 255, 0.4)');

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('scrolls the timeline back to the playhead after a paused jump to start', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    renderScrubberIntoRoot(root, { currentTime: 40 });

    const scrollContainer = container.querySelector(
      '.scrubber-scroll-container',
    ) as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();

    if (scrollContainer) {
      scrollContainer.scrollLeft = 900;
    }

    renderScrubberIntoRoot(root, { currentTime: 0 });

    expect(scrollContainer?.scrollLeft).toBe(0);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('disables timeline edit helper actions without an active selected layer', () => {
    const { container, root } = renderScrubber({ currentTime: 0, selectedLayerId: 'layer-1' });

    const splitButton = container.querySelector(
      '[data-f="timeline-edit-split"]',
    ) as HTMLButtonElement | null;
    expect(splitButton).not.toBeNull();
    expect(splitButton?.disabled).toBe(true);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('keeps non-cut helper actions enabled at the selected layer end', () => {
    const { container, root } = renderScrubber({ currentTime: 20, selectedLayerId: 'layer-1' });

    const splitButton = container.querySelector(
      '[data-f="timeline-edit-split"]',
    ) as HTMLButtonElement | null;
    const jumpStartButton = container.querySelector(
      '[data-f="timeline-edit-jump-start"]',
    ) as HTMLButtonElement | null;

    expect(splitButton?.disabled).toBe(true);
    expect(jumpStartButton?.disabled).toBe(false);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('enables cut helper actions for the layer under the playhead when no layer is selected', () => {
    const { container, root } = renderScrubber({ currentTime: 15, selectedLayerId: null });

    const splitButton = container.querySelector(
      '[data-f="timeline-edit-split"]',
    ) as HTMLButtonElement | null;
    expect(splitButton).not.toBeNull();
    expect(splitButton?.disabled).toBe(false);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('trims the selected layer end at the current playhead', () => {
    const { container, root } = renderScrubber({ currentTime: 15, selectedLayerId: 'layer-1' });

    const trimEndButton = container.querySelector(
      '[data-f="timeline-edit-trim-end"]',
    ) as HTMLButtonElement | null;
    expect(trimEndButton).not.toBeNull();

    act(() => {
      trimEndButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.executeAtomicIntentBatch).toHaveBeenCalledWith([
      {
        type: 'CHANGE_DURATION',
        layerId: 'layer-1',
        duration: 5,
      },
    ]);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('splits the selected layer and selects the trailing segment', () => {
    const { container, root, onSelectLayer } = renderScrubber({
      currentTime: 15,
      selectedLayerId: 'layer-1',
    });

    const splitButton = container.querySelector(
      '[data-f="timeline-edit-split"]',
    ) as HTMLButtonElement | null;
    expect(splitButton).not.toBeNull();

    act(() => {
      splitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const batch = mocks.executeAtomicIntentBatch.mock.calls[0]?.[0];
    expect(batch).toEqual([
      {
        type: 'CHANGE_DURATION',
        layerId: 'layer-1',
        duration: 5,
      },
      expect.objectContaining({
        type: 'ADD_LAYER',
        manifest: expect.objectContaining({
          id: expect.stringMatching(/^layer-1-split-/),
          startTime: 15,
          duration: 5,
          source: expect.objectContaining({
            clipOffset: 5,
          }),
        }),
        targetScopeId: 'scope-1',
      }),
    ]);
    expect(onSelectLayer).toHaveBeenCalledWith(expect.stringMatching(/^layer-1-split-/));

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('moves the playhead by one frame from the helper toolbar', () => {
    const { container, root, seek } = renderScrubber({
      currentTime: 15,
      selectedLayerId: 'layer-1',
    });

    const stepForwardButton = container.querySelector(
      '[data-f="timeline-edit-step-forward-frame"]',
    ) as HTMLButtonElement | null;
    expect(stepForwardButton).not.toBeNull();

    act(() => {
      stepForwardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(seek).toHaveBeenCalledWith(15 + 1 / 30);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('opens the timeline shortcut table from the zoom toolbar', () => {
    const { container, root } = renderScrubber({ currentTime: 15, selectedLayerId: 'layer-1' });

    const shortcutsButton = container.querySelector(
      '[data-f="timeline-shortcuts-button"]',
    ) as HTMLButtonElement | null;
    expect(shortcutsButton).not.toBeNull();

    act(() => {
      shortcutsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-f="timeline-shortcuts-table"]')).not.toBeNull();
    expect(container.textContent).toContain('Shift+]');
    expect(container.textContent).toContain('Space');

    const closeButton = container.querySelector(
      '[data-f="timeline-shortcuts-close-button"]',
    ) as HTMLButtonElement | null;
    expect(closeButton).not.toBeNull();

    act(() => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-f="timeline-shortcuts-table"]')).toBeNull();

    act(() => root.unmount());
    document.body.removeChild(container);
  });
});
