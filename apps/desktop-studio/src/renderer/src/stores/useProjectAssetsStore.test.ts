// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeProjectAssetFile } from '../services/projectAssetFilesystem';
import { useProjectAssetsStore } from './useProjectAssetsStore';

vi.mock('../services/projectAssetFilesystem', () => ({
  storeProjectAssetFile: vi.fn().mockResolvedValue('rendium-asset://project-1/files/mock-hash.png'),
}));

vi.mock('../services/projectAssetsStorage', () => ({
  loadProjectAssets: vi.fn().mockResolvedValue({
    projectId: 'project-1',
    assets: [],
  }),
  saveProjectAssets: vi.fn().mockResolvedValue(undefined),
}));

describe('useProjectAssetsStore', () => {
  afterEach(() => {
    useProjectAssetsStore.getState().clearActiveProject();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should set active project and load assets', async () => {
    const store = useProjectAssetsStore.getState();
    await store.setActiveProject('project-1');
    expect(useProjectAssetsStore.getState().activeProjectId).toBe('project-1');
  });

  it('should clear active project', () => {
    useProjectAssetsStore.getState().clearActiveProject();
    expect(useProjectAssetsStore.getState().activeProjectId).toBeNull();
    expect(useProjectAssetsStore.getState().assets).toEqual([]);
  });

  it('stores a successfully probed MOV as a video asset with its renderer metadata', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      HTMLMediaElement.HAVE_CURRENT_DATA,
    );
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(3024);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(1964);
    vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(1.983333);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:mov'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async () => new Uint8Array(32).buffer),
      },
    });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getPathForFile: vi.fn(() => '/tmp/Screen Recording.mov'),
      },
    });
    vi.mocked(storeProjectAssetFile).mockResolvedValueOnce(
      'rendium-asset://project-1/files/screen-recording.mov',
    );
    useProjectAssetsStore.setState({ activeProjectId: 'project-1', assets: [] });

    const file = new File(['video'], 'Screen Recording.mov', { type: 'video/quicktime' });
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    });

    await expect(useProjectAssetsStore.getState().ingestFile(file)).resolves.toBe(
      'rendium-asset://project-1/files/screen-recording.mov',
    );

    expect(storeProjectAssetFile).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        sourcePath: '/tmp/Screen Recording.mov',
      }),
    );
    expect(useProjectAssetsStore.getState().assets[0]).toMatchObject({
      assetKind: 'video',
      displayName: 'Screen Recording.mov',
      width: 3024,
      height: 1964,
      durationSeconds: 1.983333,
    });
  });
});
