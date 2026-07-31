import type React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n/locale', () => ({
  translate: (key: string) => key,
}));

vi.mock('../utils/canonicalLayer', () => ({
  getManifestForLayer: (layer: { manifest?: unknown }) => layer.manifest,
  getScopeRole: () => undefined,
  getSourceParam: (
    manifest: { source?: { params?: Record<string, unknown> } } | undefined,
    key: string,
  ) => manifest?.source?.params?.[key],
  getStudioLayerClassName: (layer: { studioType?: string }) =>
    (layer.studioType ?? 'image').replace(':', '-'),
  getStudioLayerType: (layer: { studioType?: string }) => layer.studioType ?? 'image',
}));

vi.mock('../utils/layer', () => ({
  getLayerColor: () => '#fff',
  getLayerIcon: (type: string) => <span data-layer-icon={type} />,
  getLayerLabel: (layer: { name?: string; id: string }) => layer.name ?? layer.id,
}));

const { LayerPanelItem } = await import('./LayerPanelItem');

beforeEach(() => {
  document.body.innerHTML = '';
});

function renderLayerPanelItem(
  layer: Record<string, unknown>,
  overrides: Partial<React.ComponentProps<typeof LayerPanelItem>> = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const props: React.ComponentProps<typeof LayerPanelItem> = {
    layer: layer as unknown as React.ComponentProps<typeof LayerPanelItem>['layer'],
    depth: 0,
    onRemove: vi.fn(),
    onToggle: vi.fn(),
    onToggleMute: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };

  return { container, root, props };
}

describe('LayerPanelItem', () => {
  it('uses the leading control as an audio mute toggle for audio layers', async () => {
    const onToggleMute = vi.fn();
    const onToggle = vi.fn();
    const { container, root, props } = renderLayerPanelItem(
      {
        id: 'audio-1',
        name: 'Voice track',
        studioType: 'audio',
        startTime: 0,
        duration: 10,
        muted: false,
      },
      { onToggleMute, onToggle },
    );

    await act(async () => {
      root.render(<LayerPanelItem {...props} />);
    });

    const muteButton = container.querySelector<HTMLButtonElement>('.layer-panel-item-toggle');
    expect(muteButton?.title).toBe('audio.mute');
    expect(container.textContent).toContain('Voice track');
    expect(container.textContent).not.toContain('🔊');
    expect(container.textContent).not.toContain('Waveform');
    expect(container.textContent).not.toContain('파형');

    await act(async () => {
      muteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleMute).toHaveBeenCalledWith(true);
    expect(onToggle).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('keeps visibility toggling for visual layers', async () => {
    const onToggle = vi.fn();
    const onToggleMute = vi.fn();
    const { container, root, props } = renderLayerPanelItem(
      {
        id: 'image-1',
        name: 'Hero image',
        studioType: 'image',
        startTime: 0,
        duration: 5,
        visible: true,
        appearance: { visible: true, opacity: 1 },
        opacity: 1,
        isSetupFor: () => true,
        setup: async () => undefined,
        draw: () => undefined,
      },
      { onToggle, onToggleMute },
    );

    await act(async () => {
      root.render(<LayerPanelItem {...props} />);
    });

    const visibilityButton = container.querySelector<HTMLButtonElement>('.layer-panel-item-toggle');
    expect(visibilityButton?.title).toBe('layer.toggleVisibility');

    await act(async () => {
      visibilityButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onToggleMute).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
