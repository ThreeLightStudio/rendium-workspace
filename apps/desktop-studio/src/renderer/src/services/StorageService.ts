/**
 * StorageService — Phase 5 Auto-Save (Multi-Project Support)
 *
 * Provides IndexedDB-backed persistence for IProjectManifest.
 */

import type { IProjectManifest } from '@rendium/engine';
import { engineStore, getProjectContentDuration, normalizeProjectManifest } from '@rendium/engine';
import { type ProjectAssetRecord, isProjectAssetSourceUrl } from '../stores/projectAssetTypes';
import { getStudioLayerTypeFromManifest } from '../utils/canonicalLayer';
import { storeProjectAssetFile } from './projectAssetFilesystem';
import { loadProjectAssets, saveProjectAssets } from './projectAssetsStorage';

type ProjectManifestInput = Partial<IProjectManifest> &
  Pick<IProjectManifest, 'layers' | 'layerOrder'>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'rendium_studio';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

/** Debounce delay in milliseconds before committing a manifest to IndexedDB. */
const DEBOUNCE_MS = 1500;

// ---------------------------------------------------------------------------
// Internal IndexedDB helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProjectManifestInput(value: unknown): value is ProjectManifestInput {
  return isPlainObject(value) && isPlainObject(value.layers) && Array.isArray(value.layerOrder);
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('[StorageService] Failed to serialize blob asset:', blobUrl, err);
    return blobUrl;
  }
}

async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isMigratableFilesystemSource(sourceUrl: string): boolean {
  return !isProjectAssetSourceUrl(sourceUrl) && !/^(data:|blob:|file:|https?:)/i.test(sourceUrl);
}

async function canonicalizeLayerSourceUrls(
  projectId: string,
  manifest: IProjectManifest,
): Promise<IProjectManifest> {
  const readFile = typeof window !== 'undefined' ? window.api?.readFileAsArrayBuffer : undefined;
  if (!readFile) {
    return manifest;
  }

  const layers = { ...manifest.layers };
  let changed = false;

  for (const [id, layer] of Object.entries(manifest.layers)) {
    if (getStudioLayerTypeFromManifest(layer) !== 'image') {
      continue;
    }

    const source = layer.source;
    const sourceUrl =
      typeof source?.params?.sourceUrl === 'string' ? source.params.sourceUrl : null;

    if (!sourceUrl || !isMigratableFilesystemSource(sourceUrl)) {
      continue;
    }

    try {
      const contentHash = await hashArrayBuffer(await readFile(sourceUrl));
      const migratedSourceUrl = await storeProjectAssetFile({
        projectId,
        sourcePath: sourceUrl,
        contentHash,
      });
      layers[id] = {
        ...layer,
        source: {
          ...source,
          sourceId: migratedSourceUrl,
          provider: source?.provider ?? 'raster',
          track: source?.track ?? 'visual',
          params: {
            ...(source?.params ?? {}),
            sourceUrl: migratedSourceUrl,
          },
        },
      };
    } catch (error) {
      console.error('[StorageService] Failed to canonicalize layer sourceUrl:', sourceUrl, error);
      layers[id] = {
        ...layer,
        source: {
          ...source,
          sourceId: source?.sourceId ?? `source:${id}`,
          provider: source?.provider ?? 'raster',
          track: source?.track ?? 'visual',
          params: {
            ...(source?.params ?? {}),
            sourceUrl: null,
          },
        },
      };
    }

    changed = true;
  }

  return changed ? { ...manifest, layers } : manifest;
}

async function dehydrateAssets(manifest: IProjectManifest): Promise<IProjectManifest> {
  const layers = { ...manifest.layers };

  for (const [id, layer] of Object.entries(manifest.layers)) {
    const params = { ...(layer.source?.params ?? {}) };
    const assetProps = ['sourceUrl', 'src', 'imageSource'];
    let changed = false;

    for (const prop of assetProps) {
      const paramValue = params[prop];
      if (typeof paramValue === 'string' && paramValue.startsWith('blob:')) {
        params[prop] = await blobUrlToDataUrl(paramValue);
        changed = true;
      }
    }

    if (changed && layer.source) {
      layers[id] = {
        ...layer,
        source: {
          ...layer.source,
          params,
        },
      };
    }
  }

  return { ...manifest, layers };
}

// ---------------------------------------------------------------------------
// StorageService
// ---------------------------------------------------------------------------

let _unsubscribePatches: (() => void) | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function save(): Promise<void> {
  const normalizedManifest = normalizeProjectManifest(engineStore.getManifest());
  const id = normalizedManifest.projectInfo.createdAt.toString();
  const manifest = await dehydrateAssets(await canonicalizeLayerSourceUrls(id, normalizedManifest));

  try {
    await idbSet(id, manifest);
    console.debug(`[StorageService] Manifest ${id} saved to IndexedDB.`);
  } catch (err) {
    console.error('[StorageService] Failed to save manifest:', err);
  }
}

function _debouncedSave(): void {
  if (_debounceTimer !== null) {
    clearTimeout(_debounceTimer);
  }
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    save().catch(console.error);
  }, DEBOUNCE_MS);
}

/**
 * Load a specific manifest by ID from IndexedDB.
 */
async function load(id: string): Promise<IProjectManifest | undefined> {
  try {
    const manifest = await idbGet(id);
    if (manifest === undefined) {
      return undefined;
    }

    if (!isProjectManifestInput(manifest)) {
      throw new Error('Invalid stored project manifest.');
    }

    return manifest
      ? await canonicalizeLayerSourceUrls(id, normalizeProjectManifest(manifest))
      : undefined;
  } catch (err) {
    console.error('[StorageService] Failed to load manifest:', err);
    return undefined;
  }
}

/**
 * Fetch all project metadata for Dashboard rendering.
 * Does not read large blobs entirely if we can avoid it, but with IDB we read to Memory then extract UI params.
 */
async function getAllProjectMetas(): Promise<
  {
    id: string;
    projectInfo: IProjectManifest['projectInfo'];
    projectSettings: IProjectManifest['projectSettings'];
    duration: number;
  }[]
> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    const results: {
      id: string;
      projectInfo: IProjectManifest['projectInfo'];
      projectSettings: IProjectManifest['projectSettings'];
      duration: number;
    }[] = [];

    req.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        try {
          if (!isProjectManifestInput(cursor.value)) {
            throw new Error('Invalid stored project manifest.');
          }

          const manifest = normalizeProjectManifest(cursor.value);
          const duration = getProjectContentDuration(manifest);

          results.push({
            id: cursor.key.toString(),
            projectInfo: manifest.projectInfo,
            projectSettings: manifest.projectSettings,
            duration,
          });
        } catch (err) {
          console.warn('[StorageService] Skipping invalid project record:', err);
        }
        cursor.continue();
      } else {
        // Sort by updatedAt descending
        results.sort((a, b) => b.projectInfo.updatedAt - a.projectInfo.updatedAt);
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Deletes a project from the datastore.
 */
async function deleteProject(id: string): Promise<void> {
  try {
    await idbDelete(id);
    console.debug(`[StorageService] Deleted project ${id}.`);
  } catch (err) {
    console.error('[StorageService] Failed to delete project:', err);
  }
}

/**
 * Cleans up and stops the auto-save process.
 * Disconnects from EngineStore when entering Lobby.
 */
function stopAutoSave(): void {
  if (_debounceTimer !== null) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  if (_unsubscribePatches) {
    _unsubscribePatches();
    _unsubscribePatches = null;
  }
}

/**
 * Initialize auto-saving against the current engineStore manifest.
 * Used when Editor starts.
 */
function initAutoSave(): () => void {
  // Subscribe to patch stream for ongoing auto-save in Editor mode
  stopAutoSave(); // ensure clean state

  _unsubscribePatches = engineStore.subscribePatches(() => {
    _debouncedSave();
  });

  return stopAutoSave;
}

async function duplicateProject(projectId: string): Promise<string> {
  const sourceManifest = await load(projectId);
  if (!sourceManifest) {
    throw new Error(`Project ${projectId} not found.`);
  }

  const manifest = JSON.parse(JSON.stringify(sourceManifest)) as IProjectManifest;
  const newProjectId = Date.now().toString();

  manifest.projectInfo = {
    ...manifest.projectInfo,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    name: `${manifest.projectInfo.name} (Copy)`,
  };

  await idbSet(newProjectId, manifest);

  const bundle = await loadProjectAssets(projectId);
  if (bundle && Array.isArray(bundle.assets)) {
    const clonedAssets = bundle.assets.map((asset) => ({
      ...asset,
      projectId: newProjectId,
    })) as ProjectAssetRecord[];
    await saveProjectAssets(newProjectId, clonedAssets);
  }

  return newProjectId;
}

export const StorageService = {
  load,
  save,
  getAllProjectMetas,
  deleteProject,
  duplicateProject,
  initAutoSave,
  stopAutoSave,
} as const;
