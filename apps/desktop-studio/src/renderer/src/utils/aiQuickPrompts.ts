type AiQuickPromptSeedKey =
  | 'ai.quickPromptLayoutSummary'
  | 'ai.quickPromptLayoutSummaryPrompt'
  | 'ai.quickPromptExplainSelectedLayer'
  | 'ai.quickPromptExplainSelectedLayerPrompt'
  | 'ai.quickPromptJumpToTime'
  | 'ai.quickPromptJumpToTimePrompt';

type TranslateFn = (key: AiQuickPromptSeedKey) => string;

export interface AiQuickPrompt {
  id: string;
  label: string;
  prompt: string;
}

export interface AiQuickPromptInput {
  label: string;
  prompt: string;
}

export const AI_QUICK_PROMPTS_STORAGE_KEY = 'desktop-studio.ai.quick-prompts';

type StoredPromptsReadResult =
  | {
      status: 'empty' | 'unavailable';
    }
  | {
      status: 'valid';
      prompts: AiQuickPrompt[];
    }
  | {
      status: 'invalid';
      reason: 'malformed-json' | 'non-array-payload' | 'no-valid-prompts';
      error?: unknown;
    };

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isPromptRecord(record: unknown): record is Record<string, unknown> {
  return record !== null && typeof record === 'object';
}

function createPromptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `quick-prompt-${crypto.randomUUID()}`;
  }

  return `quick-prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimField(value: string): string {
  return value.trim();
}

function getDefaultQuickPrompts(translate: TranslateFn): AiQuickPrompt[] {
  return [
    {
      id: 'seed-layout-summary',
      label: translate('ai.quickPromptLayoutSummary'),
      prompt: translate('ai.quickPromptLayoutSummaryPrompt'),
    },
    {
      id: 'seed-selected-layer',
      label: translate('ai.quickPromptExplainSelectedLayer'),
      prompt: translate('ai.quickPromptExplainSelectedLayerPrompt'),
    },
    {
      id: 'seed-jump-to-time',
      label: translate('ai.quickPromptJumpToTime'),
      prompt: translate('ai.quickPromptJumpToTimePrompt'),
    },
  ];
}

function normalizePrompt(record: unknown): AiQuickPrompt | null {
  if (!isPromptRecord(record)) {
    return null;
  }

  if (typeof record.id !== 'string' || record.id.trim().length === 0) {
    return null;
  }

  if (typeof record.label !== 'string' || typeof record.prompt !== 'string') {
    return null;
  }

  const label = trimField(record.label);
  const prompt = trimField(record.prompt);
  if (!label || !prompt) {
    return null;
  }

  return {
    id: record.id,
    label,
    prompt,
  };
}

function readStoredPrompts(): StoredPromptsReadResult {
  if (!isBrowser()) {
    return { status: 'unavailable' };
  }

  const stored = window.localStorage.getItem(AI_QUICK_PROMPTS_STORAGE_KEY);
  if (!stored) {
    return { status: 'empty' };
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return {
        status: 'invalid',
        reason: 'non-array-payload',
      };
    }

    const normalized = parsed
      .map(normalizePrompt)
      .filter((item): item is AiQuickPrompt => item !== null);
    return normalized.length > 0
      ? {
          status: 'valid',
          prompts: normalized,
        }
      : {
          status: 'invalid',
          reason: 'no-valid-prompts',
        };
  } catch (error: unknown) {
    return {
      status: 'invalid',
      reason: 'malformed-json',
      error,
    };
  }
}

function warnInvalidStoredPrompts(
  result: Extract<StoredPromptsReadResult, { status: 'invalid' }>,
): void {
  console.warn('Unable to read AI quick prompts from localStorage.', {
    key: AI_QUICK_PROMPTS_STORAGE_KEY,
    reason: result.reason,
    error: result.error,
  });
}

function writeStoredPrompts(prompts: AiQuickPrompt[]): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(AI_QUICK_PROMPTS_STORAGE_KEY, JSON.stringify(prompts));
}

export function buildAiQuickPrompts(translate: TranslateFn): AiQuickPrompt[] {
  const storedPromptsResult = readStoredPrompts();
  if (storedPromptsResult.status === 'valid') {
    return storedPromptsResult.prompts;
  }

  if (storedPromptsResult.status === 'invalid') {
    warnInvalidStoredPrompts(storedPromptsResult);
    return getDefaultQuickPrompts(translate);
  }

  const seededPrompts = getDefaultQuickPrompts(translate);
  writeStoredPrompts(seededPrompts);
  return seededPrompts;
}

export function createAiQuickPrompt(input: AiQuickPromptInput): AiQuickPrompt {
  return {
    id: createPromptId(),
    label: trimField(input.label),
    prompt: trimField(input.prompt),
  };
}

export function saveAiQuickPrompts(prompts: AiQuickPrompt[]): AiQuickPrompt[] {
  const normalized = prompts
    .map((prompt) => ({
      id: prompt.id,
      label: trimField(prompt.label),
      prompt: trimField(prompt.prompt),
    }))
    .filter(
      (prompt) => prompt.id.length > 0 && prompt.label.length > 0 && prompt.prompt.length > 0,
    );

  writeStoredPrompts(normalized);
  return normalized;
}

export function updateAiQuickPrompt(
  prompts: AiQuickPrompt[],
  promptId: string,
  input: AiQuickPromptInput,
): AiQuickPrompt[] {
  const nextPrompts = prompts.map((prompt) =>
    prompt.id === promptId
      ? {
          ...prompt,
          label: trimField(input.label),
          prompt: trimField(input.prompt),
        }
      : prompt,
  );

  return saveAiQuickPrompts(nextPrompts);
}

export function deleteAiQuickPrompt(prompts: AiQuickPrompt[], promptId: string): AiQuickPrompt[] {
  return saveAiQuickPrompts(prompts.filter((prompt) => prompt.id !== promptId));
}

export function resetAiQuickPrompts(translate: TranslateFn): AiQuickPrompt[] {
  const seededPrompts = getDefaultQuickPrompts(translate);
  writeStoredPrompts(seededPrompts);
  return seededPrompts;
}
