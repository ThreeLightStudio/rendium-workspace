import { engineStore } from '@rendium/engine';
import type { AiAssetSummary, AiChatEditorContext } from '../../../shared/aiChat';
import type { ProjectAssetRecord } from '../stores/projectAssetTypes';
import { getStudioLayerType } from '../utils/canonicalLayer';
import { buildProductContextPacks } from './productContextRegistry';

const MAX_RECENT_ASSETS = 6;

export interface BuildAiEditorContextOptions {
  assets: ProjectAssetRecord[];
  selectedAssetId: string | null;
  studioState: {
    selectedLayerId: string | null;
    selectedLayerIds: string[];
  };
  includeProductContextPacks?: boolean;
}

export function buildAiEditorContext(options: BuildAiEditorContextOptions): AiChatEditorContext {
  const manifest = engineStore.getManifest();
  const snapshot = engineStore.getSnapshot();
  const selectedLayer = options.studioState.selectedLayerId
    ? engineStore.getLayerById(options.studioState.selectedLayerId)
    : undefined;
  const selectedLayerIds = options.studioState.selectedLayerIds;

  return {
    canvasWidth: snapshot.width,
    canvasHeight: snapshot.height,
    selectedLayerId: options.studioState.selectedLayerId,
    selectedLayerIds,
    selectedLayerType: selectedLayer ? getStudioLayerType(selectedLayer) : null,
    selectedLayerName: selectedLayer?.name ?? null,
    selectionCount: selectedLayerIds.length,
    layerCount: snapshot.layers.length,
    visibleLayerCount: snapshot.layers.filter((layer) => {
      const renderableLayer = layer as { visible?: boolean };
      return renderableLayer.visible !== false;
    }).length,
    projectName: manifest.projectInfo.name,
    assetSummary: buildProjectAssetSummary(options.assets, options.selectedAssetId),
    ...(options.includeProductContextPacks
      ? {
          productContextPacks: buildProductContextPacks({
            manifest,
            snapshot,
            assets: options.assets,
            selectedAssetId: options.selectedAssetId,
            selectedLayerId: options.studioState.selectedLayerId,
          }),
        }
      : {}),
  };
}

export function buildProjectAssetSummary(
  assets: ProjectAssetRecord[],
  selectedAssetId: string | null,
): AiAssetSummary {
  const recentAssets = [...assets]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECENT_ASSETS)
    .map((asset) => ({
      id: asset.id,
      displayName: asset.displayName,
      assetKind: asset.assetKind,
      status: asset.status,
      usageCount: 0,
      description: '',
      tags: [],
      durationSeconds: asset.durationSeconds,
      audioMood: null,
      sourceUrlAvailable: Boolean(asset.sourceUrl),
    }));

  return {
    total: assets.length,
    ready: assets.filter((asset) => asset.status === 'ready').length,
    missing: assets.filter((asset) => asset.status === 'missing').length,
    pendingMetadata: 0,
    needsAttention: 0,
    selectedAssetId,
    recentAssets,
  };
}
