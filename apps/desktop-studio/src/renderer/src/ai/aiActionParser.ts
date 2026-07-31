import type {
  AiAddLayerAction,
  AiAssistantAction,
  AiAssistantActionKind,
  AiSeekTimelineAction,
} from '../services/AiService';
import { AI_ASSISTANT_ACTION_KINDS } from '../services/AiService';
import { parseTimecodeToSeconds } from '../utils/timecode';
import {
  normalizeLayerManifestTransform,
  normalizeTransformIntentFields,
} from './aiTransformUtils';

const ALLOWED_ACTION_KINDS: readonly AiAssistantActionKind[] = AI_ASSISTANT_ACTION_KINDS;

export interface ParsedAiActionPlan {
  reply: string;
  actions: AiAssistantAction[];
  parseError: string | null;
}

export function parseAiAssistantResponse(content: string): ParsedAiActionPlan {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      reply: '',
      actions: [],
      parseError: 'Empty assistant response.',
    };
  }

  const envelopeText = extractLastJsonBlock(trimmed) ?? extractPlainJsonObject(trimmed);
  if (!envelopeText) {
    return {
      reply: extractDisplayedReply(trimmed),
      actions: [],
      parseError: 'Missing JSON action envelope.',
    };
  }

  try {
    const parsed: unknown = JSON.parse(envelopeText);
    if (!isPlainObject(parsed)) {
      return {
        reply: extractDisplayedReply(trimmed),
        actions: [],
        parseError: 'JSON action envelope must be an object.',
      };
    }

    const reply = extractDisplayedReply(
      trimmed,
      typeof parsed.reply === 'string' ? parsed.reply : '',
    );
    const actions = Array.isArray(parsed.actions) ? sanitizeActions(parsed.actions) : [];

    if (actions.length === 0) {
      return {
        reply,
        actions: [],
        parseError: 'No executable actions were found in the JSON envelope.',
      };
    }

    return {
      reply,
      actions,
      parseError: null,
    };
  } catch (error) {
    return {
      reply: extractDisplayedReply(trimmed),
      actions: [],
      parseError: error instanceof Error ? error.message : 'Failed to parse assistant response.',
    };
  }
}

function sanitizeActions(rawActions: unknown[]): AiAssistantAction[] {
  const actions: AiAssistantAction[] = [];

  for (const rawAction of rawActions) {
    if (!isPlainObject(rawAction)) {
      continue;
    }

    const action = rawAction;
    const actionType = resolveActionType(action.type);
    if (!actionType || !ALLOWED_ACTION_KINDS.includes(actionType)) {
      continue;
    }

    switch (actionType) {
      case 'ADD_LAYER': {
        if (!isAddLayerManifest(action.manifest)) continue;
        const normalizedTransform = normalizeLayerManifestTransform(action.manifest);
        const { transform: _rawTransform, ...manifestWithoutTransform } = action.manifest;
        const manifest: AiAddLayerAction['manifest'] = {
          ...manifestWithoutTransform,
          ...(normalizedTransform ? { transform: normalizedTransform } : {}),
        };
        const targetScopeId =
          typeof action.targetScopeId === 'string' && action.targetScopeId.trim().length > 0
            ? action.targetScopeId.trim()
            : undefined;
        actions.push({
          type: actionType,
          ...(targetScopeId ? { targetScopeId } : {}),
          manifest,
        });
        break;
      }
      case 'UPDATE_LAYER_PROPS': {
        const layerId = resolveActionLayerId(action);
        if (!layerId || !isPlainObject(action.patch)) continue;
        actions.push({
          type: actionType,
          layerId,
          patch: action.patch,
        });
        break;
      }
      case 'UPDATE_TRANSFORM': {
        const layerId = resolveActionLayerId(action);
        if (!layerId) continue;
        const normalizedTransform = normalizeTransformIntentFields(action);
        if (!normalizedTransform) continue;
        actions.push({
          type: actionType,
          layerId,
          ...normalizedTransform,
        });
        break;
      }
      case 'TOGGLE_VISIBILITY': {
        const layerId = resolveActionLayerId(action);
        if (!layerId || typeof action.visible !== 'boolean') continue;
        actions.push({ type: actionType, layerId, visible: action.visible });
        break;
      }
      case 'REORDER_LAYER': {
        const layerId = resolveActionLayerId(action);
        const toIndex =
          typeof action.toIndex === 'number' ? Math.trunc(action.toIndex) : Number.NaN;
        if (!layerId || !Number.isFinite(toIndex)) continue;
        actions.push({ type: actionType, layerId, toIndex });
        break;
      }
      case 'REMOVE_LAYER': {
        const layerId = resolveActionLayerId(action);
        if (!layerId) continue;
        actions.push({ type: actionType, layerId });
        break;
      }
      case 'SEEK_TIMELINE': {
        const timelineAction = normalizeTimelineSeekAction(action);
        if (!timelineAction) continue;
        actions.push(timelineAction);
        break;
      }
      case 'ADD_IMAGE_ASSET_TO_TIMELINE': {
        const assetId = typeof action.assetId === 'string' ? action.assetId.trim() : '';
        if (!assetId) continue;

        const placement =
          action.placement === 'start' || action.placement === 'end' ? action.placement : undefined;
        if (!placement) continue;

        const durationSeconds =
          typeof action.durationSeconds === 'number' && Number.isFinite(action.durationSeconds)
            ? Math.max(0, action.durationSeconds)
            : 7;
        if (durationSeconds <= 0) continue;

        const fit = action.fit === 'contain' || action.fit === 'cover' ? action.fit : undefined;
        const scopeRole =
          action.scopeRole === 'main' || action.scopeRole === 'overlay'
            ? action.scopeRole
            : undefined;

        actions.push({
          type: actionType,
          assetId,
          placement,
          durationSeconds,
          ...(fit ? { fit } : {}),
          ...(scopeRole ? { scopeRole } : {}),
        });
        break;
      }
      case 'RUN_WORKFLOW': {
        const workflowId =
          typeof action.workflowId === 'string' ? action.workflowId.trim() : 'audio-visual-draft';
        const rawBindings = isPlainObject(action.assetBindings) ? action.assetBindings : {};
        const audio = typeof rawBindings.audio === 'string' ? rawBindings.audio.trim() : '';
        const image = typeof rawBindings.image === 'string' ? rawBindings.image.trim() : '';
        if (!audio || !image) continue;
        const rawFieldValues = isPlainObject(action.fieldValues) ? action.fieldValues : {};
        const fieldValues: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawFieldValues)) {
          if (typeof value === 'string' && value.trim()) {
            fieldValues[key] = value.trim();
          }
        }
        actions.push({
          type: actionType,
          workflowId,
          presetId: typeof action.presetId === 'string' ? action.presetId.trim() : undefined,
          assetBindings: { audio, image },
          ...(Object.keys(fieldValues).length > 0 ? { fieldValues } : {}),
        });
        break;
      }
      case 'ADD_TITLE_TEXT':
      case 'ADD_CAPTION_TEXT': {
        const text = typeof action.text === 'string' ? action.text.trim() : '';
        if (!text) continue;
        const placement = normalizeTextPlacement(action.placement);
        const durationSeconds = normalizePositiveNumber(action.durationSeconds);
        const startTime = normalizeNonNegativeNumber(action.startTime);
        actions.push({
          type: actionType,
          text,
          ...(placement ? { placement } : {}),
          ...(durationSeconds !== null ? { durationSeconds } : {}),
          ...(startTime !== null ? { startTime } : {}),
        });
        break;
      }
      case 'UPDATE_SELECTED_TEXT_STYLE': {
        if (!isPlainObject(action.patch)) continue;
        actions.push({
          type: actionType,
          patch: action.patch,
        });
        break;
      }
    }
  }

  return actions;
}

function normalizeTextPlacement(value: unknown): 'center' | 'top' | 'bottom' | undefined {
  return value === 'center' || value === 'top' || value === 'bottom' ? value : undefined;
}

function normalizePositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

function extractLastJsonBlock(content: string): string | null {
  const blockPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let lastParseable: string | null = null;

  for (let match = blockPattern.exec(content); match !== null; match = blockPattern.exec(content)) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isPlainObject(parsed)) {
        lastParseable = candidate;
      }
    } catch {
      // ignore non-json blocks
    }
  }

  return lastParseable;
}

function extractPlainJsonObject(content: string): string | null {
  if (!content.startsWith('{') || !content.endsWith('}')) {
    return null;
  }

  if (content.includes('```')) {
    return null;
  }

  try {
    JSON.parse(content);
    return content;
  } catch {
    return null;
  }
}

function stripEnvelopeFromContent(content: string): string {
  return content.replace(/```(?:json)?\s*[\s\S]*?```/gi, '').trim();
}

function resolveActionLayerId(action: Record<string, unknown>): string {
  const candidates = [action.layerId, action.targetLayerId, action.targetScopeId];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return '';
}

function resolveActionType(value: unknown): AiAssistantActionKind | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'JUMP_TO_TIME') {
    return 'SEEK_TIMELINE';
  }

  return ALLOWED_ACTION_KINDS.find((kind) => kind === normalized) ?? null;
}

function normalizeTimelineSeekAction(action: Record<string, unknown>): AiSeekTimelineAction | null {
  const rawTime =
    action.timeSeconds ?? action.timecode ?? action.time ?? action.seconds ?? action.targetTime;

  const parsedTime = parseTimelineTimecodeValue(rawTime);
  if (parsedTime === null) {
    return null;
  }

  return {
    type: 'SEEK_TIMELINE',
    timeSeconds: parsedTime,
  };
}

function parseTimelineTimecodeValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, value) : null;
  }

  if (typeof value === 'string') {
    return parseTimecodeToSeconds(value);
  }

  return null;
}

function extractDisplayedReply(content: string, explicitReply = ''): string {
  const normalizedExplicitReply = explicitReply.trim();
  if (normalizedExplicitReply.length > 0) {
    return normalizedExplicitReply;
  }

  const strippedContent = stripEnvelopeFromContent(content).trim();
  if (strippedContent.length === 0) {
    return '';
  }

  return /[{}\[\]]/.test(strippedContent) ? '' : strippedContent;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAddLayerManifest(value: unknown): value is AiAddLayerAction['manifest'] {
  return (
    isPlainObject(value) &&
    (value.kind === 'visual' || value.kind === 'audio' || value.kind === 'control')
  );
}
