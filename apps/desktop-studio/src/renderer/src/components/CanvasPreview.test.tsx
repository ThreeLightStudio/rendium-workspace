import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n/locale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./HoverOverlay', () => ({
  HoverOverlay: () => null,
}));

const { CanvasPreview } = await import('./CanvasPreview');

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  ) as HTMLButtonElement | undefined;

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CanvasPreview', () => {
  it('renders beginner-facing preview preparation copy without exposing WebGPU inline', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const canvasRef = { current: null } as React.RefObject<HTMLCanvasElement | null>;

    await act(async () => {
      root.render(
        <CanvasPreview
          canvasRef={canvasRef}
          isReady={false}
          currentTime={0}
          isPlaying={false}
          canPlay={false}
          mediaReadiness="ready"
          seek={() => undefined}
          togglePlay={() => undefined}
          width={1280}
          height={720}
        />,
      );
    });

    expect(container.textContent).toContain('canvas.previewPreparing');
    expect(container.textContent).toContain('canvas.previewPreparingHint');
    expect(container.textContent).not.toContain('WebGPU');
    expect(container.querySelector('[title="canvas.previewTechnicalDetail"]')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('renders media preparation copy after the canvas is ready', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const canvasRef = { current: null } as React.RefObject<HTMLCanvasElement | null>;

    await act(async () => {
      root.render(
        <CanvasPreview
          canvasRef={canvasRef}
          isReady
          currentTime={0}
          isPlaying={false}
          canPlay={false}
          mediaReadiness="loading"
          seek={() => undefined}
          togglePlay={() => undefined}
          width={1280}
          height={720}
        />,
      );
    });

    expect(container.textContent).toContain('canvas.mediaPreparing');
    expect(container.textContent).toContain('canvas.mediaPreparingHint');
    expect(container.querySelector('[title="canvas.mediaPreparingDetail"]')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('shows a media failure without leaving Play disabled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const canvasRef = { current: null } as React.RefObject<HTMLCanvasElement | null>;

    await act(async () => {
      root.render(
        <CanvasPreview
          canvasRef={canvasRef}
          isReady
          currentTime={0}
          isPlaying={false}
          canPlay
          mediaReadiness="failed"
          seek={() => undefined}
          togglePlay={() => undefined}
          width={1280}
          height={720}
        />,
      );
    });

    expect(container.textContent).toContain('canvas.mediaFailed');
    expect(container.textContent).toContain('canvas.mediaFailedHint');
    expect(container.querySelector('[data-f="preview-media-error"]')).toBeTruthy();
    expect(getButton(container, 'Play').disabled).toBe(false);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('renders active transport buttons and the infinite timeline badge', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const canvasRef = { current: null } as React.RefObject<HTMLCanvasElement | null>;
    const seek = vi.fn();
    const togglePlay = vi.fn();

    await act(async () => {
      root.render(
        <CanvasPreview
          canvasRef={canvasRef}
          isReady
          currentTime={65}
          isPlaying={false}
          canPlay
          mediaReadiness="ready"
          seek={seek}
          togglePlay={togglePlay}
          width={1280}
          height={720}
        />,
      );
    });

    const startButton = getButton(container, 'Jump to start');
    const backButton = getButton(container, 'Seek backward 10 seconds');
    const playButton = getButton(container, 'Play');
    const forwardButton = getButton(container, 'Seek forward 10 seconds');
    const timeBadge = container.querySelector('[title="canvas.infiniteTimeline"]');

    expect(timeBadge).toBeTruthy();
    expect(startButton.textContent?.trim() ?? '').toBe('');
    expect(backButton.textContent?.trim() ?? '').toBe('');
    expect(forwardButton.textContent?.trim() ?? '').toBe('');
    expect(startButton.disabled).toBe(false);
    expect(backButton.disabled).toBe(false);
    expect(forwardButton.disabled).toBe(false);
    expect(playButton.disabled).toBe(false);
    expect(playButton.textContent).toContain('PLAY');
    expect(timeBadge?.textContent ?? '').toContain('∞');
    expect(timeBadge?.textContent ?? '').not.toContain('/');

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      forwardButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      playButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(seek).toHaveBeenNthCalledWith(1, 0);
    expect(seek).toHaveBeenNthCalledWith(2, 55);
    expect(seek).toHaveBeenNthCalledWith(3, 75);
    expect(togglePlay).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('auto-fits a portrait project inside the measured preview viewport', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 1,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('canvas-viewport')) {
        return {
          left: 0,
          top: 0,
          right: 800,
          bottom: 400,
          width: 800,
          height: 400,
          x: 0,
          y: 0,
          toJSON: () => undefined,
        };
      }

      return {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      };
    });

    vi.stubGlobal(
      'ResizeObserver',
      class {
        private readonly callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }

        observe() {
          this.callback([], this as unknown as ResizeObserver);
        }

        disconnect() {
          return undefined;
        }

        unobserve() {
          return undefined;
        }
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const canvasRef = { current: null } as React.RefObject<HTMLCanvasElement | null>;

    await act(async () => {
      root.render(
        <CanvasPreview
          canvasRef={canvasRef}
          isReady
          currentTime={0}
          isPlaying={false}
          canPlay
          mediaReadiness="ready"
          seek={() => undefined}
          togglePlay={() => undefined}
          width={1080}
          height={1920}
        />,
      );
    });

    const fitSurface = container.querySelector('.canvas-fit-wrapper') as HTMLDivElement | null;
    const canvas = container.querySelector('canvas') as HTMLCanvasElement | null;

    expect(fitSurface).toBeTruthy();
    expect(fitSurface?.style.width).toBe('225px');
    expect(fitSurface?.style.height).toBe('400px');
    expect(canvas?.width).toBe(225);
    expect(canvas?.height).toBe(400);

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('renders a preview fit control that remeasures the viewport without zoom controls', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 1,
    });
    let viewportRect = {
      left: 0,
      top: 0,
      right: 960,
      bottom: 540,
      width: 960,
      height: 540,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('canvas-viewport')) {
        return viewportRect;
      }

      return {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      };
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const canvasRef = { current: null } as React.RefObject<HTMLCanvasElement | null>;

    await act(async () => {
      root.render(
        <CanvasPreview
          canvasRef={canvasRef}
          isReady
          currentTime={0}
          isPlaying={false}
          canPlay
          mediaReadiness="ready"
          seek={() => undefined}
          togglePlay={() => undefined}
          width={1920}
          height={1080}
        />,
      );
    });

    const fitSurface = container.querySelector('.canvas-fit-wrapper') as HTMLDivElement | null;
    const fitButton = getButton(container, 'canvas.fitPreviewToViewport');
    const previewContainer = container.querySelector(
      '.canvas-preview-container',
    ) as HTMLDivElement | null;
    const viewport = container.querySelector('.canvas-viewport') as HTMLDivElement | null;

    expect(fitButton.textContent).toBe('canvas.fitPreview');
    expect(previewContainer?.style.minHeight).toBe('0px');
    expect(viewport?.style.position).toBe('absolute');
    expect(container.querySelector('[aria-label="Preview zoom out"]')).toBeNull();
    expect(container.querySelector('[aria-label="Preview zoom in"]')).toBeNull();
    expect(fitSurface?.style.width).toBe('960px');
    expect(fitSurface?.style.height).toBe('540px');

    viewportRect = {
      ...viewportRect,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
    };

    await act(async () => {
      fitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(Number.parseFloat(fitSurface?.style.width ?? '')).toBeCloseTo(711.111, 3);
    expect(fitSurface?.style.height).toBe('400px');

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('positions the grid toggle on the top-left and keeps preview fit on the top-right', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const canvasRef = { current: null } as React.RefObject<HTMLCanvasElement | null>;

    await act(async () => {
      root.render(
        <CanvasPreview
          canvasRef={canvasRef}
          isReady
          currentTime={0}
          isPlaying={false}
          canPlay
          mediaReadiness="ready"
          seek={() => undefined}
          togglePlay={() => undefined}
          width={1280}
          height={720}
        />,
      );
    });

    const gridButton = container.querySelector(
      '[title="canvas.toggleGrid"]',
    ) as HTMLButtonElement | null;
    const fitButton = getButton(container, 'canvas.fitPreviewToViewport');
    const gridControl = gridButton?.parentElement as HTMLDivElement | null;
    const fitControl = fitButton.parentElement?.parentElement as HTMLDivElement | null;

    expect(gridButton).toBeTruthy();
    expect(gridControl).toBeTruthy();
    expect(fitControl).toBeTruthy();
    expect(gridControl?.contains(gridButton)).toBe(true);
    expect(gridControl?.style.top).toBe('24px');
    expect(gridControl?.style.left).toBe('24px');
    expect(gridControl?.style.right).toBe('');
    expect(fitControl?.style.top).toBe('24px');
    expect(fitControl?.style.right).toBe('24px');
    expect(fitControl?.style.left).toBe('');

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });
});
