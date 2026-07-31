export type ProjectAssetKind = 'image' | 'audio' | 'video';

export const PROJECT_ASSET_SOURCE_URL_PREFIX = 'rendium-asset://';

export interface ProjectAssetRecord {
  id: string;
  projectId: string;
  assetKind: ProjectAssetKind;
  contentHash: string;
  displayName: string;
  sourceUrl: string | null;
  lastKnownSourceUrl: string | null;
  importedFromPath: string | null;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  status: 'ready' | 'missing';
  createdAt: number;
  updatedAt: number;
}

export type StoredProjectAssetRecord = ProjectAssetRecord;

export interface ProjectAssetsBundle {
  projectId: string;
  updatedAt: number;
  assets: ProjectAssetRecord[];
}

export interface StoredProjectAssetsBundle {
  projectId: string;
  updatedAt: number;
  assets: StoredProjectAssetRecord[];
}

export function isProjectAssetSourceUrl(sourceUrl: string | null | undefined): sourceUrl is string {
  return typeof sourceUrl === 'string' && sourceUrl.startsWith(PROJECT_ASSET_SOURCE_URL_PREFIX);
}
