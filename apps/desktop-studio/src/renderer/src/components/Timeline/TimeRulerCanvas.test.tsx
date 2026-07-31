import { act } from 'react';
import type React from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalPointerEvent = window.PointerEvent;

function makePointerEvent(
  type: string,
  init: { button?: number; clientX: number; pointerId: number },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    button: init.button ?? 0,
    buttons: init.button ?? 0,
    clientX: init.clientX,
    pointerId: init.pointerId,
  });
  return event;
}

const { TimeRulerCanvas } = await import('./TimeRulerCanvas');

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

  if (typeof window.PointerEvent === 'undefined') {
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      value: Event,
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();

  if (typeof originalPointerEvent === 'undefined') {
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      value: undefined,
    });
  } else {
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      value: originalPointerEvent,
    });
  }
});

describe('TimeRulerCanvas', () => {
  it('drags the ruler to pan the timeline horizontally', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const scrollContainer = document.createElement('div');
    Object.defineProperty(scrollContainer, 'clientWidth', {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(scrollContainer, 'scrollWidth', {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(scrollContainer, 'scrollLeft', {
      configurable: true,
      value: 150,
      writable: true,
    });

    const scrollContainerRef = {
      current: scrollContainer,
    } as React.RefObject<HTMLDivElement | null>;
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TimeRulerCanvas
          timelineExtent={60}
          pxPerSec={20}
          scrollContainerRef={scrollContainerRef}
        />,
      );
    });

    const host = container.firstElementChild as HTMLDivElement;
    expect(host).toBeTruthy();

    await act(async () => {
      host.dispatchEvent(
        makePointerEvent('pointerdown', { button: 0, clientX: 200, pointerId: 1 }),
      );
      host.dispatchEvent(
        makePointerEvent('pointermove', { button: 0, clientX: 120, pointerId: 1 }),
      );
    });

    expect(scrollContainer.scrollLeft).toBe(230);
    expect(host.style.cursor).toBe('grabbing');

    await act(async () => {
      host.dispatchEvent(makePointerEvent('pointerup', { button: 0, clientX: 120, pointerId: 1 }));
    });

    expect(host.style.cursor).toBe('grab');

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });
});
