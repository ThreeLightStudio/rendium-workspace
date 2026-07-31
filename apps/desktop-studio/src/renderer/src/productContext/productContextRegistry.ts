import type { AiProductContextPack, AiProductContextPurpose } from '../../../shared/aiChat';
import type { ProjectAssetRecord } from '../stores/projectAssetTypes';
import {
  type ProductImagePlacementScopeRole,
  deriveImagePlacementProductContext,
  deriveTextInsertionProductContext,
} from './productDerivations';

type ImagePlacementRegistryManifest = Parameters<
  typeof deriveImagePlacementProductContext
>[0]['manifest'];
type ImagePlacementRegistrySnapshot = Parameters<
  typeof deriveImagePlacementProductContext
>[0]['snapshot'];

export interface ProductContextRegistryInput {
  manifest: ImagePlacementRegistryManifest;
  snapshot: ImagePlacementRegistrySnapshot;
  assets: ProjectAssetRecord[];
  selectedAssetId: string | null;
  selectedLayerId?: string | null;
}

export function buildProductContextPacks(
  input: ProductContextRegistryInput,
  purposes: AiProductContextPurpose[] = [
    'image-placement',
    'text-insertion',
    'selected-text-editing',
  ],
): AiProductContextPack[] {
  return purposes.map((purpose) => buildProductContextPack(input, purpose));
}

export function buildProductContextPack(
  input: ProductContextRegistryInput,
  purpose: AiProductContextPurpose,
): AiProductContextPack {
  switch (purpose) {
    case 'image-placement':
      return buildImagePlacementContextPack(input);
    case 'text-insertion':
      return buildTextInsertionContextPack(input);
    case 'selected-text-editing':
      return buildSelectedTextEditingContextPack(input);
    default:
      throw new Error(`Unsupported purpose: ${purpose}`);
  }
}

export function buildImagePlacementContextPack(
  input: ProductContextRegistryInput & {
    preferredRole?: ProductImagePlacementScopeRole;
  },
): AiProductContextPack {
  const context = deriveImagePlacementProductContext({
    ...input,
    preferredRole: input.preferredRole ?? 'main',
  });

  return {
    purpose: 'image-placement',
    summaryMarkdown: [
      'Image placement context:',
      `- Project content ends at ${context.projectContentEnd}s.`,
      `- Valid image scopes: ${formatScopeList(context.validScopes)}.`,
      `- Ready image assets: ${formatIdList(context.readyImageAssetIds)}.`,
      `- Selected ready image asset: ${context.selectedAssetId ?? 'none'}.`,
    ].join('\n'),
    availableCommands: [
      {
        type: 'ADD_IMAGE_ASSET_TO_TIMELINE',
        requiredArgs: ['assetId', 'placement', 'durationSeconds'],
        optionalArgs: ['fit', 'scopeRole'],
      },
    ],
    constraints: [
      'Use ADD_IMAGE_ASSET_TO_TIMELINE for image assets placed at the timeline start or end.',
      'Do not invent scope ids; use only validScopes or omit scopeRole.',
      'Missing assets cannot be placed.',
      'Use placement:"end" for end-of-video image placement and placement:"start" for intro placement.',
    ],
    data: {
      projectContentEnd: context.projectContentEnd,
      validScopes: context.validScopes.map(({ id, role, preferred }) => ({
        id,
        role,
        preferred,
      })),
      readyImageAssetIds: context.readyImageAssetIds,
      selectedAssetId: context.selectedAssetId,
    },
  };
}

export function buildTextInsertionContextPack(
  input: ProductContextRegistryInput,
): AiProductContextPack {
  const context = deriveTextInsertionProductContext({
    manifest: input.manifest,
    snapshot: input.snapshot,
    selectedLayerId: input.selectedLayerId,
  });

  return {
    purpose: 'text-insertion',
    summaryMarkdown: [
      'Text insertion context:',
      `- Project content ends at ${context.projectContentEnd}s.`,
      `- Valid text scopes: ${formatScopeList(context.validScopes)}.`,
    ].join('\n'),
    availableCommands: [
      {
        type: 'ADD_TITLE_TEXT',
        requiredArgs: ['text'],
        optionalArgs: ['placement', 'durationSeconds', 'startTime'],
      },
      {
        type: 'ADD_CAPTION_TEXT',
        requiredArgs: ['text'],
        optionalArgs: ['placement', 'durationSeconds', 'startTime'],
      },
    ],
    constraints: [
      'Use ADD_TITLE_TEXT for title or headline requests.',
      'Use ADD_CAPTION_TEXT for subtitle, caption, or lower-third requests.',
      'Do not build raw ADD_LAYER manifests for common text insertion.',
    ],
    data: {
      projectContentEnd: context.projectContentEnd,
      validScopes: context.validScopes.map(({ id, role, preferred }) => ({
        id,
        role,
        preferred,
      })),
      readyImageAssetIds: [],
      selectedAssetId: null,
      selectedTextLayerId:
        context.selectedLayer?.layerType === 'text' ? context.selectedLayer.layerId : null,
    },
  };
}

export function buildSelectedTextEditingContextPack(
  input: ProductContextRegistryInput,
): AiProductContextPack {
  const context = deriveTextInsertionProductContext({
    manifest: input.manifest,
    snapshot: input.snapshot,
    selectedLayerId: input.selectedLayerId,
  });
  const selectedTextLayerId =
    context.selectedLayer?.layerType === 'text' ? context.selectedLayer.layerId : null;

  return {
    purpose: 'selected-text-editing',
    summaryMarkdown: [
      'Selected text editing context:',
      `- Selected text layer: ${selectedTextLayerId ?? 'none'}.`,
      `- Valid text scopes: ${formatScopeList(context.validScopes)}.`,
    ].join('\n'),
    availableCommands: [
      {
        type: 'UPDATE_SELECTED_TEXT_STYLE',
        requiredArgs: ['patch'],
        optionalArgs: [],
      },
    ],
    constraints: [
      'Use UPDATE_SELECTED_TEXT_STYLE only when a text layer is selected.',
      'Patch text style fields such as text, fontSize, color, align, outlineColor, and outlineWidth.',
      'If no text layer is selected, ask the user to select one before editing selected text.',
    ],
    data: {
      projectContentEnd: context.projectContentEnd,
      validScopes: context.validScopes.map(({ id, role, preferred }) => ({
        id,
        role,
        preferred,
      })),
      readyImageAssetIds: [],
      selectedAssetId: null,
      selectedTextLayerId,
    },
  };
}

function formatScopeList(scopes: AiProductContextPack['data']['validScopes']): string {
  if (scopes.length === 0) {
    return 'none';
  }

  return scopes
    .map((scope) => `${scope.id} (${scope.role}${scope.preferred ? ', preferred' : ''})`)
    .join(', ');
}

function formatIdList(ids: string[]): string {
  return ids.length > 0 ? ids.join(', ') : 'none';
}
