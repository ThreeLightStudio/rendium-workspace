import { describe, expect, it } from 'vitest';
import { ProjectFactory } from '../store/ProjectFactory';

describe('ProjectFactory scaffold', () => {
  it('creates the expected three control scope roles for a blank project', () => {
    const manifest = ProjectFactory.createBlankManifest({ name: 'Test Project' });
    const trackRoles = manifest.layerOrder
      .map((id) => manifest.layers[id])
      .filter(
        (layer) =>
          layer?.kind === 'control' &&
          layer.control?.role === 'scopeStart' &&
          layer.control.params?.isProjectAnchor !== true,
      )
      .map((layer) => layer?.control?.params?.scopeRole);

    expect(manifest.version).toBe('1.0');
    expect(manifest.links).toEqual({});
    expect(trackRoles).toEqual(['main', 'overlay', 'text']);
  });
});
