import { describe, expect, it } from 'vitest';
import { PROJECT_CONFIG } from '../_contracts';
import { getDisplayProjectName, sanitizeProjectName } from '../store/ProjectNameValidation';

describe('project name validation', () => {
  it('trims invalid characters and enforces max length', () => {
    const longName = `  Demo/${'x'.repeat(PROJECT_CONFIG.MAX_NAME_LENGTH)}  `;

    expect(sanitizeProjectName(longName)).toBe(
      `Demo${'x'.repeat(PROJECT_CONFIG.MAX_NAME_LENGTH - 4)}`,
    );
  });

  it('falls back to the default display name for blank input', () => {
    expect(getDisplayProjectName('   ')).toBe(PROJECT_CONFIG.DEFAULT_NAME);
  });
});
