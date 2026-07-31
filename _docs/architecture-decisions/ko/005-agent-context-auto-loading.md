# ADR-005: Agent Context Auto-Loading 도입

[English](../en/005-agent-context-auto-loading.md)

> **상태**: Accepted  
> **일자**: 2026-05-06  
> **작성자**: Codex  

---

## 컨텍스트 (Context)

`pnpm agent`는 이미 워크스페이스 루트 `.agentrules.yml`과 패키지 `.agentrules.yml`을 병합하여 최종 agent prompt를 렌더링하고 있었다.

하지만 `@rendium/engine` 같은 bounded context는 단순한 policy merge만으로는 충분하지 않았다. 실제로 작업을 시작하기 전에 `README.md`와 onboarding 문서를 먼저 읽어야만, manifest shape, runtime factory, layer/provider 경계 같은 현재형 규칙을 안전하게 따라갈 수 있었기 때문이다.

즉, 현재 문제는 다음과 같았다.

1. 규칙은 자동으로 읽히지만, 작업 전 필수 문서는 자동으로 드러나지 않음
2. 패키지별 onboarding 문서가 존재해도 agent prompt와 분리되어 있어 놓치기 쉬움
3. 엔진처럼 문서 선학습이 중요한 bounded context에서, “정책”과 “읽기 순서”가 서로 다른 채널로 관리되고 있었음

---

## 결정 (Decision)

패키지 `.agentrules.yml`에 `required_reading` 메타데이터를 추가하고, `@rendium/agent-tools`가 이를 최종 prompt에 렌더링하도록 한다.

### 적용 원칙

- `required_reading`는 “작업 전에 읽어야 하는 문서 목록”만 담는다
- 정책 본문은 여전히 `.agentrules.yml`의 기존 섹션에서 관리한다
- onboarding 문서의 본문은 `_docs/onboarding`에 유지하고, 규칙 파일은 그 목록을 선언적으로 참조한다
- 루트 정책은 canonical source로 남기고, 패키지 규칙은 bounded-context override 및 required reading 선언만 담당한다

### `@rendium/engine` 초기 적용 범위

- `README.md`
- `_docs/onboarding/README.md`
- `_docs/onboarding/core-layer-onboarding.md`
- `_docs/onboarding/visual-layer-provider-onboarding.md`

---

## 구현 (Implementation)

### Step 1: 스키마 확장

- `packages/agent-tools`의 규칙 스키마에 `required_reading` 항목을 추가한다
- 각 항목은 `id`, `label`, `path`를 갖는 선언형 레코드로 모델링한다
- 중복 `id`는 기존 principle/convention/SOP와 동일한 방식으로 검증한다

### Step 2: 렌더링 확장

- `PromptRenderer`가 prompt 내에 “Required Reading” 섹션을 추가로 렌더링한다
- 사람이 읽기 쉬운 형태로 `label`과 상대 경로를 함께 보여준다

### Step 3: 패키지 선언

- `packages/rendium-engine/.agentrules.yml`에 required reading 목록을 추가한다
- engine README와 onboarding 문서를 필수 읽기 목록으로 노출한다

### Step 4: 진입점 정리

- 루트 `pnpm agent`는 기존처럼 package target을 기준으로 동작한다
- `packages/rendium-engine`에는 `pnpm agent` 전달 스크립트를 둬서, 패키지 내부에서도 같은 진입점을 사용할 수 있게 한다

---

## 결과 (Consequences)

### 장점

- agent prompt가 policy와 context reading을 한 번에 보여줘서 누락이 줄어든다
- bounded context별 작업 시작 규칙을 선언적으로 관리할 수 있다
- engine처럼 문서 우선순위가 중요한 패키지에서 작업 안전성이 높아진다

### 주의점

- required reading 목록은 계속 갱신해야 한다
- 문서 본문이 길어지면 prompt가 커질 수 있으므로, 목록은 꼭 필요한 항목만 유지해야 한다
- 다른 패키지로 확장할 때는 각각의 onboarding 구조를 먼저 정리해야 한다

---

## 검증 (Verification)

- `pnpm --filter @rendium/agent-tools test`
- `pnpm --filter @rendium/agent-tools build`
- `pnpm --filter @rendium/agent-tools check`
- `pnpm agent -- --package-dir packages/rendium-engine`
- `cd packages/rendium-engine && pnpm agent`

---

## 비목표 (Non-goals)

- onboarding 문서 본문을 `.agentrules.yml` 안으로 복제하지 않는다
- `desktop-studio`의 onboarding 체계를 이번 ADR에서 완성하지 않는다
- engine 외 패키지의 required reading 구조를 이번 단계에서 모두 표준화하지 않는다
