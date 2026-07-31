import { describe, expect, it } from 'vitest';
import { isAudioRuntimeLayer, isRenderableRuntimeLayer } from './runtimeLayerGuards';

describe('runtime layer guards', () => {
  it('recognizes audio runtime layers by behavior-bearing fields', () => {
    expect(
      isAudioRuntimeLayer({
        sourceUrl: null,
        volume: 1,
        muted: false,
        clipOffset: 0,
        audioBuffer: null,
        getFrequencyData: () => null,
      }),
    ).toBe(true);
  });

  it('rejects partial audio-like objects', () => {
    expect(
      isAudioRuntimeLayer({
        sourceUrl: null,
        volume: 1,
        muted: false,
      }),
    ).toBe(false);
  });

  it('recognizes renderable runtime layers by setup and draw methods', () => {
    expect(
      isRenderableRuntimeLayer({
        appearance: {},
        opacity: 0.8,
        visible: true,
        isSetupFor: () => true,
        setup: async () => undefined,
        draw: () => undefined,
      }),
    ).toBe(true);
  });

  it('rejects partial renderable-like objects', () => {
    expect(
      isRenderableRuntimeLayer({
        appearance: {},
        opacity: 0.8,
        visible: true,
      }),
    ).toBe(false);
  });
});
