import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n/locale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

const { ToastProvider, useToast } = await import('./ToastSystem');

function ToastSeeder(): null {
  const { add } = useToast();

  useEffect(() => {
    add('success', 'Media uploaded.', { duration: Number.POSITIVE_INFINITY });
  }, [add]);

  return null;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ToastSystem', () => {
  it('positions toast notifications at the top-right of the viewport', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ToastProvider>
          <ToastSeeder />
        </ToastProvider>,
      );
    });

    const notificationRegion = container.querySelector(
      '[aria-label="toast.notifications"]',
    ) as HTMLDivElement | null;

    expect(notificationRegion).toBeTruthy();
    expect(notificationRegion?.style.position).toBe('fixed');
    expect(notificationRegion?.style.top).toBe('24px');
    expect(notificationRegion?.style.right).toBe('24px');
    expect(notificationRegion?.style.bottom).toBe('');
    expect(notificationRegion?.textContent).toContain('Media uploaded.');

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });
});
