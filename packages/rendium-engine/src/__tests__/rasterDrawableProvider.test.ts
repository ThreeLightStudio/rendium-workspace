import { describe, expect, it, vi } from 'vitest';
import { VisualLayer } from '../layers/visual/VisualLayer';
import {
  IMAGE_PLACEHOLDER_TEXTURE_SIZE,
  RasterDrawableProvider,
  createImagePlaceholderTextureData,
} from '../layers/visual/providers/RasterDrawableProvider';

describe('RasterDrawableProvider persistence', () => {
  it('includes sourceUrl in serialized config', () => {
    const layer = new VisualLayer('image-layer', new RasterDrawableProvider());
    layer.updateConfig({
      sourceUrl: '/mock/path/Pictures/example.png',
      sourceWidth: 1280,
      sourceHeight: 720,
      imageSource: {} as ImageBitmap,
    });

    expect(layer.getConfig().sourceUrl).toBe('/mock/path/Pictures/example.png');
    expect(layer.getConfig().sourceWidth).toBe(1280);
    expect(layer.getConfig().sourceHeight).toBe(720);
  });

  it('stores sourceUrl when updated through config', () => {
    const layer = new VisualLayer('image-layer', new RasterDrawableProvider());

    layer.updateConfig({
      sourceUrl: '/mock/path/Pictures/example.png',
      imageSource: {} as ImageBitmap,
    });

    expect(layer.getConfig().sourceUrl).toBe('/mock/path/Pictures/example.png');
  });

  it('keeps an existing runtime image when only sourceUrl is persisted afterward', async () => {
    const provider = new RasterDrawableProvider();
    const layer = new VisualLayer('image-layer', provider);
    const imageSource = {} as ImageBitmap;
    const loadImageFromSourceUrl = vi.fn(async () => undefined);

    (
      provider as unknown as {
        _loadImageFromSourceUrl: typeof loadImageFromSourceUrl;
      }
    )._loadImageFromSourceUrl = loadImageFromSourceUrl;

    layer.updateConfig({
      sourceUrl: '/mock/path/Pictures/example.png',
      imageSource,
    });
    layer.updateConfig({
      sourceUrl: '/mock/path/Pictures/example.png',
    });
    await Promise.resolve();

    expect(layer.getConfig().imageSource).toBe(imageSource);
    expect(layer.getConfig().sourceUrl).toBe('/mock/path/Pictures/example.png');
    expect(loadImageFromSourceUrl).not.toHaveBeenCalled();
  });

  it('reloads a new sourceUrl even when the current runtime image is mock-only', async () => {
    const provider = new RasterDrawableProvider();
    const layer = new VisualLayer('image-layer', provider);
    const loadImageFromSourceUrl = vi.fn(async () => undefined);
    const updateBindGroup = vi.fn();

    (
      provider as unknown as {
        imageSource: unknown;
        sourceUrl: string | null;
        _loadImageFromSourceUrl: typeof loadImageFromSourceUrl;
        _updateBindGroup: typeof updateBindGroup;
      }
    ).imageSource = {};
    (
      provider as unknown as {
        _loadImageFromSourceUrl: typeof loadImageFromSourceUrl;
        _updateBindGroup: typeof updateBindGroup;
      }
    )._loadImageFromSourceUrl = loadImageFromSourceUrl;
    (
      provider as unknown as {
        _loadImageFromSourceUrl: typeof loadImageFromSourceUrl;
        _updateBindGroup: typeof updateBindGroup;
      }
    )._updateBindGroup = updateBindGroup;

    layer.updateConfig({
      sourceUrl: '/mock/path/Pictures/new.png',
    });

    expect(loadImageFromSourceUrl).toHaveBeenCalledWith('/mock/path/Pictures/new.png');
    expect(updateBindGroup).toHaveBeenCalled();
  });

  it('uses persisted source dimensions before the image is decoded', () => {
    const layer = new VisualLayer('image-layer', new RasterDrawableProvider());

    layer.updateConfig({
      sourceWidth: 1280,
      sourceHeight: 720,
    });

    expect(layer.width).toBe(1280);
    expect(layer.height).toBe(720);
  });

  it('prefers decoded image dimensions over persisted source dimensions', () => {
    const provider = new RasterDrawableProvider();
    const layer = new VisualLayer('image-layer', provider);

    layer.updateConfig({
      sourceWidth: 1280,
      sourceHeight: 720,
    });
    const mutableProvider = provider as unknown as {
      _sourceWidth: number;
      _sourceHeight: number;
    };
    mutableProvider._sourceWidth = 640;
    mutableProvider._sourceHeight = 360;

    expect(layer.width).toBe(640);
    expect(layer.height).toBe(360);
  });
});

describe('RasterDrawableProvider placeholder', () => {
  it('creates a visible non-empty placeholder texture pattern', () => {
    const data = createImagePlaceholderTextureData();

    expect(data).toHaveLength(IMAGE_PLACEHOLDER_TEXTURE_SIZE * IMAGE_PLACEHOLDER_TEXTURE_SIZE * 4);
    expect(new Set(data.filter((_, index) => index % 4 !== 3)).size).toBeGreaterThan(3);

    for (let index = 3; index < data.length; index += 4) {
      expect(data[index]).toBe(255);
    }
  });

  it('keeps placeholder dimensions after clearing the image source', () => {
    const layer = new VisualLayer('image-layer', new RasterDrawableProvider());

    layer.updateConfig({ sourceUrl: null });

    expect(layer.getConfig().imageSource).toBeNull();
    expect(layer.width).toBeGreaterThan(0);
    expect(layer.height).toBeGreaterThan(0);
  });
});
