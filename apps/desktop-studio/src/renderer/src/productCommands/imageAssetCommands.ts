import {
  type EngineIntent,
  type ILayerManifest,
  engineStore,
  getParentSequenceStartLayer,
} from '@rendium/engine';
import {
  derivePreferredImagePlacementScope,
  deriveProjectContentEnd,
} from '../productContext/productDerivations';
import type { ProjectAssetRecord } from '../stores/projectAssetTypes';
import { isProjectAssetSourceUrl } from '../stores/projectAssetTypes';
import { useStudioStore } from '../stores/studioStore';
import {
  createImageLayerManifest,
  isProjectAnchorManifest,
  isScopeStartManifest,
} from '../utils/canonicalLayer';
import { seekToFirstChangedTimelineTime } from './timelineFocusCommands';

export type ImageAssetCommandScopeRole = 'main' | 'overlay';
export type ImageAssetCommandFit = 'contain' | 'cover';
export type ImageAssetCommandErrorKey =
  | 'assets.applyFailed'
  | 'assets.missingSource'
  | 'assets.noScopeFound';

export interface ImageAssetSceneCommandOptions {
  assetId: string;
  assets: ProjectAssetRecord[];
  targetScopeId?: string;
  scopeRole?: ImageAssetCommandScopeRole;
  startTime?: number;
  durationSeconds?: number;
  fit?: ImageAssetCommandFit;
  layerIdPrefix?: string;
}

export interface ImageAssetTimelineEndCommandOptions {
  assetId: string;
  assets: ProjectAssetRecord[];
  scopeRole?: ImageAssetCommandScopeRole;
  placement?: 'start' | 'end';
  durationSeconds: number;
  fit?: ImageAssetCommandFit;
  manifest?: ReturnType<typeof engineStore.getManifest>;
  snapshot?: ReturnType<typeof engineStore.getSnapshot>;
}

export type ImageAssetProductCommandResult =
  | {
      success: true;
      createdLayerIds: string[];
      executedIntents: EngineIntent[];
    }
  | {
      success: false;
      createdLayerIds: [];
      executedIntents: [];
      error: string;
      errorKey: ImageAssetCommandErrorKey;
    };

export type ImageAssetProductCommandResolution =
  | {
      success: true;
      createdLayerIds: string[];
      intents: EngineIntent[];
    }
  | {
      success: false;
      error: string;
      errorKey: ImageAssetCommandErrorKey;
    };

const DEFAULT_SCENE_DURATION_SECONDS = 5;

export function addImageAssetToScene(
  options: ImageAssetSceneCommandOptions,
): ImageAssetProductCommandResult {
  return executeImageAssetCommand(resolveImageAssetSceneCommand(options));
}

export function addImageAssetToTimelineEnd(
  options: ImageAssetTimelineEndCommandOptions,
): ImageAssetProductCommandResult {
  return executeImageAssetCommand(resolveImageAssetTimelineEndCommand(options));
}

export function resolveImageAssetTimelineEndCommand(
  options: ImageAssetTimelineEndCommandOptions,
): ImageAssetProductCommandResolution {
  if (options.durationSeconds <= 0) {
    return failImageAssetCommand('assets.applyFailed');
  }

  const assetFailure = validateImageAsset(
    options.assets.find((entry) => entry.id === options.assetId),
  );
  if (assetFailure) {
    return assetFailure;
  }

  const snapshot = options.snapshot ?? engineStore.getSnapshot();
  const timelineEnd = deriveProjectContentEnd(snapshot);
  const manifest = options.manifest ?? engineStore.getManifest();
  const scopeRole = options.scopeRole ?? 'main';
  const targetScopeId = derivePreferredImagePlacementScope(manifest, scopeRole)?.id;
  if (!targetScopeId) {
    return failImageAssetCommand('assets.noScopeFound');
  }

  return resolveImageAssetSceneCommandWithManifest(
    {
      assetId: options.assetId,
      assets: options.assets,
      targetScopeId,
      startTime: options.placement === 'start' ? 0 : Math.max(0, timelineEnd),
      durationSeconds: options.durationSeconds,
      fit: options.fit ?? 'cover',
      layerIdPrefix: 'image-asset',
    },
    manifest,
  );
}

export function resolveImageAssetSceneCommand(
  options: ImageAssetSceneCommandOptions,
): ImageAssetProductCommandResolution {
  return resolveImageAssetSceneCommandWithManifest(options, engineStore.getManifest());
}

function resolveImageAssetSceneCommandWithManifest(
  options: ImageAssetSceneCommandOptions,
  manifest: ReturnType<typeof engineStore.getManifest>,
): ImageAssetProductCommandResolution {
  const asset = options.assets.find((entry) => entry.id === options.assetId);
  const assetFailure = validateImageAsset(asset);
  if (assetFailure) {
    return assetFailure;
  }
  if (!asset) {
    return failImageAssetCommand('assets.applyFailed');
  }

  const insertionScope = resolveImageInsertionScope(manifest, {
    targetScopeId: options.targetScopeId,
    scopeRole: options.scopeRole,
  });
  if (!insertionScope || !isScopeStartManifest(insertionScope)) {
    return failImageAssetCommand('assets.noScopeFound');
  }
  const scopeManifest = insertionScope;

  const startTime = options.startTime ?? 0;
  const localStartTime = Math.max(0, startTime - (scopeManifest.startTime ?? 0));
  const layerId = createLayerId(options.layerIdPrefix ?? 'image-layer');
  const intent: EngineIntent = {
    type: 'ADD_LAYER',
    targetScopeId: scopeManifest.id,
    manifest: createImageLayerManifest({
      id: layerId,
      name: asset.displayName,
      startTime: localStartTime,
      duration: options.durationSeconds ?? DEFAULT_SCENE_DURATION_SECONDS,
      sourceUrl: asset.sourceUrl,
      sourceWidth: asset.width,
      sourceHeight: asset.height,
      fit: options.fit ?? 'contain',
      opacity: 1,
    }),
  };

  return {
    success: true,
    createdLayerIds: [layerId],
    intents: [intent],
  };
}

function executeImageAssetCommand(
  resolution: ImageAssetProductCommandResolution,
): ImageAssetProductCommandResult {
  if (!resolution.success) {
    return {
      success: false,
      createdLayerIds: [],
      executedIntents: [],
      error: resolution.error,
      errorKey: resolution.errorKey,
    };
  }

  const manifest = engineStore.getManifest();
  engineStore.executeAtomicIntentBatch(resolution.intents);
  seekToFirstChangedTimelineTime({ intents: resolution.intents, manifest });
  const lastCreatedLayerId = resolution.createdLayerIds[resolution.createdLayerIds.length - 1];
  if (lastCreatedLayerId) {
    useStudioStore.getState().selectLayer(lastCreatedLayerId);
  }

  return {
    success: true,
    createdLayerIds: resolution.createdLayerIds,
    executedIntents: resolution.intents,
  };
}

function validateImageAsset(
  asset: ProjectAssetRecord | undefined,
): ImageAssetProductCommandResolution | null {
  if (!asset) {
    return failImageAssetCommand('assets.applyFailed');
  }

  if (asset.assetKind !== 'image') {
    return failImageAssetCommand('assets.applyFailed', asset.displayName);
  }

  if (!asset.sourceUrl || !isProjectAssetSourceUrl(asset.sourceUrl) || asset.status === 'missing') {
    return failImageAssetCommand('assets.missingSource', asset.displayName);
  }

  return null;
}

function resolveImageInsertionScope(
  manifest: ReturnType<typeof engineStore.getManifest>,
  options: {
    targetScopeId?: string;
    scopeRole?: ImageAssetCommandScopeRole;
  },
): ILayerManifest | undefined {
  if (options.targetScopeId) {
    return manifest.layers[options.targetScopeId];
  }

  if (options.scopeRole) {
    const candidate = derivePreferredImagePlacementScope(manifest, options.scopeRole);
    return candidate ? manifest.layers[candidate.id] : undefined;
  }

  const selectedLayerId = useStudioStore.getState().selectedLayerId;
  const selectedLayer = selectedLayerId ? manifest.layers[selectedLayerId] : undefined;
  const parentSequence =
    selectedLayerId && !isScopeStartManifest(selectedLayer)
      ? getParentSequenceStartLayer(manifest, selectedLayerId)
      : undefined;

  return isScopeStartManifest(selectedLayer) && !isProjectAnchorManifest(selectedLayer)
    ? selectedLayer
    : ((parentSequence && !isProjectAnchorManifest(parentSequence) ? parentSequence : undefined) ??
        resolveDerivedScope(manifest, 'main') ??
        resolveDerivedScope(manifest, 'overlay') ??
        manifest.layerOrder
          .map((layerId) => manifest.layers[layerId])
          .find((layer) => isScopeStartManifest(layer) && !isProjectAnchorManifest(layer)));
}

function resolveDerivedScope(
  manifest: ReturnType<typeof engineStore.getManifest>,
  scopeRole: ImageAssetCommandScopeRole,
): ILayerManifest | undefined {
  const candidate = derivePreferredImagePlacementScope(manifest, scopeRole);
  return candidate?.role === scopeRole ? manifest.layers[candidate.id] : undefined;
}

function failImageAssetCommand(
  errorKey: ImageAssetCommandErrorKey,
  error: string = errorKey,
): ImageAssetProductCommandResolution {
  return {
    success: false,
    error,
    errorKey,
  };
}

function createLayerId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
