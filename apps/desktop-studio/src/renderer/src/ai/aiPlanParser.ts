import type { AiAssetRecommendationEnvelope } from '../../../shared/aiChat';
import { extractLastJsonBlock, extractPlainJsonObject, stripJsonBlocks } from './aiJsonEnvelope';

export type AiPlannerMode = 'EDIT_PLAN' | 'ANSWER_ONLY' | 'UNSUPPORTED';

export interface ParsedAiPlannerResponse {
  mode: AiPlannerMode;
  reply: string;
  recommendation: AiAssetRecommendationEnvelope | null;
  parseError: string | null;
}

export function parseAiPlannerResponse(content: string): ParsedAiPlannerResponse {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      mode: 'ANSWER_ONLY',
      reply: '',
      recommendation: null,
      parseError: 'Empty planner response.',
    };
  }

  const lines = trimmed.split(/\r?\n/);
  const firstNonEmptyLine = lines.find((line) => line.trim().length > 0)?.trim() ?? '';
  const modeMatch = /^MODE:\s*(EDIT_PLAN|ANSWER_ONLY|UNSUPPORTED)\s*$/i.exec(firstNonEmptyLine);

  if (!modeMatch) {
    const recommendation = parseRecommendationEnvelope(trimmed);
    return {
      mode: 'ANSWER_ONLY',
      reply: stripJsonBlocks(trimmed).trim(),
      recommendation,
      parseError: 'Missing planner mode header.',
    };
  }

  const mode = normalizePlannerMode(modeMatch[1]);
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  const body = lines
    .slice(headerIndex + 1)
    .join('\n')
    .trim();
  const recommendation = parseRecommendationEnvelope(body);
  const reply = stripJsonBlocks(body).trim();

  return {
    mode,
    reply,
    recommendation,
    parseError: null,
  };
}

function parseRecommendationEnvelope(content: string): AiAssetRecommendationEnvelope | null {
  const envelopeText = extractLastJsonBlock(content) ?? extractPlainJsonObject(content);
  if (!envelopeText) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(envelopeText);
    if (!isPlainObject(parsed)) {
      return null;
    }

    const candidates = Array.isArray(parsed.candidates)
      ? parsed.candidates.filter((candidate) => isPlainObject(candidate))
      : null;
    if (!candidates) {
      return null;
    }

    return {
      reply: typeof parsed.reply === 'string' ? parsed.reply.trim() : '',
      candidates: candidates
        .map((candidate) => {
          const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
          const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : '';
          if (!title || !reason) {
            return null;
          }

          const suggestedTags = Array.isArray(candidate.suggestedTags)
            ? candidate.suggestedTags
                .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
                .filter((tag) => tag.length > 0)
            : undefined;

          return {
            ...(typeof candidate.assetId === 'string' && candidate.assetId.trim().length > 0
              ? { assetId: candidate.assetId.trim() }
              : {}),
            title,
            reason,
            ...(suggestedTags && suggestedTags.length > 0 ? { suggestedTags } : {}),
            ...(typeof candidate.prompt === 'string' && candidate.prompt.trim().length > 0
              ? { prompt: candidate.prompt.trim() }
              : {}),
          };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null),
      ...(typeof parsed.uploadCta === 'string' && parsed.uploadCta.trim().length > 0
        ? { uploadCta: parsed.uploadCta.trim() }
        : {}),
      ...(typeof parsed.promptSuggestion === 'string' && parsed.promptSuggestion.trim().length > 0
        ? { promptSuggestion: parsed.promptSuggestion.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}

function normalizePlannerMode(value: string): AiPlannerMode {
  const normalized = value.toUpperCase();
  if (normalized === 'EDIT_PLAN' || normalized === 'UNSUPPORTED') {
    return normalized;
  }

  return 'ANSWER_ONLY';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
