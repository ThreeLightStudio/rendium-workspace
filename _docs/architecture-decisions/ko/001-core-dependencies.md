# Rendium 모노레포 핵심 의존성 채택 근거 (Core Dependencies Rationale)

[English](../en/001-core-dependencies.md)

본 문서는 Rendium 프로젝트의 최상위 모노레포(`rendium-workspace`) 인프라 구축을 위해 채택된 핵심 의존성(Dependencies) 도구들의 선정 사유와 아키텍처적 목적을 기술합니다.

## 1. 패키지 관리자: pnpm (`pnpm@10.33.0`)
* **역할:** 워크스페이스 패키지 관리 및 의존성 트리 제어
* **채택 사유:** * 콘텐츠 주소 지정 저장소(Content-addressable store)와 심볼릭 링크를 활용하여 엄격한(Strict) `node_modules` 구조를 생성합니다. 
  * npm이나 Yarn 플랫(Flat) 구조에서 발생하는 유령 의존성(Phantom Dependencies)을 원천 차단하여, 코어 엔진 패키지(`@rendium/engine`)와 마이크로 프론트엔드 쉘(`apps/*`) 간의 모듈 격리를 보장합니다.
* **참고 문헌:** pnpm 공식 문서 - "Flat node_modules is not the only way" (2021)

## 2. 모노레포 빌드 시스템: Turborepo (`turbo`)
* **역할:** 패키지 간 빌드 파이프라인 구성, 작업(Task) 캐싱 및 오케스트레이션
* **채택 사유:**
  * 방향성 비순환 그래프(DAG, Directed Acyclic Graph)를 기반으로 다중 패키지의 빌드 순서(Topology)를 제어합니다.
  * Rust/Wasm 컴파일과 TypeScript 빌드 등 이종 언어 파이프라인이 혼재된 환경에서, 설정 복잡도(Overhead)를 최소화하면서 병렬 처리 및 산출물 캐싱을 통한 빌드 성능 극대화를 제공합니다.
* **참고 문헌:** Vercel, "Turborepo Architecture and Task Pipeline"

## 3. 정적 분석 및 포매터: Biome (`@biomejs/biome`)
* **역할:** 코드 린팅(Linting) 및 포매팅(Formatting)
* **채택 사유:**
  * Rust 언어로 작성되어 기존 JavaScript 기반 도구 대비 정적 분석 속도가 비약적으로 빠릅니다.
  * 단일 설정 파일(`biome.json`)을 통해 ESLint와 Prettier의 기능을 통합 제공하므로, 모노레포 내 다수 패키지의 툴체인 파편화를 방지하고 유지보수성을 향상시킵니다.
* **참고 문헌:** Biome 공식 문서 - "One toolchain for your web project"

## 4. 테스트 프레임워크: Vitest (`vitest`)
* **역할:** 단위 테스트(Unit Test) 및 통합 테스트 실행
* **채택 사유:**
  * WebGPU와 Rust(Wasm)를 활용하는 아키텍처는 네이티브 ESM(ECMAScript Modules) 지원이 필수적입니다. CommonJS 기반의 Jest와 달리, Vite 기반의 Vitest는 트랜스파일링 병목 없이 ESM을 처리합니다.
  * HMR(Hot Module Replacement)을 활용하여 테스트 실행 속도를 최적화합니다.
* **참고 문헌:** Vitest 공식 문서 - "Why Vitest"

## 5. 버전 관리 도구: Changesets (`@changesets/cli`)
* **역할:** 모노레포 내 개별 패키지의 버전 관리 및 Changelog 자동화
* **채택 사유:**
  * 워크스페이스 내에 존재하는 코어 모듈과 애플리케이션 계층의 버전을 독립적으로, 혹은 의존성에 따라 종속적으로 제어하기 위한 가장 안정적인 표준 도구입니다.
  * PR(Pull Request) 단계에서 변경 사항의 의미론적 버전(Semantic Versioning) 의도를 명시적으로 수집하여 릴리즈 프로세스를 자동화합니다.
* **참고 문헌:** Atlassian, Changesets Documentation