# ADR-002: Intent-Driven Architecture 도입

[English](../en/002-intent-driven-architecture.md)

> **상태**: Accepted  
> **일자**: 2026-04-14  
> **작성자**: Automated Migration  

---

## 컨텍스트 (Context)

Rendium Engine은 `IProjectManifest` 중심의 단일 진실 공급원(SSOT)을 확립한 상태였으나, UI 컴포넌트(`desktop-studio`)가 엔진 내부의 `ManifestMutators`를 직접 호출하여 상태를 변경하는 **강결합(Tight Coupling)** 구조를 가지고 있었습니다.

### 문제점
1. UI 파일 상단에 `mutateLayerProps`, `addLayer`, `removeLayer`, `mutateLayerOrder`, `mutateProjectMeta` 등의 Mutator들이 직접 Import되어 있었음
2. 새로운 기능 추가 시 UI 코드가 Immer draft 조작 로직을 알아야 하는 구조
3. 자동화 스크립트(매크로/AI 에이전트)가 동일한 변이 로직을 중복 작성해야 하는 비효율

---

## 결정 (Decision)

모든 사용자 인터랙션을 **`EngineIntent`라는 표준화된 TypeScript Discriminated Union**으로 추상화하고, `EngineStore` 내부에 **Intent Router**를 신설하여 UI ↔ Engine 간 API 경계를 명확히 분리합니다.

### 변경된 아키텍처 흐름

```
[As-Is]  UI → ManifestMutators 직접 Import → EngineStore.dispatch(recipe)
[To-Be]  UI → EngineIntent 객체 생성 → EngineStore.dispatchIntent(intent) → Intent Router → ManifestMutators
```

---

## 구현 내역 (Implementation)

### Step 1: Contract 정의
- **파일**: `packages/rendium-engine/src/_contracts/intents.contracts.ts`
- 12개의 Intent 인터페이스 정의 (Layer Properties 6개, Lifecycle 3개, Project 2개, UI-Only 1개)
- `EngineIntent` (persisted) / `TransientIntent` (non-persisted) 유니온 분리
- `INTENT_TYPES` 상수 객체 및 `isNonPersistedIntent()` 타입 가드

### Step 2: Intent Router 신설
- **파일**: `packages/rendium-engine/src/store/EngineStore.ts`
- `dispatchIntent(intent: EngineIntent)` — 공개 API
- `dispatchTransient(intent: TransientIntent)` — Draft-Commit 60 FPS 프리뷰
- `_routeIntent()` — 비공개 exhaustive switch/case 라우터
- `_handleNonPersisted()` — HOVER_LAYER 등 비저장 액션 처리

### Step 3: UI 계층 리팩터링
- **영향 파일**: `Inspector.tsx`, `Timeline.tsx`, `RightPanel.tsx`,- `StudioEditor.tsx` — `mutateProjectMeta` → `RENAME_PROJECT` intent
- `useTimelineDrag.ts` — `mutateLayerOrder` → `REORDER_LAYER` intent
- `useEngineStore.ts` — `dispatchIntent`/`dispatchTransient` 훅 반환값 추가
- **`packages/rendium-engine/src/index.ts`** — 더 이상 사용되지 않는 레거시 Mutator (`addLayer`, `removeLayer` 등) 및 관련 타입들을 public API에서 제거 (은닉화)

---

## 결과 (Consequences)

### 장점
- **UI 단순화**: UI 컴포넌트가 Immer, ManifestMutators, draft 조작 로직을 전혀 알 필요 없음
- **자동화 지원**: Intent 객체 배열만으로 사용자 편집을 100% 에뮬레이트 가능
- **살아있는 명세서**: `EngineIntent` TypeScript 인터페이스가 곧 기능 명세서
- **컴파일 타임 안전**: exhaustive switch + `never` 타입으로 누락된 Intent 핸들러를 컴파일 시 감지
- **하위 호환**: 기존 `dispatch(recipe)` API를 deprecated로 유지하여 점진적 마이그레이션 지원

### 주의점
- `dispatch(recipe)` 및 `legacyDispatch()`는 deprecated 상태이며, 신규 코드에서 사용 금지
- 새로운 사용자 액션 추가 시 반드시 `intents.contracts.ts`에 Intent 인터페이스를 먼저 정의한 후 Intent Router에 case를 추가할 것

---

## 검증 (Verification)

- `npx tsc --noEmit` (engine) — ✅ 에러 0건
- `npx tsc --noEmit` (desktop-studio) — ✅ 에러 0건
- `pnpm build` (engine) — ✅ 빌드 성공
- UI에서 ManifestMutators 직접 import — ✅ 0건 (완전 제거)
