type StoreProjectAssetFileResult = {
  success: boolean;
  filePath?: string;
  sourceUrl?: string;
  copied?: boolean;
  error?: string;
};

type DeleteProjectAssetResult = {
  success: boolean;
  error?: string;
};

function getProjectAssetsApi() {
  const projectAssets = window.api?.projectAssets;
  if (!projectAssets) {
    throw new Error('Project asset filesystem API is unavailable.');
  }

  return projectAssets;
}

export async function storeProjectAssetFile(request: {
  projectId: string;
  sourcePath: string;
  contentHash: string;
}): Promise<string> {
  const result = (await getProjectAssetsApi().storeFile(request)) as StoreProjectAssetFileResult;
  if (!result.success || !result.sourceUrl) {
    throw new Error(result.error ?? 'Failed to store project asset file.');
  }

  return result.sourceUrl;
}

export async function deleteProjectAssetFile(request: {
  projectId: string;
  filePath: string;
}): Promise<void> {
  const result = (await getProjectAssetsApi().deleteFile(request)) as DeleteProjectAssetResult;
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to delete project asset file.');
  }
}
