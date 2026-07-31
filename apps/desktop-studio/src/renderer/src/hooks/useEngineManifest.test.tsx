// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let snapshot = { version: 0 };
  let projectName = 'Initial';

  return {
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    getSnapshot: vi.fn(() => snapshot),
    getManifest: vi.fn(() => ({
      version: '1.0' as const,
      projectInfo: {
        name: projectName,
        createdAt: 0,
        updatedAt: 0,
      },
      projectSettings: {
        canvas: {
          size: { width: 1920, height: 1080 },
        },
      },
      layers: {},
      layerOrder: [],
      links: {},
    })),
    emitManifestChange(nextProjectName: string) {
      projectName = nextProjectName;
      snapshot = { version: snapshot.version + 1 };
      for (const listener of listeners) {
        listener();
      }
    },
  };
});

vi.mock('@rendium/engine', () => ({
  engineStore: {
    subscribe: mocks.subscribe,
    getSnapshot: mocks.getSnapshot,
    getManifest: mocks.getManifest,
  },
}));

const { useEngineManifest } = await import('./useEngineManifest');

function Harness() {
  const manifest = useEngineManifest();

  return <div>{manifest.projectInfo.name}</div>;
}

beforeEach(() => {
  mocks.subscribe.mockClear();
  mocks.getSnapshot.mockClear();
  mocks.getManifest.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useEngineManifest', () => {
  it('uses the stable engine snapshot as the external-store value', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Harness />);
    });

    expect(container.textContent).toBe('Initial');

    act(() => {
      mocks.emitManifestChange('Updated');
    });

    expect(container.textContent).toBe('Updated');

    act(() => {
      root.unmount();
    });
  });
});
