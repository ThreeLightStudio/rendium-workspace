import type { AiAssetMetadataSuggestion } from '../../../shared/aiChat';
import { extractLastJsonBlock, extractPlainJsonObject, stripJsonBlocks } from './aiJsonEnvelope';

export interface ParsedAiAssetMetadataResponse {
  metadata: AiAssetMetadataSuggestion | null;
  reply: string;
  parseError: string | null;
}

export function parseAiAssetMetadataResponse(content: string): ParsedAiAssetMetadataResponse {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      metadata: null,
      reply: '',
      parseError: 'Empty asset metadata response.',
    };
  }

  const envelopeText = extractLastJsonBlock(trimmed) ?? extractPlainJsonObject(trimmed);
  if (!envelopeText) {
    return {
      metadata: null,
      reply: stripJsonBlocks(trimmed).trim(),
      parseError: 'Missing asset metadata JSON envelope.',
    };
  }

  try {
    const parsed: unknown = JSON.parse(envelopeText);
    if (!isPlainObject(parsed)) {
      return {
        metadata: null,
        reply: stripJsonBlocks(trimmed).trim(),
        parseError: 'Asset metadata JSON envelope must be an object.',
      };
    }

    const payload = isPlainObject(parsed.metadata) ? parsed.metadata : parsed;
    const description = typeof payload.description === 'string' ? payload.description.trim() : '';
    const tags = Array.isArray(payload.tags)
      ? payload.tags
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter((tag) => tag.length > 0)
      : [];

    return {
      metadata: {
        description,
        tags,
        subject: typeof payload.subject === 'string' ? payload.subject.trim() : '',
        mood: typeof payload.mood === 'string' ? payload.mood.trim() : '',
        usageHint: typeof payload.usageHint === 'string' ? payload.usageHint.trim() : '',
      },
      reply: stripJsonBlocks(trimmed).trim(),
      parseError: null,
    };
  } catch (error) {
    return {
      metadata: null,
      reply: stripJsonBlocks(trimmed).trim(),
      parseError: error instanceof Error ? error.message : 'Failed to parse asset metadata.',
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
