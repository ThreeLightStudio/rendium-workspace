import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n/locale', () => ({
  useLocale: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      key === 'export.progressLabel' ? `${vars?.percent ?? 0}%` : key,
  }),
}));

const { ExportModal } = await import('./ExportModal');

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('ExportModal', () => {
  it('keeps raw export failure details hidden until requested', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ExportModal
          isExporting={false}
          progress={0.42}
          status="Failed"
          error="WebGPU device not found"
          onCancel={() => undefined}
          onClose={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain('export.userFailedTitle');
    expect(container.textContent).toContain('export.userFailedMessage');
    expect(container.textContent).toContain('export.troubleshootingHint');
    expect(container.textContent).not.toContain('WebGPU device not found');

    const detailsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('export.technicalDetails'),
    );

    if (!detailsButton) {
      throw new Error('Technical details button was not rendered.');
    }

    await act(async () => {
      detailsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('status: Failed');
    expect(container.textContent).toContain('error: WebGPU device not found');

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });

  it('can render technical details open for Storybook diagnostics states', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ExportModal
          isExporting
          progress={0.42}
          status="Rendering Frame... 42%"
          error={null}
          defaultTechnicalDetailsOpen
          onCancel={() => undefined}
          onClose={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain('export.userExportingTitle');
    expect(container.textContent).toContain('status: Rendering Frame... 42%');

    await act(async () => {
      root.unmount();
    });

    document.body.removeChild(container);
  });
});
