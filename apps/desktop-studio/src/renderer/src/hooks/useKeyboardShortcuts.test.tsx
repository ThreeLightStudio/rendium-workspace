import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../stores/studioStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { layer, undo, redo, executeAtomicIntentBatch, getManifest } = vi.hoisted(() => {
  const layer = {
    id: 'layer-1',
    kind: 'visual',
    name: 'Layer 1',
    startTime: 10,
    duration: 10,
    isProjectAnchor: false,
    isInfinite: false,
  };
  const undo = vi.fn();
  const redo = vi.fn();
  const executeAtomicIntentBatch = vi.fn();
  const getManifest = vi.fn();
  return { layer, undo, redo, executeAtomicIntentBatch, getManifest };
});

vi.mock('@rendium/engine', () => ({
  INTENT_TYPES: {
    ADD_LAYER: 'ADD_LAYER',
    CHANGE_DURATION: 'CHANGE_DURATION',
    CHANGE_START_TIME: 'CHANGE_START_TIME',
    REORDER_LAYER: 'REORDER_LAYER',
  },
  engineStore: {
    undo,
    redo,
    executeAtomicIntentBatch,
    getManifest,
  },
}));

vi.mock('./useLayerTree', () => ({
  useLayerTree: () => ({
    visibleLayers: [layer],
  }),
}));

vi.mock('../utils/selectionActions', () => ({
  buildDeleteSelectionIntents: vi.fn(() => []),
  buildDuplicateSelectionBatch: vi.fn(() => ({
    intents: [],
    createdLayerIds: [],
  })),
}));

const { useKeyboardShortcuts } = await import('./useKeyboardShortcuts');

interface HarnessProps {
  isPlaying: boolean;
  currentTime: number;
  canPlay: boolean;
  togglePlay: () => void;
  seek: (time: number) => void;
}

function Harness(props: HarnessProps): React.JSX.Element {
  useKeyboardShortcuts(props);
  return <div />;
}

function dispatchKeydown(init: KeyboardEventInit): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
}

beforeEach(() => {
  undo.mockClear();
  redo.mockClear();
  executeAtomicIntentBatch.mockClear();
  getManifest.mockReturnValue({
    layers: {
      [layer.id]: layer,
    },
    layerOrder: [layer.id],
    projectInfo: {
      name: 'Test Project',
    },
  });
  useStudioStore.setState({ hoverTime: null, selectedLayerIds: [], selectedLayerId: null });
});

describe('useKeyboardShortcuts', () => {
  it('toggles playback on Space without rewinding at the old end', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const togglePlay = vi.fn();
    const seek = vi.fn();

    await act(async () => {
      root.render(
        <Harness isPlaying={false} currentTime={120} canPlay togglePlay={togglePlay} seek={seek} />,
      );
    });

    await act(async () => {
      dispatchKeydown({ code: 'Space', key: ' ' });
    });

    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(seek).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('seeks by transport steps for ArrowLeft, ArrowRight, and Home', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const togglePlay = vi.fn();
    const seek = vi.fn();

    await act(async () => {
      root.render(
        <Harness isPlaying={false} currentTime={65} canPlay togglePlay={togglePlay} seek={seek} />,
      );
    });

    await act(async () => {
      dispatchKeydown({ key: 'ArrowLeft' });
      dispatchKeydown({ key: 'ArrowRight' });
      dispatchKeydown({ key: 'Home' });
    });

    expect(seek).toHaveBeenNthCalledWith(1, 55);
    expect(seek).toHaveBeenNthCalledWith(2, 75);
    expect(seek).toHaveBeenNthCalledWith(3, 0);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('trims the selected timeline layer with the bracket shortcut', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const togglePlay = vi.fn();
    const seek = vi.fn();

    useStudioStore.setState({ selectedLayerId: 'layer-1', selectedLayerIds: ['layer-1'] });

    await act(async () => {
      root.render(
        <Harness isPlaying={false} currentTime={15} canPlay togglePlay={togglePlay} seek={seek} />,
      );
    });

    await act(async () => {
      dispatchKeydown({ code: 'BracketRight', key: ']' });
    });

    expect(executeAtomicIntentBatch).toHaveBeenCalledWith([
      {
        type: 'CHANGE_DURATION',
        layerId: 'layer-1',
        duration: 5,
      },
    ]);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('moves the playhead by one frame with the period shortcut', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const togglePlay = vi.fn();
    const seek = vi.fn();

    useStudioStore.setState({ selectedLayerId: 'layer-1', selectedLayerIds: ['layer-1'] });

    await act(async () => {
      root.render(
        <Harness isPlaying={false} currentTime={15} canPlay togglePlay={togglePlay} seek={seek} />,
      );
    });

    await act(async () => {
      dispatchKeydown({ code: 'Period', key: '.' });
    });

    expect(seek).toHaveBeenCalledWith(15 + 1 / 30);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('ignores timeline edit shortcuts from editable targets', async () => {
    const container = document.createElement('div');
    const input = document.createElement('input');
    document.body.appendChild(container);
    document.body.appendChild(input);
    const root = createRoot(container);
    const togglePlay = vi.fn();
    const seek = vi.fn();

    useStudioStore.setState({ selectedLayerId: 'layer-1', selectedLayerIds: ['layer-1'] });

    await act(async () => {
      root.render(
        <Harness isPlaying={false} currentTime={15} canPlay togglePlay={togglePlay} seek={seek} />,
      );
    });

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'BracketRight', key: ']', bubbles: true }),
      );
    });

    expect(executeAtomicIntentBatch).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(input);
    document.body.removeChild(container);
  });
});
