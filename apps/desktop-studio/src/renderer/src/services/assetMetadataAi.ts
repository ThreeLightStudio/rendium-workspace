import {
  type AiChatConversationMessage,
  type AiChatEditorContext,
  type AiChatEvent,
  createAiChatId,
} from '../../../shared/aiChat';
import { parseAiAssetMetadataResponse } from '../ai/aiAssetMetadataParser';

export async function requestAssetMetadataSuggestion(params: {
  imageBase64: string;
  displayName: string;
  editorContext?: AiChatEditorContext;
}): Promise<ReturnType<typeof parseAiAssetMetadataResponse>> {
  const aiChatApi = typeof window !== 'undefined' ? window.api?.aiChat : undefined;
  if (!aiChatApi?.start || !aiChatApi.onEvent) {
    return {
      metadata: null,
      reply: '',
      parseError: 'AI metadata bridge is unavailable.',
    };
  }

  const requestId = createAiChatId('asset-metadata');
  const messages: AiChatConversationMessage[] = [
    {
      role: 'user',
      content: `자산 "${params.displayName}"의 메타데이터를 생성해 주세요.`,
      images: [params.imageBase64],
    },
  ];

  let accumulatedContent = '';

  return new Promise<ReturnType<typeof parseAiAssetMetadataResponse>>((resolve) => {
    const unsubscribe = aiChatApi.onEvent((event: AiChatEvent) => {
      if (event.requestId !== requestId) {
        return;
      }

      if (event.type === 'delta') {
        accumulatedContent += event.delta;
        return;
      }

      unsubscribe();

      if (event.type === 'error') {
        resolve({
          metadata: null,
          reply: '',
          parseError: event.error,
        });
        return;
      }

      const parsed = parseAiAssetMetadataResponse(
        accumulatedContent.length > 0 ? accumulatedContent : event.content,
      );
      resolve(parsed);
    });

    void aiChatApi
      .start({
        requestId,
        messages,
        editorContext: params.editorContext,
        phase: 'asset-metadata',
      })
      .then((started) => {
        if (!started.success) {
          unsubscribe();
          resolve({
            metadata: null,
            reply: '',
            parseError: started.error ?? 'AI metadata request failed.',
          });
        }
      })
      .catch((error: unknown) => {
        unsubscribe();
        resolve({
          metadata: null,
          reply: '',
          parseError: error instanceof Error ? error.message : 'AI metadata request failed.',
        });
      });
  });
}
