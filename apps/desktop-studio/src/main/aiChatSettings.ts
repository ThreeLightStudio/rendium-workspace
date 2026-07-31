import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import {
  type AiChatProviderKind,
  type AiChatSettingsUpdate,
  type AiChatSettingsView,
  OPENAI_DEFAULT_MODEL_NAME,
} from '../shared/aiChat';

export interface AiChatSettings {
  provider: AiChatProviderKind;
  openAiApiKey: string;
  openAiModel: string;
}

const SETTINGS_FILE_NAME = 'ai-chat-settings.json';

let settingsCache: AiChatSettings | null = null;

export function getDefaultAiChatSettings(env: NodeJS.ProcessEnv = process.env): AiChatSettings {
  return {
    provider: 'openai',
    openAiApiKey: env.OPENAI_API_KEY?.trim() ?? '',
    openAiModel: env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL_NAME,
  };
}

export async function loadAiChatSettings(): Promise<AiChatSettings> {
  if (settingsCache) {
    return settingsCache;
  }

  const defaults = getDefaultAiChatSettings();
  try {
    const raw = await readFile(getAiChatSettingsPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    settingsCache = normalizeStoredSettings(parsed, defaults);
  } catch (error) {
    if (isMissingFileError(error)) {
      settingsCache = defaults;
    } else {
      throw error;
    }
  }

  return settingsCache;
}

export async function updateAiChatSettings(update: AiChatSettingsUpdate): Promise<AiChatSettings> {
  const current = await loadAiChatSettings();
  const next: AiChatSettings = {
    ...current,
    ...(update.provider ? { provider: update.provider } : {}),
    ...(typeof update.openAiModel === 'string'
      ? { openAiModel: normalizeText(update.openAiModel) }
      : {}),
  };

  if (typeof update.openAiApiKey === 'string' && update.openAiApiKey.trim().length > 0) {
    next.openAiApiKey = update.openAiApiKey.trim();
  }

  if (update.clearOpenAiApiKey) {
    next.openAiApiKey = '';
  }

  settingsCache = {
    ...next,
    openAiModel: next.openAiModel || OPENAI_DEFAULT_MODEL_NAME,
  };

  await persistAiChatSettings(settingsCache);
  return settingsCache;
}

export function toAiChatSettingsView(settings: AiChatSettings): AiChatSettingsView {
  return {
    provider: settings.provider,
    openAiModel: settings.openAiModel,
    hasOpenAiApiKey: settings.openAiApiKey.trim().length > 0,
    ollamaHost: '',
    ollamaModel: '',
  };
}

function getAiChatSettingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE_NAME);
}

async function persistAiChatSettings(settings: AiChatSettings): Promise<void> {
  const settingsPath = getAiChatSettingsPath();
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

function normalizeStoredSettings(value: unknown, defaults: AiChatSettings): AiChatSettings {
  if (!isPlainObject(value)) {
    return defaults;
  }

  return {
    provider: 'openai',
    openAiApiKey:
      typeof value.openAiApiKey === 'string' ? value.openAiApiKey.trim() : defaults.openAiApiKey,
    openAiModel:
      typeof value.openAiModel === 'string' && value.openAiModel.trim().length > 0
        ? value.openAiModel.trim()
        : defaults.openAiModel,
  };
}

function normalizeText(value: string): string {
  return value.trim();
}

function isMissingFileError(error: unknown): boolean {
  return isPlainObject(error) && error.code === 'ENOENT';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
