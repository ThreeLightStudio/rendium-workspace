# Rendium Technical Specification & Architecture Document (KO)

[English](../en/technical-spec.md)

본 문서는 **Rendium** 프로젝트의 코어 엔진 아키텍처, 핵심 인프라 결정 사항, 그리고 macOS 배포 및 빌드 트러블슈팅 사양을 기술하는 통합 기술 문서입니다.

---

## 1. Core Monorepo Infrastructure (핵심 인프라 의존성)

Rendium 모노레포(`rendium-workspace`)는 패키지 간 모듈 격리와 빌드 효율성을 보장하기 위해 다음과 같은 툴체인을 채택하고 있습니다.

### 1.1 패키지 관리자: pnpm (`pnpm@10.33.0`)
- **역할:** 워크스페이스 패키지 관리 및 의존성 트리 제어.
- **채택 사유:** 콘텐츠 주소 지정 저장소(Content-addressable store)와 심볼릭 링크 구조를 활용하여 npm/Yarn 플랫 구조에서 발생하는 유령 의존성(Phantom Dependencies)을 차단하고, 코어 엔진 패키지(`@rendium/engine`)와 애플리케이션 쉘(`apps/*`) 간의 완전한 격리를 보장합니다.

### 1.2 빌드 시스템: Turborepo (`turbo`)
- **역할:** 패키지 간 빌드 파이프라인 구성 및 작업(Task) 캐싱.
- **채택 사유:** 방향성 비순환 그래프(DAG)를 기반으로 다중 패키지의 빌드 순서(Topology)를 제어하고, 변경점이 없는 모듈에 대해 캐시 복원을 수행하여 병렬 빌드 성능을 극대화합니다.

### 1.3 린터/포매터: Biome (`@biomejs/biome`)
- **역할:** 코드 정적 분석 및 스타일 포매팅.
- **채택 사유:** Rust로 작성되어 기존 ESLint/Prettier 대비 비약적으로 빠른 속도를 보여주며, 단일 설정 파일(`biome.json`)을 통해 일관된 코드 품질 규칙을 제공합니다.

### 1.4 테스트 프레임워크: Vitest (`vitest`)
- **역할:** 단위 및 통합 테스트 실행.
- **채택 사유:** WebGPU 및 ESM 표준 지원 환경에서 네이티브 ESM 모듈을 빠르게 변환하여 테스트 실행 및 변경 모니터링(HMR) 속도를 극대화합니다.

---

## 2. Intent-Driven Architecture (의도 기반 아키텍처)

Rendium Engine은 UI 계층(`desktop-studio`)과 상태 변이 로직 간의 강결합을 해소하기 위해 **Intent-Driven 패턴**을 사용합니다.

```
[UI / AI Agent / Preview] → EngineIntent (Union) → EngineStore (dispatchIntent) → IntentRouter → ManifestMutators → IProjectManifest (Immer Patches) → SceneReconciler
```

### 2.1 주요 메커니즘
- **Standardized Intent**: 사용자 인터랙션 및 AI 분석 프리뷰 결과는 `EngineIntent` TypeScript 디스크리미네이티드 유니온 객체로 추상화됩니다.
- **Exhaustive Routing**: `IntentRouter`는 들어오는 모든 Intent를 타입 안정성을 보장하며 `ManifestMutators`로 매핑합니다.
- **Immer-based Patch Generation**: 상태 변이는 `produceWithPatches`를 거쳐 JSON Patch로 계산되며, 이를 바탕으로 실행 취소/다시 실행(Undo/Redo)을 위한 이력이 정밀하게 빌드됩니다.
- **Scene Reconciler**: 발생한 JSON Patch는 `SceneReconciler`로 흘러가 런타임 WebGL 캔버스 및 Web Audio API 파이프라인을 동적으로 재구성합니다.

---

## 3. macOS Build Troubleshooting (빌드 트러블슈팅 가이드)

로컬 macOS 환경에서 데스크톱 빌드 및 패키징 시 발생할 수 있는 주요 예외 상황 대응 지침입니다.

### 3.1 "Team ID Mismatch" 크래시 (SIGABRT)
- **증상:** 빌드된 `.app` 파일을 실행 시 macOS 크래시가 나며 즉시 비정상 종료됨.
- **원인:** 개발 환경에서 `electron-builder`가 Ad-hoc 코드 서명을 적용하는 과정에서 서명 주체와 내부 프레임워크 간의 Team ID 불일치 현상이 발생.
- **해결책:** `electron-builder.yml` 설정 내 `identity` 값을 `null`로 지정하여 로컬 빌드 시 코드 서명을 비활성화합니다.
  ```yaml
  mac:
    identity: null
  ```

### 3.2 Gatekeeper & Quarantine 속성 해제
- **증상:** 서명되지 않은 데스크톱 앱을 실행할 때 macOS가 손상된 파일로 오인하여 실행을 차단함.
- **해결책:** 아래 터미널 명령어를 통해 격리(Quarantine) 속성을 재귀적으로 제거합니다.
  ```bash
  xattr -cr apps/desktop-studio/dist/mac-arm64/"Rendium Desktop Studio.app"
  ```

---

## 4. 관련 기술 문서 및 의사결정 기록 (Related Documents)

Rendium의 보다 상세한 아키텍처 배경과 패키지별 개발 지침은 다음 문서를 참고해 주십시오.

### 4.1 모노레포 공통 문서 (Workspace Conventions & ADRs)
- **아키텍처 결정 기록 (ADR)**: [ADR Directory](../../_docs/architecture-decisions/ko)
  - [ADR-001: 모노레포 핵심 의존성 채택 근거](../../_docs/architecture-decisions/ko/001-core-dependencies.md)
  - [ADR-002: Intent-Driven Architecture 도입](../../_docs/architecture-decisions/ko/002-intent-driven-architecture.md)
  - [ADR-003: Panda CSS 데스크톱 스튜디오 도입](../../_docs/architecture-decisions/ko/003-panda-css-desktop-studio-adoption.md)
  - [ADR-004: Vite 8 마이그레이션 보류](../../_docs/architecture-decisions/ko/004-vite8-migration-on-hold.md)
  - [ADR-005: 에이전트 컨텍스트 자동 로딩](../../_docs/architecture-decisions/ko/005-agent-context-auto-loading.md)
- **개발 컨벤션**: [Conventions Directory](../../_docs/conventions/ko)
  - [TypeScript 기본 컨벤션](../../_docs/conventions/ko/typescript.md)
  - [코드/문서 주석 컨벤션](../../_docs/conventions/ko/comments.md)

### 4.2 코어 엔진 내부 문서 (Core Engine Internals)
- **엔진 아키텍처 상세**: [Engine Architecture](../../packages/rendium-engine/_docs/ko/ARCHITECTURE.md)
- **엔진 개발자 온보딩 가이드**: [Engine Onboarding](../../packages/rendium-engine/_docs/onboarding/ko/README.md)
  - [코어 레이어 정책 및 검증](../../packages/rendium-engine/_docs/onboarding/ko/core-layer-onboarding.md)
  - [비주얼 레이어 프로바이더 확장](../../packages/rendium-engine/_docs/onboarding/ko/visual-layer-provider-onboarding.md)
- **엔진 역사적 설계 변천사**: [Engine History Directory](../../packages/rendium-engine/_docs/history-architecture/ko)

### 4.3 데스크톱 스튜디오 내부 문서 (Desktop App Shell)
- **앱 쉘 아키텍처 역사**: [Studio History Directory](../../apps/desktop-studio/_docs/history-architecture/ko)
  - [ADR-005: AI 수익화 기능 보류에 대한 결정 기록](../../apps/desktop-studio/_docs/history-architecture/ko/005-ai-monetization-deferral.md)
