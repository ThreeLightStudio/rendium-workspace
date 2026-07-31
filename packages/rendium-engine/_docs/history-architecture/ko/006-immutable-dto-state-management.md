# 002: Immutable DTO-based State Management & Serialization (불변 DTO 기반 상태 관리 및 직렬화)

[English](../en/006-immutable-dto-state-management.md)

- **상태**: 승인 및 구현 완료 (Phase 1 & 2)
- **날짜**: 2026-04-12
- **맥락**: [ADR 007: Global Canvas Attributes Migration](./007-global-canvas-attributes-migration.md)

## 맥락 및 문제 정의

이전 Rendium Engine 아키텍처는 직렬화를 위해 하드웨어 의존적 객체(GPU/오디오 핸들)와 유도된 데이터(행렬 등)가 포함된 "런타임 상태 덤프"에 의존했습니다. 이는 다음과 같은 문제를 야기했습니다:
1. 프로젝트 파일 내 대규모 데이터 중복.
2. 엔진 인스턴스의 직접적인 변형(mutation)으로 인해 견고한 실행 취소/다시 실행(Undo/Redo) 시스템 구현 불가능.
3. UI 레이어(Store)와 런타임 엔진(Scene) 간의 강결합.

## 결정 사항

`IProjectManifest`라고 불리는 불변적이고 정규화된 DTO(Data Transfer Object)를 기반으로 하는 **단일 진실 공급원(SSOT, Single Source of Truth)**으로 이관합니다.

### 1. 정규화된 상태 구조
레이어의 단순 배열 대신, 속성을 위한 Record와 Z-order를 위한 별도 배열을 사용합니다:
- `layers: Record<LayerId, ILayerManifest>`: O(1) 속성 접근 및 안정적인 패치 경로 보장.
- `layerOrder: LayerId[]`: 렌더링 순서의 진실 공급원.
- 이는 1차원 배열에서 하나의 레이어를 삽입할 때 후속 인덱스가 밀리는 "패치 폭발(Patch Explosion)" 현상을 방지합니다.

### 2. Immer를 이용한 불변 변형
- 모든 상태 변경은 `EngineStore.dispatchIntent(intent)` 및 `EngineStore.executeAtomicIntentBatch(intents)`를 거쳐 수행됩니다.
- Immer의 `produceWithPatches`는 자동으로 RFC 6902 JSON 패치를 생성합니다.
- 순방향 패치는 엔진 동기화에 사용되고, 역방향 패치는 실행 취소(Undo) 기능을 위해 `HistoryStack`에 저장됩니다.

### 3. SceneReconciler (직접 접근 조정자)
- Store로부터 엔진의 생명주기를 디커플링합니다.
- Reconciler는 패치를 파싱하고 O(1) 레지스트리를 사용하여 엔진 인스턴스에 직접 변경 사항을 적용합니다.
- 레이어가 제거될 때 리소스의 명시적인 해제(`dispose()`)를 보장합니다.

### 4. Draft-Commit 패턴
- 일시적인 시각적 변경(예: 슬라이더 드래그)은 Store를 거치지 않고 엔진을 직접 업데이트합니다(`applyTransient`).
- 최종 상태는 인텐트 라우팅을 통해 Store에 "커밋"되어 단일 히스토리 기록을 생성합니다.

## 결과 및 영향

- **메모리 효율성**: 패치 크기가 최소화됩니다 (구조적 공유).
- **정확성**: 역방향 패치에 의해 실행 취소/다시 실행이 수학적으로 보장됩니다.
- **이식성**: 프로젝트 파일(Manifest)은 순수 JSON이며 런타임/하드웨어 참조가 전혀 없습니다.
- **확장성**: Reconciler는 씬 크기가 아닌 변경 사항의 크기에 비례하는 O(1) 복잡도로 업데이트를 처리합니다.

## 구현 상세 (Phase 1 & 2)
- `IProjectManifest` 버전 1.0 정의.
- `EngineStore`가 Manifest SSOT를 관리하도록 리팩토링.
- 타입 안전한 속성/순서 격리를 위한 `ManifestMutators` 구현.
- `rd.manifest()` 및 `rd.history()`를 노출하도록 `ConsoleDebugger` 업데이트.
