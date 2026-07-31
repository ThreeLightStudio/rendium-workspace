import type {
  ProjectAssetRecord,
  ProjectAssetsBundle,
  StoredProjectAssetRecord,
  StoredProjectAssetsBundle,
} from '../stores/projectAssetTypes';

const DB_NAME = 'rendium_studio_assets';
const DB_VERSION = 1;
const STORE_NAME = 'project-assets';

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

export async function loadProjectAssets(
  projectId: string,
): Promise<StoredProjectAssetsBundle | undefined> {
  if (!projectId) {
    return undefined;
  }

  try {
    const storedBundle = await idbGet(projectId);
    const normalizedBundle = normalizeStoredProjectAssetsBundle(storedBundle);
    if (!normalizedBundle || normalizedBundle.projectId !== projectId) {
      return undefined;
    }

    return normalizedBundle;
  } catch (error) {
    console.error('[ProjectAssetsStorage] Failed to load assets bundle:', error);
    return undefined;
  }
}

export async function saveProjectAssets(
  projectId: string,
  assets: ProjectAssetRecord[],
): Promise<void> {
  if (!projectId) {
    return;
  }

  try {
    const bundle: ProjectAssetsBundle = {
      projectId,
      updatedAt: Date.now(),
      assets,
    };
    await idbSet(projectId, bundle);
  } catch (error) {
    console.error('[ProjectAssetsStorage] Failed to save assets bundle:', error);
  }
}

export async function deleteProjectAssets(projectId: string): Promise<void> {
  if (!projectId) {
    return;
  }

  try {
    await idbDelete(projectId);
  } catch (error) {
    console.error('[ProjectAssetsStorage] Failed to delete assets bundle:', error);
  }
}

export function normalizeStoredProjectAssetsBundle(
  value: unknown,
): StoredProjectAssetsBundle | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (
    typeof value.projectId !== 'string' ||
    value.projectId.trim().length === 0 ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt) ||
    !Array.isArray(value.assets)
  ) {
    return undefined;
  }

  const assets = value.assets
    .map(normalizeStoredProjectAssetRecord)
    .filter((asset): asset is StoredProjectAssetRecord => asset !== undefined);

  return {
    projectId: value.projectId,
    updatedAt: value.updatedAt,
    assets,
  };
}

function normalizeStoredProjectAssetRecord(value: unknown): StoredProjectAssetRecord | undefined {
  if (!isPlainObject(value) || !hasRequiredStoredAssetFields(value)) {
    return undefined;
  }

  return value;
}

// biome-ignore lint/suspicious/noExplicitAny: index signature workaround
function hasRequiredStoredAssetFields(value: any): value is StoredProjectAssetRecord {
  return (
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    typeof value.projectId === 'string' &&
    value.projectId.trim().length > 0 &&
    typeof value.contentHash === 'string' &&
    value.contentHash.trim().length > 0 &&
    typeof value.displayName === 'string' &&
    value.displayName.trim().length > 0 &&
    typeof value.mimeType === 'string' &&
    (value.status === 'ready' || value.status === 'missing') &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
