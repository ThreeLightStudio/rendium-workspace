import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAudioDurationFromUrl } from './audio';

type Listener = () => void;

class MockAudioElement {
  public static nextDuration = 0;
  public preload = '';
  public src = '';
  public duration = MockAudioElement.nextDuration;

  protected listeners = new Map<string, Set<Listener>>();

  public addEventListener(type: string, listener: Listener): void {
    const bucket = this.listeners.get(type) ?? new Set<Listener>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  public removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public load(): void {
    queueMicrotask(() => {
      const listeners = this.listeners.get('loadedmetadata');
      if (!listeners) return;
      for (const listener of listeners) {
        listener();
      }
    });
  }
}

afterEach(() => {
  MockAudioElement.nextDuration = 0;
  vi.unstubAllGlobals();
});

describe('readAudioDurationFromUrl', () => {
  it('returns metadata duration when audio loads successfully', async () => {
    MockAudioElement.nextDuration = 12.5;

    vi.stubGlobal('Audio', MockAudioElement as unknown as typeof Audio);

    const duration = await readAudioDurationFromUrl('blob:test');

    expect(duration).toBe(12.5);
  });

  it('returns null when metadata cannot be resolved', async () => {
    class FailingAudioElement extends MockAudioElement {
      public override load(): void {
        queueMicrotask(() => {
          this.duration = Number.NaN;
          const listeners = this.listeners.get('loadedmetadata');
          if (!listeners) return;
          for (const listener of listeners) {
            listener();
          }
        });
      }
    }

    vi.stubGlobal('Audio', FailingAudioElement as unknown as typeof Audio);

    const duration = await readAudioDurationFromUrl('blob:test');

    expect(duration).toBeNull();
  });
});
