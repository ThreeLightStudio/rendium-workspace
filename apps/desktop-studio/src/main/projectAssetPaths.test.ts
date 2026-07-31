import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createProjectAssetSourceUrl,
  getProjectAssetFilePath,
  resolveProjectAssetSourceUrl,
} from './projectAssetPaths';

describe('project asset paths', () => {
  it('creates stable logical URLs for project asset files', () => {
    expect(
      createProjectAssetSourceUrl({
        projectId: 'project-1',
        contentHash: 'hash-1',
        sourcePath: '/tmp/cover.png',
      }),
    ).toBe('rendium-asset://project-1/files/hash-1.png');
  });

  it('resolves logical URLs to the current physical storage backend', () => {
    const userDataPath = '/Users/test/Library/Application Support/Rendium Desktop Studio';

    expect(
      resolveProjectAssetSourceUrl({
        userDataPath,
        sourceUrl: 'rendium-asset://project-1/files/hash.png',
      }),
    ).toBe(
      getProjectAssetFilePath({
        userDataPath,
        projectId: 'project-1',
        contentHash: 'hash',
        sourcePath: 'hash.png',
      }),
    );
  });

  it('rejects project asset URLs that try to escape the files directory', () => {
    const userDataPath = join('/tmp', 'rendium-user-data');

    expect(() =>
      resolveProjectAssetSourceUrl({
        userDataPath,
        sourceUrl: 'rendium-asset://project-1/files/..%2Fsecret.png',
      }),
    ).toThrow('Invalid project asset source URL path.');
  });
});
