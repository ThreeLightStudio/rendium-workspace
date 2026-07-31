import { describe, expect, it, vi } from 'vitest';
import { createOpenAiChatProvider, resolveAiChatProviderKind } from './aiChatProviders';

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe('aiChatProviders', () => {
  it('uses user-key OpenAI provider unless another provider is explicitly selected', () => {
    expect(resolveAiChatProviderKind({})).toBe('openai');
    expect(resolveAiChatProviderKind({ AI_PROVIDER: 'openai' })).toBe('openai');
  });

  it('streams OpenAI responses with the user configured API key and model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          streamFromText(
            [
              'event: response.output_text.delta',
              'data: {"type":"response.output_text.delta","delta":"좋아"}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const events: unknown[] = [];

    await createOpenAiChatProvider(
      {},
      { openAiApiKey: 'sk-user-key', openAiModel: 'gpt-5.4-mini' },
    ).streamChat({
      request: {
        requestId: 'request-1',
        phase: 'planner',
        messages: [{ role: 'user', content: '제목 넣어줘' }],
      },
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-user-key',
        }),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe('gpt-5.4-mini');
    expect(events).toEqual([
      { type: 'delta', requestId: 'request-1', delta: '좋아' },
      { type: 'done', requestId: 'request-1', content: '좋아' },
    ]);
    vi.unstubAllGlobals();
  });
});
