import { basename, extname, join, resolve, sep } from 'node:path';

export const PROJECT_ASSET_URL_PROTOCOL = 'rendium-asset:';
export const PROJECT_ASSET_ROOT_DIR = 'project-assets';
export const PROJECT_ASSET_FILES_DIR = 'files';

export interface ProjectAssetRootInput {
  userDataPath: string;
  projectId: string;
}

export function getProjectAssetRoot(input: ProjectAssetRootInput): string {
  const { userDataPath, projectId } = input;
  return join(userDataPath, PROJECT_ASSET_ROOT_DIR, projectId);
}

export function getProjectAssetFilesDir(input: ProjectAssetRootInput): string {
  return join(getProjectAssetRoot(input), PROJECT_ASSET_FILES_DIR);
}

export interface ProjectAssetFileNameInput {
  contentHash: string;
  sourcePath: string;
}

export function getProjectAssetFileName(input: ProjectAssetFileNameInput): string {
  const { contentHash, sourcePath } = input;
  const extension = extname(sourcePath).trim() || '.asset';
  return `${contentHash}${extension}`;
}

export interface ProjectAssetFilePathInput
  extends ProjectAssetRootInput,
    ProjectAssetFileNameInput {}

export function getProjectAssetFilePath(input: ProjectAssetFilePathInput): string {
  const { contentHash, sourcePath } = input;
  return join(getProjectAssetFilesDir(input), getProjectAssetFileName({ contentHash, sourcePath }));
}

export interface CreateProjectAssetSourceUrlInput extends ProjectAssetFileNameInput {
  projectId: string;
}

export function createProjectAssetSourceUrl(input: CreateProjectAssetSourceUrlInput): string {
  const { projectId, contentHash, sourcePath } = input;
  return `${PROJECT_ASSET_URL_PROTOCOL}//${encodeURIComponent(projectId)}/${PROJECT_ASSET_FILES_DIR}/${encodeURIComponent(
    getProjectAssetFileName({ contentHash, sourcePath }),
  )}`;
}

export function isProjectAssetSourceUrl(sourceUrl: string | null | undefined): sourceUrl is string {
  return typeof sourceUrl === 'string' && sourceUrl.startsWith(`${PROJECT_ASSET_URL_PROTOCOL}//`);
}

export interface ResolveProjectAssetSourceUrlInput {
  userDataPath: string;
  sourceUrl: string;
  expectedProjectId?: string;
}

export function resolveProjectAssetSourceUrl(input: ResolveProjectAssetSourceUrlInput): string {
  const { userDataPath, sourceUrl, expectedProjectId } = input;
  const match = /^rendium-asset:\/\/([^/]+)\/files\/([^/?#]+)$/.exec(sourceUrl);
  if (!match) {
    throw new Error('Invalid project asset source URL.');
  }

  const projectId = decodeURIComponent(match[1] ?? '');
  const fileName = decodeURIComponent(match[2] ?? '');

  if (!projectId || !fileName || fileName !== basename(fileName)) {
    throw new Error('Invalid project asset source URL path.');
  }

  if (expectedProjectId && projectId !== expectedProjectId) {
    throw new Error('Project asset source URL belongs to a different project.');
  }

  const filesDir = resolve(getProjectAssetFilesDir({ userDataPath, projectId }));
  const filePath = resolve(filesDir, fileName);
  if (!filePath.startsWith(filesDir + sep)) {
    throw new Error('Project asset source URL resolves outside the project asset root.');
  }

  return filePath;
}

export interface ResolveProjectAssetDeletionPathInput extends ProjectAssetRootInput {
  sourceUrlOrPath: string;
}

export function resolveProjectAssetDeletionPath(
  input: ResolveProjectAssetDeletionPathInput,
): string {
  const { userDataPath, projectId, sourceUrlOrPath } = input;
  if (isProjectAssetSourceUrl(sourceUrlOrPath)) {
    return resolveProjectAssetSourceUrl({
      userDataPath,
      sourceUrl: sourceUrlOrPath,
      expectedProjectId: projectId,
    });
  }

  const root = resolve(getProjectAssetRoot({ userDataPath, projectId }));
  const resolvedPath = resolve(sourceUrlOrPath);
  if (!resolvedPath.startsWith(root + sep)) {
    throw new Error('Refusing to delete a file outside the project asset root.');
  }

  return resolvedPath;
}
