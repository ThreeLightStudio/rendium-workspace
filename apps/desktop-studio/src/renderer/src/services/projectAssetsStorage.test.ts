import { describe, expect, it } from 'vitest';
import { normalizeStoredProjectAssetsBundle } from './projectAssetsStorage';

const validAsset = {
  id: 'asset-1',
  projectId: 'project-1',
  assetKind: 'image',
  contentHash: 'hash-1',
  displayName: 'Cover',
  sourceUrl: 'rendium-asset://project-1/files/hash-1.png',
  lastKnownSourceUrl: 'rendium-asset://project-1/files/hash-1.png',
  importedFromPath: null,
  thumbnailDataUrl: 'data:image/png;base64,AAA',
  mimeType: 'image/png',
  width: 1280,
  height: 720,
  durationSeconds: null,
  audioAnalysis: null,
  status: 'ready',
  usageCount: 0,
  createdAt: 1,
  updatedAt: 1,
  lastUsedAt: null,
  metadata: {
    description: '',
    tags: [],
    subject: '',
    mood: '',
    usageHint: '',
  },
  metadataOrigin: 'unknown',
  lastEditedBy: null,
  hasUserOverride: false,
};

describe('normalizeStoredProjectAssetsBundle', () => {
  it('rejects primitive and partial bundle payloads', () => {
    expect(normalizeStoredProjectAssetsBundle(null)).toBeUndefined();
    expect(normalizeStoredProjectAssetsBundle('not-a-bundle')).toBeUndefined();
    expect(
      normalizeStoredProjectAssetsBundle({
        projectId: 'project-1',
        updatedAt: 1,
      }),
    ).toBeUndefined();
  });

  it('filters malformed asset records from otherwise valid bundles', () => {
    const bundle = normalizeStoredProjectAssetsBundle({
      projectId: 'project-1',
      updatedAt: 1,
      assets: [
        validAsset,
        {
          id: 'asset-2',
          projectId: 'project-1',
          contentHash: 'hash-2',
          displayName: 'Broken',
          mimeType: 'image/png',
          status: 'not-real',
          usageCount: 0,
          createdAt: 1,
          updatedAt: 1,
          metadata: validAsset.metadata,
          metadataOrigin: 'unknown',
          hasUserOverride: false,
        },
      ],
    });

    expect(bundle).toEqual({
      projectId: 'project-1',
      updatedAt: 1,
      assets: [validAsset],
    });
  });

  it('accepts legacy records without an explicit asset kind', () => {
    const { assetKind: _assetKind, ...legacyAsset } = validAsset;

    const bundle = normalizeStoredProjectAssetsBundle({
      projectId: 'project-1',
      updatedAt: 1,
      assets: [legacyAsset],
    });

    expect(bundle?.assets[0]).toEqual(legacyAsset);
  });
});
