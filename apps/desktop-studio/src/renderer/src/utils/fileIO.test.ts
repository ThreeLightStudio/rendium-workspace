import { describe, expect, it } from 'vitest';
import { isProjectManifestInput } from './fileIO';

describe('isProjectManifestInput', () => {
  it('rejects primitive and partial imported project payloads', () => {
    expect(isProjectManifestInput(null)).toBe(false);
    expect(isProjectManifestInput('not-a-project')).toBe(false);
    expect(isProjectManifestInput({ layers: {} })).toBe(false);
    expect(isProjectManifestInput({ layerOrder: [] })).toBe(false);
  });

  it('accepts manifest-like payloads before project normalization', () => {
    expect(
      isProjectManifestInput({
        layers: {},
        layerOrder: [],
      }),
    ).toBe(true);
  });
});
