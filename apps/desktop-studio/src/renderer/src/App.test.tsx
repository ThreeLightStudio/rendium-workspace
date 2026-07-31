import type { IProjectManifest } from '@rendium/engine';
// @vitest-environment jsdom
import type React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  activeProjectId: null as string | null,
  setActiveProject: vi.fn(async (projectId: string) => {
    mocks.activeProjectId = projectId;
  }),
  clearActiveProject: vi.fn(() => {
    mocks.activeProjectId = null;
  }),
  getAllProjectMetas: vi.fn<
    [],
    Promise<
      Array<{
        id: string;
        projectInfo: IProjectManifest['projectInfo'];
        projectSettings: IProjectManifest['projectSettings'];
        duration: number;
      }>
    >
  >(async () => []),
  load: vi.fn<[string], Promise<IProjectManifest | undefined>>(async () => undefined),
  save: vi.fn(async () => undefined),
  studioEditorProps: null as null | {
    activeProjectId: string;
  },
}));

vi.mock('./services/StorageService', () => ({
  StorageService: {
    getAllProjectMetas: mocks.getAllProjectMetas,
    load: mocks.load,
    save: mocks.save,
  },
}));

vi.mock('./components/StudioEditor', () => ({
  StudioEditor: (props: { activeProjectId: string }) => {
    mocks.studioEditorProps = props;
    return <div>studio editor</div>;
  },
}));

vi.mock('./components/ToastSystem', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./hooks/useEngineErrorBridge', () => ({
  useEngineErrorBridge: vi.fn(),
}));

vi.mock('./i18n/locale', () => ({
  LocaleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./stores/useProjectAssetsStore', () => ({
  useProjectAssetsStore: {
    getState: () => ({
      activeProjectId: mocks.activeProjectId,
      setActiveProject: mocks.setActiveProject,
      clearActiveProject: mocks.clearActiveProject,
    }),
  },
}));

vi.mock('@rendium/engine', () => ({
  PROJECT_CONFIG: {
    DEFAULT_NAME: 'Untitled Project',
  },
  SCENE_CONFIG: {
    DEFAULT_RESOLUTION: { width: 1920, height: 1080 },
  },
  engineStore: {
    loadManifest: vi.fn(),
    createBlankProject: vi.fn(() => ({
      projectInfo: { createdAt: 123456 },
    })),
  },
}));

vi.mock('./stores/studioStore', () => ({
  useStudioStore: {
    getState: () => ({
      loadScene: vi.fn(),
    }),
  },
}));

const { default: App } = await import('./App');

async function renderApp() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });

  return { container, root };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  mocks.activeProjectId = null;
  mocks.studioEditorProps = null;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('App integration', () => {
  it('creates a new project if no projects exist and renders StudioEditor', async () => {
    mocks.getAllProjectMetas.mockResolvedValue([]);
    mocks.activeProjectId = null;

    const { container, root } = await renderApp();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('studio editor');
    expect(mocks.save).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('loads the first project if one exists and renders StudioEditor', async () => {
    mocks.getAllProjectMetas.mockResolvedValue([
      {
        id: 'existing-id',
        projectInfo: {
          name: 'Existing Project',
          createdAt: 123456,
          updatedAt: 123456,
        },
        projectSettings: {
          canvas: {
            size: { width: 1920, height: 1080 },
          },
        },
        duration: 10,
      },
    ]);
    mocks.load.mockResolvedValue({
      version: '1.0',
      projectInfo: { createdAt: 123456, name: 'Existing Project', updatedAt: 123456 },
      projectSettings: {
        canvas: {
          size: { width: 1920, height: 1080 },
        },
      },
      layers: {},
      layerOrder: [],
      links: {},
    });
    mocks.activeProjectId = null;

    const { container, root } = await renderApp();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('studio editor');
    expect(mocks.load).toHaveBeenCalledWith('existing-id');

    await act(async () => {
      root.unmount();
    });
  });
});
