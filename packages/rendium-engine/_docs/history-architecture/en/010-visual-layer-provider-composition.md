# 011. VisualLayer + DrawableProvider Composition

[한국어](../ko/010-visual-layer-provider-composition.md)

Status: Accepted and implemented

## Context

The goal of the Minimal Layer Model is to fix the engine layer identity into three types: `visual`, `audio`, and `control`. Even though the previous runtime used `kind: 'visual'` in the manifest, it continued to instantiate subclasses for specific domains (image, video, text, spectrum) in the internal implementation.

While this structure functioned as a transitional implementation, in the long term it creates pressure to increase the number of layer subclasses every time a new element is added. This neutralizes the decision to reduce layer types in the runtime, returning the factory, tests, public exports, and the developer's mental model back to being domain-centric.

## Decision

Fix the visual runtime as a single class: `VisualLayer extends RenderableLayer`. Distinguish specific elements (images, videos, text, spectrum) by injecting a `DrawableProvider` implementation.

```ts
class VisualLayer extends RenderableLayer {
  constructor(id: LayerId, provider: VisualDrawableProvider);
}

interface VisualDrawableProvider {
  readonly providerKind: string;
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
  dispose(): void;
}
```

The current provider mapping is as follows:

| source provider | visual runtime |
| --- | --- |
| `raster`, `animated-raster`, `svg` | `VisualLayer + RasterDrawableProvider` |
| `video` with `visual` track | `VisualLayer + VideoDrawableProvider` |
| `text` | `VisualLayer + TextDrawableProvider` |
| `generated-visual` | `VisualLayer + SpectrumDrawableProvider` |

## Rationale

`VisualLayer` owns the common layer responsibilities. This includes ID, timeline lifecycle, transform, appearance, setup state, local matrix, and participating in render ordering.

`DrawableProvider` is responsible for how the source/provider is interpreted and what GPU resources and draw commands are created. Detailed strategies such as texture uploads, video frame copies, text rasterization, and spectrum buffer updates are internal implementation details of the provider.

Therefore, even if a new visual element is added, we do not create a new layer subclass. Any necessary changes are limited to a new provider, provider factory branch, and provider-level tests.

## Consequences

- We do not export domain-specific visual layer classes in the public engine API.
- `RuntimeLayerFactory` returns `VisualLayer` for all visual manifests.
- `audio` and `control` remain as separate runtime layers. These align with the top-level kinds of the minimal layer model.
- The provider does not determine the manifest kind, scope ownership, link policy, or timeline ordering.
- Unsupported providers fail-fast without a placeholder fallback.

## Onboarding Rule

When adding a new visual element, the fundamental question is not "What layer subclass is needed?" but "What drawable representation/provider is needed?". Add a drawable provider instead of creating a domain-specific visual layer class.
