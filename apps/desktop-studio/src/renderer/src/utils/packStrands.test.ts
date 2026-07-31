import type { ILayer } from '@rendium/engine';
import { describe, expect, it } from 'vitest';
import { packStrands } from './packStrands';

function createLayer(id: string, startTime: number, duration: number): ILayer {
  return {
    id,
    name: id,
    kind: 'visual',
    startTime,
    duration,
    update: () => undefined,
    dispose: () => undefined,
    updateConfig: () => undefined,
    getConfig: () => ({
      id,
      kind: 'visual',
      startTime,
      duration,
    }),
  };
}

describe('packStrands', () => {
  it('returns packed view models without mutating source layers', () => {
    const first = createLayer('first', 0, 5);
    const second = createLayer('second', 2, 5);

    const packed = packStrands([first, second]);

    expect(packed.map((layer) => layer.trackIndex)).toEqual([0, 1]);
    expect(packed[0]?.sourceLayer).toBe(first);
    expect(packed[0]).not.toBe(first);
    expect('trackIndex' in first).toBe(false);
    expect('parentSequenceId' in first).toBe(false);
  });
});
