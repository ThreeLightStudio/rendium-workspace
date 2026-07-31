import type { IProjectManifest } from '@rendium/engine';

export interface UserPreset {
  id: string;
  name: string;
  thumbnail: string; // base64 PNG
  slots: ('audio' | 'background')[];
  manifest: Partial<IProjectManifest>;
  createdAt: number;
}

const DB_NAME = 'user-presets.db';
const DB_VERSION = 1;
const STORE_NAME = 'My Custom Presets';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveUserPreset(preset: UserPreset): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(preset);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function getUserPresets(): Promise<UserPreset[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const results = req.result as UserPreset[];
      // Sort by createdAt descending
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function deleteUserPreset(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
