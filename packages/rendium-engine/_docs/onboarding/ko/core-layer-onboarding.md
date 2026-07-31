# Core Layer 온보딩

[English](../en/core-layer-onboarding.md)

- **상태**: 현재 구현 가이드 (Current Implementation Guide)
- **대상**: `@rendium/engine` 작업을 시작하는 AI / 에이전트 / 엔지니어
- **관련 결정 기록**: [ADR 009](../../history-architecture/ko/009-minimal-layer-model.md), [ADR 010](../../history-architecture/ko/010-visual-layer-provider-composition.md)
- **현재 Manifest Version**: `1.0`

## 1. 먼저 알아야 할 원칙

Rendium Engine의 timeline item은 더 이상 `image`, `video`, `text`, `spectrum`, `audio`, `scope:start`, `scope:end` 같은 도메인 타입으로 분류하지 않는다.

현재 public layer model의 최상위 분류는 세 가지뿐이다.

```ts
type LayerKind = 'visual' | 'audio' | 'control';
```

- `visual`: 화면에 그릴 drawable output을 만든다.
- `audio`: 오디오 신호를 만든다.
- `control`: 직접 픽셀이나 소리를 만들지 않고 scope, marker, automation, relationship, evaluation state를 제어한다.

미디어 포맷과 제품 기능은 최상위 레이어 종류가 아니다. 새 기능을 추가할 때 먼저 `kind`, `source.provider`, `source.track`, `control.role`, `roles`, `links`의 조합으로 표현할 수 있는지 확인한다.

금지된 복원:

- `LayerType` / `LAYER_TYPES` 재도입
- `ILayerManifest.type` 재도입
- `ILayerManifest.props` 호환 필드 재도입
- legacy `version: '2.0'` manifest 자동 변환
- source URL을 layer identity처럼 취급하는 로직
- `links`를 tree ownership이나 render order로 해석하는 로직

## 2. Canonical Manifest Shape

엔진의 단일 진실 공급원은 `IProjectManifest`다.

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

`layers`는 id-keyed attribute store다. `layerOrder`는 render order와 sequence traversal의 유일한 기준이다. `links`는 relationship policy graph다.

`normalizeProjectManifest()`는 direct model만 받는다. legacy `type`, `props`, `version: '2.0'` 입력은 변환하지 않고 에러로 표면화한다.

## 3. SourceRef

`source`는 layer identity가 아니라 입력 재료 참조다.

```ts
interface SourceRef {
  sourceId: SourceId;
  track?: 'visual' | 'audio' | 'metadata';
  clipOffset?: number;
  playbackRate?: number;
  provider?: SourceProviderKind;
}
```

동일 `sourceId`는 여러 layer에서 공유될 수 있다. 예를 들어 하나의 video source는 별도의 visual layer와 audio layer를 만든다.

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

Product-level asset URL 정책은 엔진 manifest 계약 밖에 있다. 엔진은 `sourceId`를 opaque reference로 다룬다.

## 4. Visual Layers

Visual layer는 `kind: 'visual'`이며 `source.provider`로 drawable provider를 선택한다.

현재 `RuntimeLayerFactory` 매핑:

| provider | track | runtime |
| --- | --- | --- |
| `raster` | `visual` or omitted | `VisualLayer + RasterDrawableProvider` |
| `animated-raster` | `visual` or omitted | `VisualLayer + RasterDrawableProvider` |
| `svg` | `visual` or omitted | `VisualLayer + RasterDrawableProvider` |
| `video` | `visual` or omitted | `VisualLayer + VideoDrawableProvider` |
| `text` | `visual` or omitted | `VisualLayer + TextDrawableProvider` |
| `generated-visual` | `visual` or omitted | `VisualLayer + SpectrumDrawableProvider` |

지원하지 않는 provider는 placeholder로 대체하지 않고 즉시 에러를 던진다. 이것은 출시 전 direct migration 정책이다.

Visual layer가 가질 수 있는 manifest fields:

- `source`: 어떤 입력/provider/track인지 설명한다.
- `transform`: spatial component.
- `appearance`: visibility/opacity component.
- `effects`: 후속 effect pipeline용 specs.
- `roles`: layer-local behavior role.

Runtime에서 visual output은 단순 texture로 가정하지 않는다. `VisualLayer`는 transform, appearance, lifecycle 같은 공통 레이어 책임만 갖고, texture, geometry, procedural, offscreen drawable representation은 `DrawableProvider`가 담당한다. 새 visual 요소를 추가할 때 도메인 전용 layer subclass를 만들지 않고 provider만 추가한다.

## 5. Audio Layers

Audio layer는 `kind: 'audio'`다.

현재 `RuntimeLayerFactory` 매핑:

| provider | track | runtime |
| --- | --- | --- |
| `audio-file` | `audio` or omitted | `AudioLayer` |
| `generated-audio` | `audio` or omitted | `AudioLayer` |
| `stream` | `audio` or omitted | `AudioLayer` |
| `video` | `audio` | `AudioLayer` |

Audio mute/volume 같은 product controls는 top-level layer kind가 아니다. 새 control surface가 필요하면 먼저 intent와 control/link policy로 표현할 수 있는지 확인한다.

Video의 visual/audio sync는 audio가 visual의 하위 객체라는 뜻이 아니다. 별도 layer와 link role로 표현한다.

```ts
const syncLink: LayerLink = {
  id: 'clip-sync-1',
  from: 'video-visual-1',
  to: 'video-audio-1',
  roles: ['syncMove', 'syncTrim', 'deleteTogether', 'selectTogether', 'requiresAcyclic'],
};
```

## 6. Control Layers

Control layer는 `kind: 'control'`이며 `control.role`로 의미를 가진다.

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

현재 runtime에서 구현된 control role:

| role | runtime | 의미 |
| --- | --- | --- |
| `scopeStart` | `ScopeStartLayer` | stack push marker |
| `scopeEnd` | `ScopeEndLayer` | stack pop marker |

지원하지 않는 control role은 즉시 에러를 던진다.

Scope는 parent-child tree가 아니다. Scope는 `layerOrder` 안의 marker pair이며, `Scene.update()`와 `Scene.draw()`가 flat array를 순회하면서 stack으로 해석한다.

Project scaffold와 track scaffold도 control layer다. scaffold metadata는 `control.params`에 둔다.

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

## 7. Links And Behavior Roles

`links`는 layer 사이의 relationship metadata다.

```ts
interface LayerLink {
  id: LinkId;
  from: LayerId;
  to: LayerId;
  roles: BehaviorRole[];
}
```

Core rules:

- `from`과 `to`는 existing layer id를 참조해야 한다.
- `links`는 render order를 바꾸지 않는다.
- `links`는 nested ownership을 만들지 않는다.
- `deleteTogether`는 delete operation을 linked set으로 확장할 수 있다.
- `syncMove`와 `syncTrim`은 edit operation에만 영향을 준다.
- `dependsOn`은 validation/dependency policy에 사용된다.

Dangling link는 조용히 복구하지 않는다. `normalizeProjectManifest()`는 missing endpoint를 validation error로 표면화한다.

## 8. Runtime Construction

Runtime construction의 단일 진입점은 `RuntimeLayerFactory.create(manifest)`다.

Factory는 다음만 보고 runtime class를 고른다.

- `manifest.kind`
- `manifest.source?.provider`
- `manifest.source?.track`
- `manifest.control?.role`

새 runtime path를 추가할 때는 다음 순서로 작업한다.

1. `SourceProviderKind` 또는 `ControlSpec.role`이 이미 표현 가능한지 확인한다.
2. 표현 불가능할 때만 enum-like union에 새 provider/role을 추가한다.
3. `RuntimeLayerFactory`에 fail-fast branch를 추가한다.
4. `SceneReconciler`가 해당 canonical patch path를 어떻게 반영할지 정한다.
5. `normalizeProjectManifest()` validation과 focused tests를 추가한다.

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

`SceneReconciler`는 `/links` patch를 render order update로 해석하지 않는다. Relationship policy는 manifest/store 영역에서 평가한다.

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

## 11. 레이어 코드 변경 전 AI 체크리스트 (AI Checklist Before Changing Layer Code)

레이어 관련 코드를 수정하기 전, 다음 항목을 확인하십시오:

- 새로운 최상위 `LayerKind`가 정말로 필요합니까? 이에 대한 답은 거의 항상 **아니오(no)**여야 합니다.
- 새로운 `source.provider`, `control.role`, `effect.kind`, 또는 `BehaviorRole`을 추가하는 것으로 표현할 수 없습니까?
- 변경 사항이 평면형 구조인 `layers + layerOrder` 규칙을 유지합니까?
- 소스 식별자(source identity)와 레이어 식별자(layer identity)를 명확하게 분리하고 있습니까?
- 레거시 매니페스트와의 어설픈 하위 호환성을 피하고 있습니까?
- `normalizeProjectManifest()`가 지원되지 않거나 불완전한 상태에 대해 즉시 실패(fail-fast)하도록 동작합니까?
- 테스트 코드가 매니페스트 스키마, 런타임 팩토리 동작, 스코프 순회, 그리고 링크/순서 분리를 올바르게 검증하고 있습니까?
