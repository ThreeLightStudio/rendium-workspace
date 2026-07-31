import { describe, expect, it } from 'vitest';
import type { ProjectAssetRecord } from '../stores/projectAssetTypes';
import {
  type ProductContextRegistryInput,
  buildImagePlacementContextPack,
  buildSelectedTextEditingContextPack,
  buildTextInsertionContextPack,
} from './productContextRegistry';

const imageAsset: ProjectAssetRecord = {
  id: 'image-asset',
  projectId: 'project-1',
  assetKind: 'image',
  contentHash: 'hash-image',
  displayName: 'Image asset',
  sourceUrl: 'rendium-asset://project-1/files/hash-image.png',
  lastKnownSourceUrl: 'rendium-asset://project-1/files/hash-image.png',
  importedFromPath: null,
  mimeType: 'image/png',
  size: 1024,
  width: 1280,
  height: 720,
  durationSeconds: null,
  status: 'ready',
  createdAt: 1,
  updatedAt: 1,
};

const audioAsset: ProjectAssetRecord = {
  ...imageAsset,
  id: 'audio-asset',
  assetKind: 'audio',
  displayName: 'Audio asset',
  sourceUrl: 'rendium-asset://project-1/files/hash-audio.mp3',
  lastKnownSourceUrl: 'rendium-asset://project-1/files/hash-audio.mp3',
  mimeType: 'audio/mpeg',
  width: null,
  height: null,
  durationSeconds: 180,
};

const manifest: ProductContextRegistryInput['manifest'] = {
  layers: {
    'scope-main': {
      id: 'scope-main',
      kind: 'control',
      startTime: 0,
      duration: 10,
      control: {
        role: 'scopeStart',
        params: { scopeRole: 'main' },
      },
    },
    'scope-text': {
      id: 'scope-text',
      kind: 'control',
      startTime: 0,
      duration: 10,
      control: {
        role: 'scopeStart',
        params: { scopeRole: 'text' },
      },
    },
    'text-1': {
      id: 'text-1',
      kind: 'visual',
      name: 'Title',
      startTime: 0,
      duration: 5,
      source: {
        sourceId: 'text:text-1',
        provider: 'text',
        track: 'visual',
        params: { text: 'Title' },
      },
    },
  },
  layerOrder: ['scope-main', 'scope-text', 'text-1'],
};

describe('product context registry', () => {
  it('builds an image placement pack with deterministic commands and constraints', () => {
    const pack = buildImagePlacementContextPack({
      manifest: {
        layers: { 'scope-main': manifest.layers['scope-main'] },
        layerOrder: ['scope-main'],
      },
      snapshot: { duration: 24, projectDuration: 30 },
      assets: [imageAsset],
      selectedAssetId: 'image-asset',
      selectedLayerId: null,
    });

    expect(pack.purpose).toBe('image-placement');
    expect(pack.data.projectContentEnd).toBe(24);
    expect(pack.data.validScopes).toEqual([{ id: 'scope-main', role: 'main', preferred: true }]);
    expect(pack.data.readyImageAssetIds).toEqual(['image-asset']);
    expect(pack.availableCommands).toEqual([
      {
        type: 'ADD_IMAGE_ASSET_TO_TIMELINE',
        requiredArgs: ['assetId', 'placement', 'durationSeconds'],
        optionalArgs: ['fit', 'scopeRole'],
      },
    ]);
    expect(pack.constraints.join(' ')).toContain('Do not invent scope ids');
    expect(pack.summaryMarkdown).toContain('Project content ends at 24s');
  });

  it('builds text packs with ProductCommand descriptors', () => {
    const baseInput = {
      manifest,
      snapshot: { duration: 24, projectDuration: 30 },
      assets: [imageAsset, audioAsset],
      selectedAssetId: 'audio-asset',
      selectedLayerId: 'text-1',
    };

    const textPack = buildTextInsertionContextPack(baseInput);
    const selectedTextPack = buildSelectedTextEditingContextPack(baseInput);

    expect(textPack.availableCommands.map((command) => command.type)).toEqual([
      'ADD_TITLE_TEXT',
      'ADD_CAPTION_TEXT',
    ]);
    expect(textPack.constraints.join(' ')).toContain('Do not build raw ADD_LAYER');
    expect(selectedTextPack.data.selectedTextLayerId).toBe('text-1');
    expect(selectedTextPack.availableCommands[0]?.type).toBe('UPDATE_SELECTED_TEXT_STYLE');
  });
});
