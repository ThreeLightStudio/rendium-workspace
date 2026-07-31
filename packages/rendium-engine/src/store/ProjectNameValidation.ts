import { PROJECT_CONFIG } from '../_contracts';

export function sanitizeProjectName(name: string): string {
  const trimmedName = name.trim();
  const withoutInvalidCharacters = trimmedName.replace(PROJECT_CONFIG.INVALID_NAME_CHARS, '');

  if (withoutInvalidCharacters.length > PROJECT_CONFIG.MAX_NAME_LENGTH) {
    return withoutInvalidCharacters.substring(0, PROJECT_CONFIG.MAX_NAME_LENGTH);
  }

  return withoutInvalidCharacters;
}

export function getDisplayProjectName(name?: string): string {
  if (!name || name.trim().length === 0) {
    return PROJECT_CONFIG.DEFAULT_NAME;
  }

  return name.trim();
}
