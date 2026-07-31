import { type ILayerManifest, getParentSequenceStartLayer } from '@rendium/engine';
import type { ProjectAssetRecord } from '../stores/projectAssetTypes';
import { isProjectAssetSourceUrl } from '../stores/projectAssetTypes';
import {
  getScopeRole,
  getStudioLayerTypeFromManifest,
  isProjectAnchorManifest,
  isScopeStartManifest,
} from '../utils/canonicalLayer';

export type ProductImagePlacementScopeRole = 'main' | 'overlay';
export type ProductTextScopeRole = 'text';

export interface ProductScopeCandidate {
  id: string;
  role: ProductImagePlacementScopeRole | ProductTextScopeRole;
  preferred: boolean;
  startTime: number;
}

export interface SelectedLayerProductContext {
  layerId: string;
  layerType: string;
  name: string | null;
  parentScopeId: string | null;
}

export interface ImagePlacementProductContext {
  projectContentEnd: number;
  validScopes: ProductScopeCandidate[];
  readyImageAssetIds: string[];
  selectedAssetId: string | null;
  selectedLayer: SelectedLayerProductContext | null;
}

export interface TextInsertionProductContext {
  projectContentEnd: number;
  validScopes: ProductScopeCandidate[];
  selectedLayer: SelectedLayerProductContext | null;
}

type EngineManifest = {
  layers: Record<string, ILayerManifest | undefined>;
  layerOrder: string[];
};

type EngineSnapshotLike = {
  duration?: number;
  projectDuration?: number;
};

export function deriveProjectContentEnd(snapshot: EngineSnapshotLike): number {
  const duration = finiteNonNegative(snapshot.duration);
  if (duration !== null) {
    return duration;
  }

  return finiteNonNegative(snapshot.projectDuration) ?? 0;
}

export function deriveImagePlacementScopes(
  manifest: EngineManifest,
  preferredRole: ProductImagePlacementScopeRole = 'main',
): ProductScopeCandidate[] {
  const preferredRoles =
    preferredRole === 'overlay' ? (['overlay', 'main'] as const) : (['main', 'overlay'] as const);
  const rank = new Map<ProductImagePlacementScopeRole, number>(
    preferredRoles.map((role, index) => [role, index]),
  );

  return manifest.layerOrder
    .map((layerId) => manifest.layers[layerId])
    .filter(isImagePlacementScope)
    .map((layer) => {
      const role = getScopeRole(layer) as ProductImagePlacementScopeRole;
      return {
        id: layer.id,
        role,
        preferred: role === preferredRole,
        startTime: layer.startTime ?? 0,
      };
    })
    .sort((a, b) => {
      const rankDelta =
        (rank.get(a.role as ProductImagePlacementScopeRole) ?? 99) -
        (rank.get(b.role as ProductImagePlacementScopeRole) ?? 99);
      return rankDelta === 0
        ? manifest.layerOrder.indexOf(a.id) - manifest.layerOrder.indexOf(b.id)
        : rankDelta;
    });
}

export function derivePreferredImagePlacementScope(
  manifest: EngineManifest,
  preferredRole: ProductImagePlacementScopeRole = 'main',
): ProductScopeCandidate | null {
  return deriveImagePlacementScopes(manifest, preferredRole)[0] ?? null;
}

export function deriveTextInsertionScopes(manifest: EngineManifest): ProductScopeCandidate[] {
  return manifest.layerOrder
    .map((layerId) => manifest.layers[layerId])
    .filter(isTextInsertionScope)
    .map((layer) => {
      const role = getScopeRole(layer) as ProductTextScopeRole;
      return {
        id: layer.id,
        role,
        preferred: role === 'text',
        startTime: layer.startTime ?? 0,
      };
    })
    .sort((a, b) => {
      return manifest.layerOrder.indexOf(a.id) - manifest.layerOrder.indexOf(b.id);
    });
}

export function deriveSelectedLayerProductContext(
  manifest: EngineManifest,
  selectedLayerId: string | null,
): SelectedLayerProductContext | null {
  if (!selectedLayerId) {
    return null;
  }

  const selectedLayer = manifest.layers[selectedLayerId];
  if (!selectedLayer) {
    return null;
  }

  const parentScope =
    isScopeStartManifest(selectedLayer) || isProjectAnchorManifest(selectedLayer)
      ? null
      : getParentSequenceStartLayer(
          manifest as Parameters<typeof getParentSequenceStartLayer>[0],
          selectedLayerId,
        );

  return {
    layerId: selectedLayer.id,
    layerType: getStudioLayerTypeFromManifest(selectedLayer),
    name: selectedLayer.name ?? null,
    parentScopeId: parentScope && !isProjectAnchorManifest(parentScope) ? parentScope.id : null,
  };
}

export function deriveImagePlacementProductContext(params: {
  manifest: EngineManifest;
  snapshot: EngineSnapshotLike;
  assets: ProjectAssetRecord[];
  selectedAssetId: string | null;
  selectedLayerId?: string | null;
  preferredRole?: ProductImagePlacementScopeRole;
}): ImagePlacementProductContext {
  const readyImageAssetIds = params.assets
    .filter((asset) => isReadyImageAsset(asset))
    .map((asset) => asset.id);
  const selectedAssetId =
    params.selectedAssetId && readyImageAssetIds.includes(params.selectedAssetId)
      ? params.selectedAssetId
      : null;

  return {
    projectContentEnd: deriveProjectContentEnd(params.snapshot),
    validScopes: deriveImagePlacementScopes(params.manifest, params.preferredRole ?? 'main'),
    readyImageAssetIds,
    selectedAssetId,
    selectedLayer: deriveSelectedLayerProductContext(
      params.manifest,
      params.selectedLayerId ?? null,
    ),
  };
}

export function deriveTextInsertionProductContext(params: {
  manifest: EngineManifest;
  snapshot: EngineSnapshotLike;
  selectedLayerId?: string | null;
}): TextInsertionProductContext {
  return {
    projectContentEnd: deriveProjectContentEnd(params.snapshot),
    validScopes: deriveTextInsertionScopes(params.manifest),
    selectedLayer: deriveSelectedLayerProductContext(
      params.manifest,
      params.selectedLayerId ?? null,
    ),
  };
}

function isImagePlacementScope(layer: ILayerManifest | undefined): layer is ILayerManifest {
  if (!layer || !isScopeStartManifest(layer) || isProjectAnchorManifest(layer)) {
    return false;
  }

  const role = getScopeRole(layer);
  return role === 'main' || role === 'overlay';
}

function isTextInsertionScope(layer: ILayerManifest | undefined): layer is ILayerManifest {
  if (!layer || !isScopeStartManifest(layer) || isProjectAnchorManifest(layer)) {
    return false;
  }

  const role = getScopeRole(layer);
  return role === 'text';
}

function isReadyImageAsset(asset: ProjectAssetRecord): boolean {
  return (
    asset.assetKind === 'image' &&
    asset.status !== 'missing' &&
    Boolean(asset.sourceUrl) &&
    isProjectAssetSourceUrl(asset.sourceUrl)
  );
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}
