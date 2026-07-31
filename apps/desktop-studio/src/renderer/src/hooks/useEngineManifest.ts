import { type IProjectManifest, engineStore } from '@rendium/engine';
import { useRef, useSyncExternalStore } from 'react';

export function useEngineManifest(): Readonly<IProjectManifest> {
  const snapshot = useSyncExternalStore(engineStore.subscribe, engineStore.getSnapshot);
  const cachedSnapshotRef = useRef<unknown>(null);
  const cachedManifestRef = useRef<Readonly<IProjectManifest> | null>(null);

  if (cachedSnapshotRef.current !== snapshot || cachedManifestRef.current === null) {
    cachedSnapshotRef.current = snapshot;
    cachedManifestRef.current = engineStore.getManifest();
  }

  return cachedManifestRef.current;
}
