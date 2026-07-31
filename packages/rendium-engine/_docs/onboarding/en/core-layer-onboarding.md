# Core Layer Onboarding

[한국어](../ko/core-layer-onboarding.md)

- **Status**: Current Implementation Guide
- **Target**: AI, agents, and engineers working on `@rendium/engine`.
- **Related ADRs**: `../history-architecture/009-minimal-layer-model.md`, `../history-architecture/010-visual-layer-provider-composition.md`
- **Current Manifest Version**: `1.0`

## 1. Principles to Know First

Rendium Engine timeline items are no longer categorized by domain-specific types such as `image`, `video`, `text`, `spectrum`, `audio`, `scope:start`, or `scope:end`.

There are only three top-level classifications in the public layer model:

```ts
type LayerKind = 'visual' | 'audio' | 'control';
```

- `visual`: Produces drawable outputs rendering on the screen.
- `audio`: Produces audio signals.
- `control`: Does not render pixels or play sounds directly; instead, it coordinates scope, markers, automations, relationships, and evaluation states.

Media formats and product features are not top-level layer kinds. When introducing a new feature, check if it can be represented by combining existing properties: `kind`, `source.provider`, `source.track`, `control.role`, `roles`, and `links`.

### Prohibited Actions:
- Do not re-introduce `LayerType` or `LAYER_TYPES`.
- Do not re-introduce `ILayerManifest.type` or `ILayerManifest.props`.
- Do not add auto-conversion for legacy `version: '2.0'` manifests.
- Do not treat the source URL as the layer identity.
- Do not interpret `links` as tree ownership or render order.

---

## 2. Canonical Manifest Shape

The engine's single source of truth (SSOT) is `IProjectManifest`.

```ts
interface IProjectManifest {
  version: '1.0';
  projectInfo: IProjectInfo;
  projectSettings: IProjectSettings;
  layers: Record<LayerId, ILayerManifest>;
  layerOrder: LayerId[];
  links: Record<LinkId, LayerLink>;
}

interface ILayerManifest {
  id: LayerId;
  kind: LayerKind;
  name?: string;
  startTime: number;
  duration: number;
  source?: SourceRef;
  transform?: Transform;
  appearance?: Appearance;
  effects?: EffectSpec[];
  control?: ControlSpec;
  roles?: BehaviorRole[];
}
```

- `layers` is the primary attribute store (indexed by ID).
- `layerOrder` is the sole authority for render order and sequence traversal.
- `links` represents the relationship policy graph.

`normalizeProjectManifest()` only accepts direct model inputs. Any legacy `type` or `props` input will raise a validation error.

---

## 3. SourceRef

A `source` refers to input material resources and is not equivalent to the layer identity.

```ts
interface SourceRef {
  sourceId: SourceId;
  track?: 'visual' | 'audio' | 'metadata';
  clipOffset?: number;
  playbackRate?: number;
  provider?: SourceProviderKind;
}
```

The same `sourceId` can be shared across multiple layers. For example, a single video file source can be split into separate visual and audio layers.

```ts
const videoVisual: ILayerManifest = {
  id: 'video-visual-1',
  kind: 'visual',
  startTime: 0,
  duration: 10,
  source: {
    sourceId: 'source-clip-1',
    provider: 'video',
    track: 'visual',
  },
};

const videoAudio: ILayerManifest = {
  id: 'video-audio-1',
  kind: 'audio',
  startTime: 0,
  duration: 10,
  source: {
    sourceId: 'source-clip-1',
    provider: 'video',
    track: 'audio',
  },
};
```

Product-level asset URL policies are outside the engine manifest contract. The engine treats `sourceId` as an opaque reference.

---

## 4. Visual Layers

Visual layers are `kind: 'visual'` and select a drawable provider via `source.provider`.

Current `RuntimeLayerFactory` mapping:

| provider | track | runtime |
| --- | --- | --- |
| `raster` | `visual` or omitted | `VisualLayer + RasterDrawableProvider` |
| `animated-raster` | `visual` or omitted | `VisualLayer + RasterDrawableProvider` |
| `svg` | `visual` or omitted | `VisualLayer + RasterDrawableProvider` |
| `video` | `visual` or omitted | `VisualLayer + VideoDrawableProvider` |
| `text` | `visual` or omitted | `VisualLayer + TextDrawableProvider` |
| `generated-visual` | `visual` or omitted | `VisualLayer + SpectrumDrawableProvider` |

Unsupported providers do not fall back to placeholders; they throw an error immediately. This is the direct migration policy before release.

Manifest fields that a visual layer can have:

- `source`: Describes the input, provider, and track.
- `transform`: Spatial component.
- `appearance`: Visibility/opacity component.
- `effects`: Specs for the subsequent effect pipeline.
- `roles`: Layer-local behavior roles.

At runtime, the visual output is not assumed to be a simple texture. `VisualLayer` holds only common layer responsibilities (transform, appearance, lifecycle, etc.), whereas texture, geometry, procedural, and offscreen drawable representations are managed by the `DrawableProvider`. When adding a new visual element, do not create a domain-specific layer subclass; add only a provider.

---

## 5. Audio Layers

Audio layers are `kind: 'audio'`.

Current `RuntimeLayerFactory` mapping:

| provider | track | runtime |
| --- | --- | --- |
| `audio-file` | `audio` or omitted | `AudioLayer` |
| `generated-audio` | `audio` or omitted | `AudioLayer` |
| `stream` | `audio` or omitted | `AudioLayer` |
| `video` | `audio` | `AudioLayer` |

Product controls like audio mute/volume are not top-level layer kinds. If a new control surface is needed, check first if it can be represented by intents and control/link policies.

Video visual/audio sync does not mean audio is a sub-object of visual. They are represented by separate layers and link roles.

```ts
const syncLink: LayerLink = {
  id: 'clip-sync-1',
  from: 'video-visual-1',
  to: 'video-audio-1',
  roles: ['syncMove', 'syncTrim', 'deleteTogether', 'selectTogether', 'requiresAcyclic'],
};
```

---

## 6. Control Layers

Control layers are `kind: 'control'` and derive meaning from `control.role`.

```ts
interface ControlSpec {
  role:
    | 'scopeStart'
    | 'scopeEnd'
    | 'marker'
    | 'adjustment'
    | 'mask'
    | 'camera'
    | 'automation'
    | 'transition';
  targetScopeId?: LayerId;
  params?: ControlParams;
}
```

Control roles implemented in the current runtime:

| role | runtime | meaning |
| --- | --- | --- |
| `scopeStart` | `ScopeStartLayer` | stack push marker |
| `scopeEnd` | `ScopeEndLayer` | stack pop marker |

Unsupported control roles throw an error immediately.

Scope is not a parent-child tree. A scope is a marker pair inside the `layerOrder`, interpreted via a stack as `Scene.update()` and `Scene.draw()` traverse the flat array.

Project scaffold and track scaffold are also control layers. Scaffold metadata is placed in `control.params`.

```ts
const trackStart: ILayerManifest = {
  id: 'track-main-start',
  kind: 'control',
  name: 'Main Media',
  startTime: 0,
  duration: 0,
  control: {
    role: 'scopeStart',
    params: {
      ruleType: 'freeform',
      scopeRole: 'main',
      isSystem: true,
    },
  },
};
```

---

## 7. Links And Behavior Roles

`links` represents relationship metadata between layers.

```ts
interface LayerLink {
  id: LinkId;
  from: LayerId;
  to: LayerId;
  roles: BehaviorRole[];
}
```

Core rules:

- `from` and `to` must reference existing layer IDs.
- `links` do not change the render order.
- `links` do not create nested ownership.
- `deleteTogether` can extend the delete operation to the linked set.
- `syncMove` and `syncTrim` affect only edit operations.
- `dependsOn` is used for validation and dependency policies.

Dangling links are not silently repaired. `normalizeProjectManifest()` surfaces missing endpoints as validation errors.

---

## 8. Runtime Construction

The single entry point for runtime construction is `RuntimeLayerFactory.create(manifest)`.

The factory selects the runtime class based only on:

- `manifest.kind`
- `manifest.source?.provider`
- `manifest.source?.track`
- `manifest.control?.role`

Steps to add a new runtime path:

1. Verify if `SourceProviderKind` or `ControlSpec.role` can already represent the concept.
2. Add the new provider/role to the enum-like union only when it cannot be represented.
3. Add a fail-fast branch to `RuntimeLayerFactory`.
4. Determine how `SceneReconciler` will apply the corresponding canonical patch path.
5. Add `normalizeProjectManifest()` validation and focused tests.

---

## 9. Patch And Reconciliation

Canonical patch roots:

- `/layers/{id}/startTime`
- `/layers/{id}/duration`
- `/layers/{id}/name`
- `/layers/{id}/transform/...`
- `/layers/{id}/appearance/...`
- `/layers/{id}/source/...`
- `/layers/{id}/control/...`
- `/layers/{id}/effects`
- `/layers/{id}/roles`
- `/layerOrder`
- `/links`
- `/projectInfo`
- `/projectSettings`

`SceneReconciler` does not interpret `/links` patches as render order updates. Relationship policies are evaluated in the manifest/store area.

---

## 10. Where To Edit

Core contracts:

- `src/_contracts/layer.contracts.ts`
- `src/_contracts/engine.contracts.ts`
- `src/_contracts/intents.contracts.ts`

Manifest/store:

- `src/store/ProjectManifestMigration.ts`
- `src/store/ProjectFactory.ts`
- `src/store/ManifestMutators.ts`
- `src/store/IntentRouter.ts`
- `src/store/SequenceBoundsService.ts`
- `src/store/strategies/ScopeConstraintStrategies.ts`

Runtime:

- `src/layers/factories.ts`
- `src/layers/visual/VisualLayer.ts`
- `src/layers/visual/VisualDrawableProvider.ts`
- `src/layers/visual/providers/*DrawableProvider.ts`
- `src/core/Scene.ts`
- `src/timeline/SceneReconciler.ts`
- `src/timeline/SceneInitializer.ts`
- `src/timeline/Validator.ts`

Tests:

- `src/__tests__/verification.test.ts`
- `src/__tests__/ProjectFactory.test.ts`
- `src/__tests__/SceneReconciler.test.ts`
- `src/__tests__/contentDuration.test.ts`
- `src/__tests__/rasterDrawableProvider.test.ts`
- `src/__tests__/textDrawableProvider.test.ts`

---

## 11. AI Checklist Before Changing Layer Code

Before editing layer-related code, verify:

- Does this require a new top-level `LayerKind`? The answer should almost always be no.
- Can it be represented as a new `source.provider`, `control.role`, `effect.kind`, or `BehaviorRole`?
- Does the change preserve flat `layers + layerOrder`?
- Does it keep source identity separate from layer identity?
- Does it avoid legacy manifest compatibility?
- Does `normalizeProjectManifest()` fail fast for unsupported or dangling state?
- Do tests prove manifest shape, runtime factory behavior, scope traversal, and link/order separation?
