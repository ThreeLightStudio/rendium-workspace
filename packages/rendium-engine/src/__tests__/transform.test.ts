import { describe, expect, it } from 'vitest';
import {
  buildTransformMatrix,
  createQuadFromBounds,
  decomposeQuadToTransform,
  normalizeTransformFields,
  pointInQuad,
  resizeQuadFromHandle,
  resolveAnchor,
  resolvePivot,
  transformPoint,
  transformQuad,
} from '../_utils/transform';

describe('transform helpers', () => {
  it('resolves local anchor and pivot positions from bounds', () => {
    const descriptor = {
      bounds: { left: 10, top: 20, width: 200, height: 100 },
      anchor: { x: 0.25, y: 0.1 },
      pivot: { x: 0.5, y: 0.5 },
    };

    expect(resolveAnchor(descriptor)).toEqual({ x: 60, y: 30 });
    expect(resolvePivot(descriptor)).toEqual({ x: 110, y: 70 });
  });

  it('keeps the visual center stable while rotating around it', () => {
    const bounds = { left: 0, top: 0, width: 80, height: 40 };
    const matrix = buildTransformMatrix(
      {
        position: { x: 120, y: 80 },
        scale: { x: 1.5, y: 0.75 },
        rotation: Math.PI / 2,
      },
      {
        bounds,
        anchor: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      },
    );

    const center = transformPoint({ x: 40, y: 20 }, matrix);
    expect(center.x).toBeCloseTo(180, 6);
    expect(center.y).toBeCloseTo(95, 6);
  });

  it('round-trips transform state for an anchored box', () => {
    const bounds = { left: 0, top: 0, width: 160, height: 48 };
    const transform = {
      position: { x: 320, y: 180 },
      scale: { x: 1.25, y: 0.8 },
      rotation: -0.42,
    };

    const matrix = buildTransformMatrix(transform, {
      bounds,
      anchor: { x: 0.5, y: 0.5 },
      pivot: { x: 0.5, y: 0.5 },
    });
    const quad = transformQuad(createQuadFromBounds(bounds), matrix);
    const next = decomposeQuadToTransform(quad, {
      bounds,
      anchor: { x: 0.5, y: 0.5 },
      pivot: { x: 0.5, y: 0.5 },
    });

    expect(next.position.x).toBeCloseTo(transform.position.x, 5);
    expect(next.position.y).toBeCloseTo(transform.position.y, 5);
    expect(next.scale.x).toBeCloseTo(transform.scale.x, 5);
    expect(next.scale.y).toBeCloseTo(transform.scale.y, 5);
    expect(next.rotation).toBeCloseTo(transform.rotation, 5);
  });

  it('detects points inside and outside a quad', () => {
    const quad = createQuadFromBounds({ left: 0, top: 0, width: 10, height: 10 });

    expect(pointInQuad({ x: 5, y: 5 }, quad)).toBe(true);
    expect(pointInQuad({ x: 15, y: 5 }, quad)).toBe(false);
  });

  it('resizes a quad from the south-east handle while preserving aspect ratio', () => {
    const quad = createQuadFromBounds({ left: 0, top: 0, width: 20, height: 10 });

    const nextQuad = resizeQuadFromHandle({ quad }, 'se', { x: 40, y: 16 });

    expect(nextQuad[0]).toEqual({ x: 0, y: 0 });
    expect(nextQuad[1]).toEqual({ x: 40, y: 0 });
    expect(nextQuad[2]).toEqual({ x: 40, y: 20 });
    expect(nextQuad[3]).toEqual({ x: 0, y: 20 });
  });

  it('normalizes legacy transform inputs', () => {
    expect(
      normalizeTransformFields({
        x: 12,
        y: 34,
        scaleX: 1.5,
        scaleY: 0.75,
        rotation: 0.25,
      }),
    ).toEqual({
      position: { x: 12, y: 34 },
      scale: { x: 1.5, y: 0.75 },
      rotation: 0.25,
    });
  });
});
