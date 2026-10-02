# ADR-006: Web Agent Renewal 방향

[English](../en/006-web-agent-renewal.md)

> **상태**: Proposed (탐색 승인)
>
> **일자**: 2026-08-08
>
> **작성자**: Codex

---

## 컨텍스트 (Context)

현재 Rendium은 Electron 기반의 GUI 영상 편집기와 `@rendium/engine`을 함께 제공한다. 그러나 GUI 표면의 UX 버그와 디버깅 비용이 커져, 기존 편집기 전체를 계속 완성하는 것보다 에이전트가 직접 사용할 수 있는 웹 기반 영상 도구를 검증하는 편이 효율적인지 재검토하게 되었다.

기존 구조에는 이미 다음과 같은 재사용 가능한 기반이 있다.

- `@rendium/engine`의 manifest, `EngineIntent`, 원자적 실행 및 렌더링 경로
- Studio 소유의 `ProductCommand` 개념
- UI를 노출하지 않고 결정론적으로 편집을 컴파일하는 Headless Workflow 방향
- 명령 추상화에 기반한 에이전트 및 자동화 경계

따라서 이번 Renewal은 새 영상 엔진을 만들거나 Electron 제품을 즉시 대체하는 작업이 아니라, 기존 엔진 위에 AI 중심의 웹 제품 표면을 추가하는 탐색으로 정의한다.

## 관련 결정 (Related Decisions)

- [ADR-001: Product Command Layer](../../../apps/desktop-studio/_docs/history-architecture/ko/001-product-command-layer.md)는 사용자 수준의 제품 정책을 엔진 intent보다 상위에 둔다.
- [ADR-002: Intent-Driven Architecture](./002-intent-driven-architecture.md)는 `EngineIntent`를 엔진과의 상호작용 경계로 정의한다.
- [ADR-003: Headless Workflow Layer](../../../apps/desktop-studio/_docs/history-architecture/ko/003-headless-workflow-layer.md)는 UI 및 AI 워크플로우를 위한 결정론적 컴파일과 원자적 적용을 확립한다.

## 결정 사항 (Decision)

Rendium은 기존 엔진과 Electron 구현을 유지하면서, **Web Agent Studio**를 별도 제품 표면으로 탐색한다. 웹 표면은 브라우저 에이전트가 조작할 수 있는 명령 및 검증 계약을 노출한다.

첫 번째 웹 버전은 일반 사용자를 위한 전문 GUI 편집기를 우선 구현하지 않는다. 대신 다음을 제공하는 AI 중심 작업 콘솔을 우선한다.

- 명령 또는 구조화된 액션 입력
- 프로젝트 및 기능(capability) 조회
- 결정론적인 ProductCommand 실행
- 구조화된 실행 결과, 오류, 변경 내역 및 undo 정보
- 렌더링 미리보기
- export job 진행률과 결과 artifact

브라우저 에이전트는 DOM 클릭만으로 편집하지 않는다. 가능한 경우 제품 수준 명령을 사용하고, 웹 UI는 그 명령과 상태를 접근 가능한 형태로 노출한다. ProductCommand는 필요한 경우 하나 이상의 `EngineIntent`로 컴파일되어 기존 엔진을 통해 실행된다.

이 결정은 아직 제안된 탐색 방향이다. 이 ADR에서 Web Agent Studio를 주 제품으로 승격하거나 웹 애플리케이션을 생성하거나 공개 코드 계약을 변경하지 않는다.

## 제품 경계 (Product Boundary)

```text
Browser Agent / Command Console
        ↓
Web Agent Contract
        ↓
Studio Product Context + ProductCommand
        ↓
EngineIntent Batch
        ↓
@rendium/engine
        ↓
Preview / Export Artifact
```

예상되는 workspace 구조는 현재 구현을 설명하는 것이 아니라 목표 구조를 나타낸다.

- `@rendium/engine`: 핵심 편집 모델, 상태, 렌더링 및 export 기반
- `apps/desktop-studio`: 기존 Electron 기준 구현 및 유지보수 대상
- `apps/web-agent-studio`: AI 명령 입력과 상태 확인 중심의 향후 웹 애플리케이션
- 향후 `editor-agent-contracts`: 명령, 상태, capability, job, 오류 규약을 담을 개념적 위치

이번 Renewal 작업에서는 `apps/web-agent-studio`나 `editor-agent-contracts`를 생성하지 않는다. 엔진의 핵심 의미론은 공유한다. Electron IPC, 파일 시스템, 앱 쉘에 결합된 경로는 이후 구현 단계에서 필요할 때 웹용 adapter로 분리하거나 확장할 수 있다.

## 인터페이스 영향 (Interface Impact)

이 ADR은 공개 API, 타입, 패키지 또는 wire schema를 변경하지 않는다. `ProductCommand`, `EngineIntent`, capability, job, error contract는 아키텍처 경계로만 기록한다. 상세한 웹 계약은 후속 설계 및 구현 결정에서 다룬다.

## 탐색 범위 (Exploration Scope)

첫 번째 검증 흐름은 다음으로 제한한다.

1. 로컬 영상 또는 이미지 입력
2. 영상 자르기 또는 순서 변경
3. 텍스트 레이어 추가
4. 미리보기 및 프로젝트 상태 검증
5. MP4 export

검증 기준은 에이전트가 깨끗한 프로젝트에서 시작해 명령을 입력하고, 결과 상태와 구조화된 결과 또는 오류를 읽고, export 결과 artifact까지 확인할 수 있는지 여부다.

## 안정성 원칙 (Reliability Rules)

기존 Electron GUI의 모든 UX 버그를 웹 버전 시작 전에 해결할 필요는 없다. 그러나 다음과 같은 엔진 또는 계약 수준의 문제는 웹 프로토타입을 신뢰하기 전에 해결하거나 명확히 격리해야 한다.

- 상태 및 manifest 정합성
- intent batch와 undo/redo의 원자성
- 에셋 저장 및 복원
- 미디어 readiness와 시간·프레임 계산
- preview와 export 결과의 일치

웹 프로토타입에서 동일한 문제가 재현되면 GUI 문제가 아닌 엔진 또는 계약 문제로 취급한다.

## Electron 보존 및 전환 정책 (Electron Preservation and Migration Policy)

- 현재 공개 Electron 구현은 기준 구현으로 보존한다.
- `codex/renewal-web-agent` 브랜치에서 웹 프로토타입을 먼저 검증한다.
- 웹 버전이 검증되기 전에는 Electron 코드를 삭제하지 않는다.
- 웹 버전이 주 제품으로 승격될 경우 Electron은 archive branch, tag 또는 별도 repository로 보존한다.
- 저장소의 Git 기록을 다시 초기화하지 않는다. 제품 정리와 기록 삭제는 별개의 문제로 취급한다.
- 기존 Electron 관련 ADR은 역사적 문서로 남기고, 웹 Renewal이 기존 제품 방향을 대체하는 경우 후속 결정에서 그 관계를 명시한다.

## 비목표 (Non-goals)

- 첫 단계에서 전문 NLE 수준의 타임라인 GUI 구현
- 탐색 전에 Electron UX의 모든 버그 해결
- 자연어만으로 모든 편집 동작을 처리하는 모델 의존 구조
- 새 영상 렌더링 엔진 작성
- 이 ADR에서 웹 앱 또는 상세 웹 스키마 생성
- 웹 프로토타입 검증 전 Electron 및 기존 문서의 일괄 삭제

## 재검토 기준 (Revisit)

다음 조건을 충족하면 Web Agent Studio를 주 제품 방향으로 승격하는 것을 재검토한다.

- 브라우저 에이전트가 첫 번째 검증 흐름을 반복 수행할 수 있음
- 명령 실행 결과와 오류를 구조화된 상태로 확인할 수 있음
- export 결과 artifact가 미리보기와 일관됨
- 웹 전용 adapter와 기존 엔진의 경계가 유지 가능함
- Electron 기준 구현을 폐기해도 되는지에 대한 제품 결정이 명시됨
