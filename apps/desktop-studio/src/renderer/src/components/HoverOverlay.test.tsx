// @vitest-environment jsdom
import { type IProjectManifest, engineStore, normalizeProjectManifest } from '@rendium/engine';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../stores/studioStore';
import { HoverOverlay } from './HoverOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n/locale', () => ({
  useLocale: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
  }),
}));

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: { button?: number; clientX: number; clientY: number; pointerId?: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperty(event, 'button', { value: init.button ?? 0 });
  Object.defineProperty(event, 'buttons', { value: type === 'pointerup' ? 0 : 1 });
  Object.defineProperty(event, 'clientX', { value: init.clientX });
  Object.defineProperty(event, 'clientY', { value: init.clientY });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
  target.dispatchEvent(event);
}

function createManifest(): IProjectManifest {
  return normalizeProjectManifest({
    version: '1.0',
    canvasSize: { width: 1000, height: 500 },
    layers: {
      'text-1': {
        id: 'text-1',
        kind: 'visual',
        startTime: 0,
        duration: 5,
        source: {
          sourceId: 'text:text-1',
          provider: 'text',
          track: 'visual',
          params: {
            text: 'Drag me',
            fontSize: 32,
          },
        },
        transform: {
          position: { x: 100, y: 120 },
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
      },
    },
    layerOrder: ['text-1'],
  });
}

function renderOverlay(): { container: HTMLDivElement; root: Root } {
  engineStore.loadManifest(createManifest());
  useStudioStore.setState({
    selectedLayerId: 'text-1',
    selectedLayerIds: ['text-1'],
    hoveredLayerId: null,
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<HoverOverlay width={1000} height={500} />);
  });

  return { container, root };
}

describe('HoverOverlay drag history boundaries', () => {
  let baseline: IProjectManifest;

  beforeEach(() => {
    baseline = structuredClone(engineStore.getManifest());
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 500,
          width: 1000,
          height: 500,
          x: 0,
          y: 0,
          toJSON: () => undefined,
        }) as DOMRect,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useStudioStore.setState({ selectedLayerId: null, selectedLayerIds: [], hoveredLayerId: null });
    engineStore.loadManifest(baseline);
    document.body.innerHTML = '';
  });

  it('previews transform drags transiently and commits once on pointer up', () => {
    const { container, root } = renderOverlay();
    const transientSpy = vi.spyOn(engineStore, 'dispatchTransient').mockImplementation(() => {});
    const commitSpy = vi
      .spyOn(engineStore, 'executeAtomicIntentBatch')
      .mockImplementation(() => {});
    const hitTarget = container.querySelector(
      'polygon[stroke="transparent"]',
    ) as SVGPolygonElement | null;
    const svg = container.querySelector('svg') as SVGSVGElement | null;

    expect(hitTarget).toBeTruthy();
    expect(svg).toBeTruthy();

    act(() => {
      dispatchPointer(hitTarget as Element, 'pointerdown', { clientX: 110, clientY: 130 });
      dispatchPointer(svg as Element, 'pointermove', { clientX: 150, clientY: 170 });
    });

    expect(transientSpy).toHaveBeenCalled();
    expect(commitSpy).not.toHaveBeenCalled();

    act(() => {
      dispatchPointer(svg as Element, 'pointerup', { clientX: 150, clientY: 170 });
    });

    expect(commitSpy).toHaveBeenCalledTimes(1);
    const committedIntents = commitSpy.mock.calls[0]?.[0];
    const lastTransient = transientSpy.mock.calls.at(-1)?.[0];
    expect(committedIntents).toHaveLength(1);
    expect(committedIntents?.[0]).toMatchObject({
      type: 'UPDATE_TRANSFORM',
      layerId: 'text-1',
      position: lastTransient?.partial.position,
    });

    act(() => root.unmount());
  });

  it('rolls transient drag previews back on pointer cancel without history commit', () => {
    const { container, root } = renderOverlay();
    const transientSpy = vi.spyOn(engineStore, 'dispatchTransient').mockImplementation(() => {});
    const commitSpy = vi
      .spyOn(engineStore, 'executeAtomicIntentBatch')
      .mockImplementation(() => {});
    const hitTarget = container.querySelector(
      'polygon[stroke="transparent"]',
    ) as SVGPolygonElement | null;
    const svg = container.querySelector('svg') as SVGSVGElement | null;

    expect(hitTarget).toBeTruthy();
    expect(svg).toBeTruthy();

    act(() => {
      dispatchPointer(hitTarget as Element, 'pointerdown', { clientX: 110, clientY: 130 });
      dispatchPointer(svg as Element, 'pointermove', { clientX: 150, clientY: 170 });
    });

    transientSpy.mockClear();

    act(() => {
      dispatchPointer(svg as Element, 'pointercancel', { clientX: 150, clientY: 170 });
    });

    const rollback = transientSpy.mock.calls.at(-1)?.[0];
    expect(commitSpy).not.toHaveBeenCalled();
    expect(rollback).toMatchObject({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: 'text-1',
      partial: {
        position: { x: expect.closeTo(100, 5), y: expect.closeTo(120, 5) },
      },
    });

    act(() => root.unmount());
  });

  it('rolls sub-threshold transient previews back on pointer up without history commit', () => {
    const { container, root } = renderOverlay();
    const transientSpy = vi.spyOn(engineStore, 'dispatchTransient').mockImplementation(() => {});
    const commitSpy = vi
      .spyOn(engineStore, 'executeAtomicIntentBatch')
      .mockImplementation(() => {});
    const hitTarget = container.querySelector(
      'polygon[stroke="transparent"]',
    ) as SVGPolygonElement | null;
    const svg = container.querySelector('svg') as SVGSVGElement | null;

    expect(hitTarget).toBeTruthy();
    expect(svg).toBeTruthy();

    act(() => {
      dispatchPointer(hitTarget as Element, 'pointerdown', { clientX: 110, clientY: 130 });
      dispatchPointer(svg as Element, 'pointermove', { clientX: 110.1, clientY: 130.1 });
      dispatchPointer(svg as Element, 'pointerup', { clientX: 110.1, clientY: 130.1 });
    });

    const rollback = transientSpy.mock.calls.at(-1)?.[0];
    expect(commitSpy).not.toHaveBeenCalled();
    expect(rollback).toMatchObject({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: 'text-1',
      partial: {
        position: { x: expect.closeTo(100, 5), y: expect.closeTo(120, 5) },
      },
    });

    act(() => root.unmount());
  });
});
