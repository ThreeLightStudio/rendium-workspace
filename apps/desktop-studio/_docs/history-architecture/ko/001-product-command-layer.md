# ADR 001: Product Command Layer (제품 명령 레이어)

[English](../en/001-product-command-layer.md)

- **상태**: 승인됨
- **날짜**: 2026-05-10
- **맥락**: `desktop-studio`는 각 진입점(entry point)에 저수준 엔진 인텐트 조립 과정을 노출하지 않고, UI 영역 및 AI 채팅에서 호출할 수 있는 재사용 가능한 사용자 대면 명령이 필요합니다.

## 맥락

`packages/rendium-engine`은 의도적으로 최소한의 인텐트 레이어만 노출합니다. `ADD_LAYER`, `UPDATE_TRANSFORM`, `REORDER_LAYER`와 같은 엔진 인텐트는 원자적인(atomic) manifest 변이와 런타임에 안전한 편집 작업을 기술합니다.

이것이 엔진에 있어서는 올바른 경계이지만, 대부분의 Studio 사용자 액션에 있어서는 적절한 경계가 아닙니다. 예를 들어 "이 이미지를 동영상 끝에 7초 동안 이어 붙여줘"라는 사용자 요청은 제품 수준(product-level)의 결정들을 수반합니다:

- 현재 콘텐츠가 어디에서 끝나는가
- 어떤 스코프(scope)가 새 레이어를 받아야 하는가
- 에셋 ID가 어떻게 프로젝트 소스 URL로 해석되는가
- 레이어가 배경(background), 오버레이(overlay), 또는 삽입된 미디어 중 무엇으로 동작해야 하는가
- 어떤 기본 재생 시간, 맞춤(fit), 변형(transform) 및 선택 동작이 적용되어야 하는가

이러한 결정들은 `@rendium/engine`이 아닌 `desktop-studio`에 속하며, 모든 UI나 AI 진입점마다 개별적으로 재구현되어서는 안 됩니다.

## 결정 사항

`desktop-studio`는 두 가지 명령 레이어를 구분합니다.

### IntentCommand (인텐트 명령)

IntentCommand는 `@rendium/engine`이 소유하는 공개 엔진 인텐트 규약을 의미합니다.

예시:
- `ADD_LAYER`
- `UPDATE_LAYER_PROPS`
- `UPDATE_TRANSFORM`
- `TOGGLE_VISIBILITY`
- `REORDER_LAYER`
- `REMOVE_LAYER`

IntentCommand는 최소한이며 manifest 지향적이고 엔진이 소유합니다. 결정론적인 엔진 검증 및 원자적 실행에 적합한 형태로 유지되어야 합니다.

### ProductCommand (제품 명령)

ProductCommand는 제품 컨텍스트를 해석하여 하나 이상의 IntentCommand로 변환하는 Studio 소유의 사용자 액션을 의미합니다.

예시:
- 타임라인 끝에 이미지 에셋 추가
- 메인 또는 오버레이 스코프에 에셋 배치
- 오디오 및 이미지 에셋으로부터 뮤직비디오 초안 생성
- 선택된 레이어 미디어 교체
- 배경 이미지로 아웃트로 섹션 확장

ProductCommand는 Studio 스토어, 프로젝트 에셋, 엔진 스냅샷, 제품 기본값 등을 읽을 수 있습니다. 이들의 출력은 궁극적으로 공개 엔진 API를 통해 실행되는 엔진 IntentCommand들입니다.

## 규칙

- UI 컨트롤, 드래그 앤 드롭 플로우, 콘텍스트 메뉴 및 AI 채팅은 사용자 대면 액션을 위해 ProductCommand를 우선적으로 사용해야 합니다.
- ProductCommand가 존재하는 경우, AI는 저수준 엔진 manifest를 직접 조립해서는 안 됩니다.
- 에셋 조회, 타임라인 끝 계산, 스코프 결정, 디스플레이 크기 조절, 기본 맞춤(fit) 및 선택 동작은 ProductCommand의 책임입니다.
- ProductCommand는 공개 엔진 인텐트 API(보통 `engineStore.executeAtomicIntentBatch`)를 통해 엔진 변경을 수행해야 합니다.
- 작업이 읽기 전용이거나 순수 UI 상태인 경우가 아니라면, IntentCommand로 해석되지 않는 특수 명령을 도입하지 마십시오.
- 만약 ProductCommand가 Studio 외부에서도 널리 유용해진다면, Studio 전용 정책을 엔진으로 흘려보내지 말고 기반 기능을 의도적으로 승격(promote)시켜야 합니다.

## 결과 및 영향

- AI와 UI 진입점이 동일한 동작 및 기본값을 공유할 수 있습니다.
- 엔진 규약이 작고 안정적으로 유지됩니다.
- 제품 수준의 UX 정책을 한곳에서 더 쉽게 테스트할 수 있습니다.
- 새로운 AI 기능은 파서 전용 동작을 추가하기 전에 먼저 기존 ProductCommand가 있는지 확인해야 합니다.
- 임시적인 AI 전용 액션은 장기적인 제품 API가 아니라 ProductCommand로의 마이그레이션 대상 후보로 취급되어야 합니다.

## 예시

"이 이미지를 끝부분에 7초 동안 배경으로 추가해줘"의 경우:

```text
ProductCommand: addImageAssetToTimelineEnd
  1. 엔진 스냅샷 또는 시퀀스 유도 계산으로부터 현재 콘텐츠의 끝 시점을 읽습니다.
  2. 대상 Studio 스코프를 결정합니다 (보통 메인, 필요한 경우 오버레이를 폴백으로 사용).
  3. 프로젝트 에셋으로부터 assetId를 sourceUrl 및 이미지 메타데이터로 해석합니다.
  4. 배경 사용을 위한 Studio 디스플레이 기본값을 적용합니다.
  5. 실제 targetScopeId, startTime, duration, source, transform이 포함된 ADD_LAYER 인텐트를 발행합니다.
```

엔진은 여전히 `ADD_LAYER` IntentCommand를 수신합니다. 제품 명령은 사용자 대면의 해석을 소유합니다.
