import { create } from 'zustand';
import { storeProjectAssetFile } from '../services/projectAssetFilesystem';
import { loadProjectAssets, saveProjectAssets } from '../services/projectAssetsStorage';
import { isVideoImportCandidate, probePlayableVideo } from '../utils/videoImport';
import type { ProjectAssetRecord } from './projectAssetTypes';

interface ProjectAssetsState {
  activeProjectId: string | null;
  assets: ProjectAssetRecord[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  setActiveProject: (projectId: string) => Promise<void>;
  clearActiveProject: () => void;
  ingestFile: (file: File) => Promise<string>;
  flushPersistence: () => Promise<void>;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(projectId: string | null, assets: ProjectAssetRecord[]): void {
  if (!projectId) return;
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    useProjectAssetsStore.setState({ isSaving: true });
    void saveProjectAssets(projectId, assets)
      .catch((error) => console.error('[ProjectAssetsStore] Failed to persist assets:', error))
      .finally(() => useProjectAssetsStore.setState({ isSaving: false }));
  }, 250);
}

async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function inferAssetKind(fileName: string, mimeType: string): 'image' | 'audio' | 'video' {
  if (
    mimeType === 'video/mp4' ||
    mimeType === 'video/webm' ||
    mimeType === 'video/quicktime' ||
    isVideoImportCandidate(fileName)
  ) {
    return 'video';
  }
  if (mimeType.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i.test(fileName)) {
    return 'audio';
  }
  return 'image';
}

async function validateAssetSource(sourceUrl: string): Promise<boolean> {
  if (!sourceUrl) return false;
  const readFile = typeof window !== 'undefined' ? window.api?.readFileAsArrayBuffer : undefined;
  if (!readFile) return false;
  try {
    await readFile(sourceUrl);
    return true;
  } catch {
    return false;
  }
}

export const useProjectAssetsStore = create<ProjectAssetsState>((set, get) => ({
  activeProjectId: null,
  assets: [],
  isLoading: false,
  isSaving: false,
  error: null,

  setActiveProject: async (projectId: string) => {
    if (!projectId) return;
    set({ activeProjectId: projectId, isLoading: true, error: null });
    try {
      const bundle = await loadProjectAssets(projectId);
      const loadedAssets = bundle?.assets ?? [];

      const validated: ProjectAssetRecord[] = [];
      let changed = false;
      for (const asset of loadedAssets) {
        if (asset.sourceUrl) {
          const exists = await validateAssetSource(asset.sourceUrl);
          if (!exists && asset.status !== 'missing') {
            validated.push({ ...asset, status: 'missing', sourceUrl: null });
            changed = true;
          } else if (exists && asset.status === 'missing') {
            validated.push({ ...asset, status: 'ready', sourceUrl: asset.lastKnownSourceUrl });
            changed = true;
          } else {
            validated.push(asset);
          }
        } else {
          validated.push(asset);
        }
      }

      set({ assets: validated, isLoading: false });
      if (changed) {
        schedulePersist(projectId, validated);
      }
    } catch (error) {
      console.error('[ProjectAssetsStore] Failed to load assets:', error);
      set({
        assets: [],
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load assets',
      });
    }
  },

  clearActiveProject: () => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    set({
      activeProjectId: null,
      assets: [],
      isLoading: false,
      isSaving: false,
      error: null,
    });
  },

  ingestFile: async (file: File) => {
    const projectId = get().activeProjectId;
    if (!projectId) {
      throw new Error('No active project.');
    }

    const rawBuffer = await file.arrayBuffer();
    const contentHash = await hashArrayBuffer(rawBuffer);
    const importedFromPath = window.api.getPathForFile(file);
    const assetKind = inferAssetKind(file.name, file.type);

    const existing = get().assets.find(
      (a) => a.contentHash === contentHash && a.projectId === projectId,
    );

    const videoMetadata = assetKind === 'video' ? await probePlayableVideo(file) : null;

    const storedPath = await storeProjectAssetFile({
      projectId,
      sourcePath: importedFromPath,
      contentHash,
    });

    const now = Date.now();
    let updatedAssets = [...get().assets];

    if (existing) {
      updatedAssets = get().assets.map((asset) => {
        if (asset.id !== existing.id) return asset;
        return {
          ...asset,
          sourceUrl: storedPath,
          lastKnownSourceUrl: storedPath,
          importedFromPath,
          ...(videoMetadata
            ? {
                width: videoMetadata.width,
                height: videoMetadata.height,
                durationSeconds: videoMetadata.duration,
              }
            : {}),
          status: 'ready',
          updatedAt: now,
        };
      });
      set({ assets: updatedAssets });
      schedulePersist(projectId, updatedAssets);
      return storedPath;
    }

    let width: number | null = null;
    let height: number | null = null;
    let durationSeconds: number | null = null;

    if (assetKind === 'image') {
      const bitmap = await createImageBitmap(file).catch(() => null);
      if (bitmap) {
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close?.();
      }
    } else if (assetKind === 'video') {
      width = videoMetadata?.width ?? null;
      height = videoMetadata?.height ?? null;
      durationSeconds = videoMetadata?.duration ?? null;
    }

    const newRecord: ProjectAssetRecord = {
      id: `asset-${now}-${Math.random().toString(36).slice(2, 10)}`,
      projectId,
      assetKind,
      contentHash,
      displayName: file.name,
      sourceUrl: storedPath,
      lastKnownSourceUrl: storedPath,
      importedFromPath,
      mimeType:
        file.type ||
        (assetKind === 'audio' ? 'audio/*' : assetKind === 'video' ? 'video/*' : 'image/*'),
      size: file.size,
      width,
      height,
      durationSeconds,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    };

    updatedAssets = [newRecord, ...get().assets];
    set({ assets: updatedAssets });
    schedulePersist(projectId, updatedAssets);
    return storedPath;
  },

  flushPersistence: async () => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    set({ isSaving: true });
    try {
      await saveProjectAssets(projectId, get().assets);
    } finally {
      set({ isSaving: false });
    }
  },
}));
