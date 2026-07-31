# @rendium/engine 사용 가이드

[English](./USAGE.md) | 한국어

`@rendium/engine`은 `IProjectManifest`를 단일 진실 공급원으로 삼고, UI와 자동화 계층에는 `EngineStore`의 intent 기반 API를 제공합니다.

## 공개 API (Public API)

```typescript
import {
  AudioManager,
  EngineSelectors,
  INTENT_TYPES,
  engineStore,
  type EngineIntent,
  type ILayerManifest,
  type IProjectManifest,
} from '@rendium/engine';
```

주요 진입점은 다음과 같습니다.

- `engineStore.dispatchIntent(intent)`: 사용자 편집을 표현하는 권장 mutation API입니다.
- `engineStore.dispatchTransient(intent)`: 드래그/슬라이더 프리뷰처럼 manifest와 history에 남기지 않는 임시 업데이트입니다.
- `engineStore.executeAtomicIntentBatch(intents)`: 여러 intent를 하나의 undo step으로 묶어 실행합니다.
- `engineStore.getSnapshot()` / `engineStore.subscribe(listener)`: UI 구독용 query API입니다.
- `engineStore.toManifest()` / `engineStore.loadManifest(manifest)`: 저장/복원용 manifest API입니다.
- `engineStore.onError(listener)`: `RendiumError` 계열 엔진 오류를 UI bridge에서 구독합니다.

엔진의 공개 mutation API는 `dispatchIntent`와 `executeAtomicIntentBatch`입니다. 신규 UI 기능과 자동화 기능은 이 두 경로를 사용하세요.
`dispatchIntent`는 단건 intent를 처리하고, `executeAtomicIntentBatch`는 여러 intent를 한 번의 원자 작업과 하나의 undo step으로 묶기 위해 분리되어 있습니다.

## 엔진 초기화

오디오 컨텍스트는 사용자 제스처 이후 초기화해야 합니다. 렌더링 훅처럼 runtime scene이 필요한 경계에서는 `_internalScene`을 사용할 수 있지만, 일반 애플리케이션 로직에서 직접 조작하지 않습니다.

```typescript
import { AudioManager, engineStore } from '@rendium/engine';

await AudioManager.init();

const scene = engineStore._internalScene;
await scene.setup(device, format);
```

## 레이어 조작

레이어 추가/삭제/정렬/속성 변경은 `EngineIntent`로 표현합니다. `ADD_LAYER`는 완성된 `ILayerManifest`와 삽입 대상 scope id를 요구합니다.

```typescript
const textLayer: ILayerManifest = {
  id: crypto.randomUUID(),
  kind: 'visual',
  name: 'Title',
  startTime: 0,
  duration: 3,
  source: {
    sourceId: 'text:title',
    provider: 'text',
    params: { text: 'Hello Rendium' },
  },
};

engineStore.dispatchIntent({
  type: 'ADD_LAYER',
  manifest: textLayer,
  targetScopeId: selectedTextScopeId,
});

engineStore.dispatchIntent({
  type: 'UPDATE_TRANSFORM',
  layerId: textLayer.id,
  position: { x: 120, y: 80 },
});

engineStore.dispatchIntent({
  type: 'TOGGLE_VISIBILITY',
  layerId: textLayer.id,
  visible: false,
});

engineStore.dispatchIntent({
  type: 'REMOVE_LAYER',
  layerId: textLayer.id,
});
```

Scope marker나 system scaffold layer는 일반 콘텐츠처럼 이동/삭제할 수 없습니다. scope 내부 삽입과 이동 가능 여부는 `IntentRouter`가 scope rule과 parent sequence를 기준으로 검증합니다.

## 프리뷰와 커밋

고빈도 UI 입력은 `dispatchTransient`로 runtime layer만 갱신하고, 조작이 끝났을 때 대응하는 persisted intent를 보냅니다.

```typescript
engineStore.dispatchTransient({
  type: 'TRANSIENT_LAYER_UPDATE',
  layerId,
  partial: { startTime: previewStartTime },
});

engineStore.dispatchIntent({
  type: 'CHANGE_START_TIME',
  layerId,
  startTime: committedStartTime,
});
```

## 저장, 로드, 새 프로젝트

저장은 manifest를 그대로 직렬화하고, 로드는 정규화 경로를 거칩니다.

```typescript
const manifest = engineStore.toManifest();
localStorage.setItem('rendium-project', JSON.stringify(manifest));

const saved = JSON.parse(localStorage.getItem('rendium-project') ?? '{}') as IProjectManifest;
engineStore.loadManifest(saved);

const blank = engineStore.createBlankProject('Untitled', 1920, 1080);
```

## 상태 구독

React에서는 `useSyncExternalStore` 또는 `apps/desktop-studio`의 `useEngineStore` hook을 통해 snapshot을 구독합니다.

```typescript
const snapshot = useSyncExternalStore(
  engineStore.subscribe,
  engineStore.getSnapshot,
);
```

Snapshot은 UI 표시용 projection입니다. 저장과 diff 처리는 `getManifest()` 또는 `toManifest()`의 manifest를 기준으로 하세요.

## 원자적 실행과 오류 처리

복합 작업은 `executeAtomicIntentBatch`를 사용하면 하나의 history record로 저장됩니다. 중간 intent가 실패하면 열려 있던 transaction은 rollback되고 `TransactionError`가 전파됩니다.

```typescript
engineStore.executeAtomicIntentBatch([
  { type: 'ADD_LAYER', manifest: videoLayer, targetScopeId: mainScopeId },
  { type: 'ADD_LAYER', manifest: captionLayer, targetScopeId: textScopeId },
]);

const unsubscribe = engineStore.onError((error) => {
  showToast(error.message);
});
```

## 마이그레이션 메모

| 기존 문서/코드 표현 | 현재 권장 방식 |
| :--- | :--- |
| 레거시 직접 recipe mutation | `engineStore.dispatchIntent({ type: 'ADD_LAYER', manifest, targetScopeId })` |
| `LAYER_TYPES.*` | `ILayerManifest.kind`, `source.provider`, `control.role` 조합 |
| `getSceneConfig()` | `toManifest()` 또는 `getManifest()` |
| `loadSceneConfig(config)` | `loadManifest(manifest)` |
| UI에서 `ManifestMutators` 직접 import | `EngineIntent`를 생성해 `dispatchIntent` 호출 |
