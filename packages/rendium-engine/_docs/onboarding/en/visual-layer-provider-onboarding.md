# Visual Layer Provider Onboarding

[한국어](../ko/visual-layer-provider-onboarding.md)

- **Status**: Current Implementation Guide
- **Audience**: AI / agent / engineer modifying the visual runtime, drawable provider, or WebGPU render path
- **Related Code**: `src/layers/visual`

## 1. Runtime Shape

The Visual runtime is fixed as a single concrete layer class.

```ts
class VisualLayer extends RenderableLayer {
  readonly visualProvider: VisualDrawableProvider;
}
```

Responsibilities owned by `VisualLayer`:

- `kind: 'visual'`
- transform / appearance
- setup state
- timeline lifecycle
- local matrix delegation
- merging common layer configs in `updateConfig()` / `getConfig()`

Responsibilities owned by `VisualDrawableProvider`:

- source/provider-specific resource lifecycle
- GPU pipeline, texture, sampler, and buffer preparation
- intrinsic size
- provider-specific transform descriptor or local matrix
- provider-specific config fields
- draw command recording

## 2. Current Provider Mapping

`RuntimeLayerFactory.create(manifest)` always instantiates a visual manifest as a `VisualLayer`.

| manifest condition | provider |
| --- | --- |
| `source.provider: 'raster'` | `RasterDrawableProvider` |
| `source.provider: 'animated-raster'` | `RasterDrawableProvider` |
| `source.provider: 'svg'` | `RasterDrawableProvider` |
| `source.provider: 'video'`, `track: 'visual'` or omitted | `VideoDrawableProvider` |
| `source.provider: 'text'` | `TextDrawableProvider` |
| `source.provider: 'generated-visual'` | `SpectrumDrawableProvider` |

Unsupported providers fail-fast without a placeholder fallback.

## 3. Adding A Visual Feature

Steps for adding a new visual element:

1. Check if it can be represented using an existing `SourceProviderKind`.
2. Add a new provider literal only when necessary.
3. Add the `VisualDrawableProvider` implementation under `src/layers/visual/providers`.
4. Add the provider branch to `RuntimeLayerFactory`.
5. Add provider-level unit tests and factory verification tests.

Prohibited:

- Re-introducing domain-specific visual layer classes
- Determining timeline order, link graph, or scope ownership inside the provider
- Treating the source URL as the layer identity
- Importing app/UI dependencies

## 4. Provider Interface

```ts
interface VisualDrawableProvider {
  readonly providerKind: string;
  initialize?(host: VisualLayer): void;
  setup(host: VisualLayer, device: GPUDevice, format: GPUTextureFormat): Promise<void>;
  update(
    host: VisualLayer,
    time: number,
    deltaTime: number,
    getAudioData?: (id: string) => Float32Array,
  ): void;
  draw(host: VisualLayer, context: RenderContext): void;
  updateConfig(host: VisualLayer, config: LayerConfig): void;
  getConfig?(host: VisualLayer): Partial<LayerConfig>;
  getIntrinsicSize?(host: VisualLayer): { width: number; height: number };
  getTransformDescriptor?(host: VisualLayer): BoxGeometryDescriptor;
  getLocalMatrix?(host: VisualLayer): Float32Array;
  dispose(): void;
}
```

Use `initialize()` only for default visual states that belong to a provider family, such as default raster opacity or scale.

## 5. Test Expectations

Minimum tests for provider changes:

- provider config hydration and serialization
- intrinsic size behavior
- custom transform descriptor or local matrix behavior
- `RuntimeLayerFactory` provider selection
- unsupported provider fail-fast behavior

Relevant current tests:

- `src/__tests__/rasterDrawableProvider.test.ts`
- `src/__tests__/rasterLayout.test.ts`
- `src/__tests__/textDrawableProvider.test.ts`
- `src/__tests__/verification.test.ts`
