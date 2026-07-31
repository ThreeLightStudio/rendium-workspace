import {
  type AiChatEvent,
  type AiChatProviderKind,
  type AiChatStartRequest,
  OPENAI_DEFAULT_MODEL_NAME,
  buildAiChatTranscriptMessages,
} from '../shared/aiChat';
import type { AiChatSettings } from './aiChatSettings';

export interface AiChatProviderInput {
  request: AiChatStartRequest;
  signal: AbortSignal;
  onEvent: (event: AiChatEvent) => void;
}

export interface AiChatProvider {
  streamChat: (input: AiChatProviderInput) => Promise<void>;
}

export function resolveAiChatProviderKind(
  _env: NodeJS.ProcessEnv = process.env,
): AiChatProviderKind {
  return 'openai';
}

export function createAiChatProvider(
  settings?: AiChatSettings,
  env: NodeJS.ProcessEnv = process.env,
): AiChatProvider {
  return createOpenAiChatProvider(env, settings);
}

export function createOpenAiChatProvider(
  env: NodeJS.ProcessEnv = process.env,
  settings?: Pick<AiChatSettings, 'openAiApiKey' | 'openAiModel'>,
): AiChatProvider {
  return {
    streamChat: async ({ request, signal, onEvent }) => {
      const apiKey = settings?.openAiApiKey?.trim() || env.OPENAI_API_KEY?.trim() || '';
      if (!apiKey) {
        throw new Error('OpenAI API key is required in AI settings.');
      }

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model:
            settings?.openAiModel?.trim() || env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL_NAME,
          input: toOpenAiInput(request),
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await readResponseText(response);
        throw new Error(
          `OpenAI responded with ${response.status}${response.statusText ? ` ${response.statusText}` : ''}${errorText ? `: ${errorText}` : ''}`,
        );
      }

      if (!response.body) {
        throw new Error('OpenAI response did not include a streaming body.');
      }

      await readOpenAiStream(response.body, request.requestId, onEvent);
    },
  };
}

function toOpenAiInput(request: AiChatStartRequest): Array<Record<string, unknown>> {
  return buildAiChatTranscriptMessages({
    messages: request.messages,
    editorContext: request.editorContext,
    phase: request.phase,
  }).map((message) => ({
    role: message.role,
    content:
      message.images && message.images.length > 0
        ? [
            { type: 'input_text', text: message.content },
            ...message.images.map((image) => ({ type: 'input_image', image_url: image })),
          ]
        : message.content,
  }));
}

async function readOpenAiStream(
  body: ReadableStream<Uint8Array>,
  requestId: string,
  onEvent: (event: AiChatEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const result = drainOpenAiSseBuffer(buffer, requestId, onEvent);
    buffer = result.buffer;
    content += result.delta;
  }

  buffer += decoder.decode();
  const trailing = drainOpenAiSseBuffer(`${buffer}\n\n`, requestId, onEvent);
  content += trailing.delta;

  if (content.trim().length === 0) {
    onEvent({
      type: 'error',
      requestId,
      error: 'OpenAI returned an empty response.',
    });
    return;
  }

  onEvent({ type: 'done', requestId, content });
}

function drainOpenAiSseBuffer(
  buffer: string,
  requestId: string,
  onEvent: (event: AiChatEvent) => void,
): { buffer: string; delta: string } {
  let nextBuffer = buffer;
  let delta = '';

  while (true) {
    const separatorIndex = nextBuffer.indexOf('\n\n');
    if (separatorIndex === -1) {
      break;
    }

    const block = nextBuffer.slice(0, separatorIndex);
    nextBuffer = nextBuffer.slice(separatorIndex + 2);
    const rawData = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n');

    if (!rawData || rawData === '[DONE]') {
      continue;
    }

    const event = JSON.parse(rawData) as Record<string, unknown>;
    const nextDelta =
      event.type === 'response.output_text.delta' && typeof event.delta === 'string'
        ? event.delta
        : '';
    if (nextDelta) {
      delta += nextDelta;
      onEvent({ type: 'delta', requestId, delta: nextDelta });
    }
  }

  return { buffer: nextBuffer, delta };
}

async function readResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim().slice(0, 500);
  } catch {
    return '';
  }
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown AI request error.';
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  return isPlainObject(error) && typeof error.name === 'string' && error.name === 'AbortError';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
