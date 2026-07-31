import { describe, expect, it } from 'vitest';
import { type AiChatEditorContext, buildAiChatTranscriptMessages } from './aiChat';

describe('buildAiChatTranscriptMessages', () => {
  it('adds asset attachment context to user messages', () => {
    const messages = buildAiChatTranscriptMessages({
      messages: [
        {
          role: 'user',
          content: '이 이미지를 배경으로 써줘',
          attachments: [
            {
              assetId: 'asset-123',
              assetKind: 'image',
              displayName: 'city.png',
              status: 'ready',
              mimeType: 'image/png',
              sourceUrlAvailable: true,
              description: 'A city skyline',
              tags: ['city', 'background'],
              subject: 'skyline',
              mood: 'bright',
              usageHint: 'title background',
            },
          ],
        },
      ],
    });

    expect(messages[1]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('assetId=asset-123'),
      }),
    );
    expect(messages[1]?.content).toContain('첨부 자산:');
    expect(messages[1]?.content).toContain('tags=city, background');
  });

  it('adds product context packs to planner and executor prompts', () => {
    const editorContext: AiChatEditorContext = {
      canvasWidth: 1920,
      canvasHeight: 1080,
      selectedLayerId: null,
      selectedLayerIds: [],
      selectedLayerType: null,
      selectedLayerName: null,
      selectionCount: 0,
      layerCount: 1,
      visibleLayerCount: 1,
      projectName: 'Demo',
      productContextPacks: [
        {
          purpose: 'image-placement',
          summaryMarkdown: 'Image placement context:\n- Project content ends at 24s.',
          availableCommands: [
            {
              type: 'ADD_IMAGE_ASSET_TO_TIMELINE',
              requiredArgs: ['assetId', 'placement', 'durationSeconds'],
              optionalArgs: ['fit', 'scopeRole'],
            },
          ],
          constraints: ['Do not invent scope ids.', 'Missing assets cannot be placed.'],
          data: {
            projectContentEnd: 24,
            validScopes: [{ id: 'scope-main', role: 'main', preferred: true }],
            readyImageAssetIds: ['asset-123'],
            selectedAssetId: 'asset-123',
          },
        },
      ],
    };

    const plannerMessages = buildAiChatTranscriptMessages({
      messages: [{ role: 'user', content: '끝에 이미지 넣어줘' }],
      editorContext,
      phase: 'planner',
    });
    const executorMessages = buildAiChatTranscriptMessages({
      messages: [{ role: 'user', content: '끝에 이미지 넣어줘' }],
      editorContext,
      phase: 'executor',
    });

    expect(plannerMessages[0]?.content).toContain('Product Context Pack [image-placement]');
    expect(plannerMessages[0]?.content).toContain('validScopes=scope-main:main:preferred');
    expect(executorMessages[0]?.content).toContain('ADD_IMAGE_ASSET_TO_TIMELINE');
    expect(executorMessages[0]?.content).toContain('Do not invent scope ids');
  });
});
