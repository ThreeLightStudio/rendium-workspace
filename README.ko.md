# Rendium Desktop Studio

[English Version](./README.md)

무료, 완전 로컬, 로그인 없는 영상 편집기 (오픈소스). 선언적 오디오 리액티브
비디오 그래픽과 WebCodecs 하드웨어 가속 MP4 익스포트를 Electron 기반 데스크톱
앱으로 제공하며, 핵심 그래픽/오디오/미디어 파이프라인은 `@rendium/engine`
패키지로 분리 공개되어 있습니다.

---

## 0. 핵심 가치 (Core Values)

Rendium Desktop Studio는 프라이버시, 속도, 그리고 단순함에 집중합니다:

- **완전 로컬 (Fully Local)**: 모든 미디어 처리, WebGL 렌더링, MP4 인코딩이 사용자의 기기에서 직접 수행됩니다. 현재 오픈소스 릴리스에서는 가져온 파일이 외부로 절대 전송되지 않습니다(서버 비용 0원). 현재 공개 범위에서 제외된 OpenAI 채팅 실험 기능을 향후 다시 연결하는 경우에는, 선택형 서비스에 명시적으로 제출한 메시지·에디터 컨텍스트·이미지만 해당 제공자에게 전송될 수 있으며 미디어 처리는 계속 로컬에서 수행됩니다.
- **로그인 불필요 (No Login)**: 즉시 편집을 시작하세요. 계정 생성, 구독, 추적 기능이 전혀 없습니다.
- **가볍고 빠름 (Fast and Lightweight)**: 빠르게 열리고 마지막 프로젝트를 자동으로 복원하는 "영상 메모장"을 지향합니다.
- **영구적 에셋 매핑**: 가져온 미디어 파일은 프로젝트 디렉토리로 자동 관리/매핑되어, 프로젝트 이동 시 파일 링크가 깨지는 현상을 방지합니다.

---

## 1. Core Architecture (핵심 아키텍처)

Rendimento Engine은 미디어 파이프라인의 처리 효율을 극대화하고, 복잡한 사용자 및 AI 에이전트의 제어 스트림을 동기화하기 위해 다음과 같은 설계 패턴을 채택하고 있습니다.

### 1.1 Interface-First Architecture
- **의도 기반 추상화 (Intent-Driven Separation)**: UI 계층(`desktop-studio`)과 오디오 리액티브 비디오 그래픽스 코어 엔진(`@rendium/engine`) 간의 강결합을 해제하기 위해, 시스템 내 모든 데이터 변형 액션을 `EngineIntent` TypeScript Discriminated Union으로 정의하였습니다.
- **AI-UI 통합 파이프라인**: 사용자 인터랙션과 AI 분석 프리뷰 결과(AiActionPreview)가 각각 개별 경로로 상태를 조작하지 않고, 동일한 `EngineIntent` 타입 명세에 맞추어 변이되도록 설계되어 구조적 정합성을 갖췄습니다.

### 1.2 State Management (Zustand + Immer)
- **단방향 데이터 흐름 (Unidirectional Data Flow)**: Zustand의 경량 상태 매니저 위에 Immer의 불변성 레시피(produceWithPatches)를 융합하여, 엔진의 모든 상태 변경을 안전한 단방향 데이터 흐름으로 제어합니다.
- **최적화된 JSON Patch 동기화**: Immer가 생성하는 O(1) 수준의 JSON Patch를 `SceneReconciler`로 흘려보냄으로써, 수백 개의 레이어를 가동할 때도 복잡한 상태 그래프 탐색 비용 없이 해당 WebGL 및 Web Audio API 리소스 인스턴스만을 선택적으로 재생성 및 갱신합니다.

### 1.3 Client-Side Media Pipeline
- **서버 비용 0원의 로컬 미디어 파이프라인**: 캔버스의 프레임 캡처링(WebGL/WebGPU Readback) 및 Web Audio 오디오 합성을 브라우저 클라이언트 사이드에서 전적으로 수행합니다.
- **mp4-muxer 기반의 로컬 인코딩**: WebCodecs API의 `VideoEncoder` 및 `AudioEncoder` 하드웨어 가속 성능을 활용해 프레임별로 인코딩한 원시 청크(Chunk)들을 라이브러리 `mp4-muxer`를 사용해 결합합니다. 이를 통해 클라이언트에서 곧바로 고해상도 MP4 미디어 파일을 로컬로 익스포트할 수 있습니다.

---

## 2. Technical Achievements (기술적 성과 및 도전 과제)

### 2.1 Electron 런타임 환경에서의 크로스 프로세스 IPC 최적화
- **메모리 버퍼 스트리밍**: 렌더러 프로세스에서 WebCodecs 파이프라인으로 압축한 동영상/오디오 바이너리 청크를 한 번에 메모리에 적재하지 않고, `StreamTarget`과 일렉트론 IPC 채널(`writeExportChunk`)을 통해 파일 핸들러에 청크 단위로 분할 전송하는 구조를 설계했습니다.
- **I/O 병목 해소**: 이 스트리밍 설계를 통해 메인 프로세스의 메모리 스파이크 현상 및 IPC 전송 지연 병목을 극대화하여 해결하였으며, 60fps 비디오 익스포트 중에도 UI 프레임 드롭을 방지하였습니다.

### 2.2 오디오 주파수 분석(FFT) 데이터와 WebGL 셰이더 변수 간의 실시간 매핑
- **프레임 동기화**: Web Audio API의 `AnalyserNode`가 추출하는 실시간 고속 푸리에 변환(FFT) 주파수 및 시간 도메인 분석 데이터를 매 프레임 단위로 수집합니다.
- **오디오-리액티브 렌더링**: 이 주파수 스펙트럼 강도값을 GPU의 WebGL Uniform 변수와 변환(Transform) 행렬 스케일 값에 실시간 선형 보간 매핑시켰습니다. 이를 통해 소리의 고저에 정밀하게 반응하는 고성능 오디오 리액티브 비디오 효과를 구현했습니다.

### 2.3 에이전트 지침 자동화 및 아키텍처 보호 (`packages/agent-tools`)
- **에이전트 제약 제어**: AI 에이전트(Cursor, Cline 등)가 Zustand + Immer 단방향 흐름이나 1D 플랫 레이어 순서와 같은 핵심 아키텍처 제약을 손상하지 않고 일관된 규칙 하에 작동하도록 `@rendium/agent-tools` 패키지를 신설하였습니다.
- **선언적 규칙 병합 및 검증**: 모노레포 최상위 정책인 `.agentrules.yml` 파일과 개별 패키지(Bounded Context) 오버라이드를 결합하고, 스키마 검증(중복 ID 검출 등)을 수행하여 정제된 규칙 상태를 빌드합니다.
- **선학습 맥락 유도**: 패키지별 `required_reading` 메타데이터를 기반으로, 코드 변경 요청 전에 온보딩 가이드와 README를 먼저 학습하도록 강제하는 에이전트 지침 프롬프트를 자동으로 렌더링합니다. 이 과정을 통해 개발을 제안/시도할 때 규칙 누락으로 인한 빌드 파괴나 오동작을 사전에 차단하도록 개선했습니다.

---

## 3. Project Status & Strategic Retrospective (프로젝트 상태 및 전략적 회고)

### 3.1 비즈니스 타당성 분석 결과 및 Tech PoC 전환 배경
- **시장/규제 트렌드 변화**: YouTube 및 주요 미디어 플랫폼의 AI 생성 콘텐츠 규제 및 감지 트렌드가 강화됨에 따라, B2C 형태의 단순 단일 기능(Simple Utility) 래퍼 애플리케이션 서비스는 플랫폼 종속성 리스크가 높다는 점을 인지하였습니다.
- **사용자 워크플로우 단절 비용 (Friction Analysis)**: 기존 데스크톱 단일 기능 툴셋은 기획, 편집, 업로드로 이어지는 전체 마케팅 워크플로우 내에서 사용자가 데이터를 수동으로 넘겨야 하는 심각한 Context Switch Friction을 유발하였습니다.
- **무료 + 오픈소스 선공개, 피드백 기반 수익화 검토**: CapCut, Adobe Premiere 등
  기존 영상편집 시장 대비 본 프로젝트가 별도 구독 플랜으로 흡수할 수 있는 수요는
  예측상 매우 미미했습니다. 그럼에도 AI 시대에 약 100일 정도 진행한 프로젝트이므로,
  일단 **완전 무료로 공개하여 인지도를 확보**하고, **사용자 피드백이 모이는 그
  시점에서 수익화 가능성을 재검토**하는 전략이 합리적이라고 판단했습니다. 이를
  위해 본 프로젝트를 **"무료 · 완전 로컬 · 로그인 없는 영상 편집기"**로
  포지셔닝하고, Rendium Desktop Studio와 `@rendium/engine` 두 산출물을 모두 오픈소스로
  공개합니다.

---

---

## 4. Known Limitations (알려진 제한 사항)

- **타임라인 UX**: 타임라인 인터페이스는 현재 활발히 개선 중인 단계입니다. 레이어 관리와 드래그 등의 기본 기능을 지원하지만, 멀티 트랙 리플 편집이나 중첩 시퀀스 프리뷰와 같은 고급 기능은 아직 구현되지 않았습니다. 현재의 UX 정책은 [TODO.md](./TODO.md) §4.10을 참고하세요.
- **AI 어시스턴트**: 핵심 로컬 편집 경험에 집중하기 위해, 현재 오픈소스 릴리스에서는 AI 기반 채팅 및 퀵 프롬프트 화면이 비활성화되어 있고 AI 제공자와 연결되지 않습니다. 다만, 백엔드의 `aiActionParser` 및 `aiJsonEnvelope` 로직은 자동 비디오 생성을 위한 PoC로서 코드베이스에 보존되어 있습니다. 선택형 OpenAI 채팅 연동을 다시 연결한다면, 채팅에 제출한 메시지·에디터 컨텍스트·이미지가 제공자에게 전송됨을 개인정보 안내에 명시해야 합니다.

## 5. Documentation Map (문서 맵)

Rendium의 코드베이스 아키텍처, 역사적인 설계 결정(ADR), 코딩 스타일 가이드를 파악하기 위해 다음 관련 문서에서 탐색을 시작할 수 있습니다:

- **통합 기술 사양 및 문제해결 가이드**:
  - [국문 통합 기술 사양서](./docs/ko/technical-spec.md)
  - [영문 통합 기술 사양서](./docs/en/technical-spec.md)
- **모노레포 핵심 의사결정 기록 (ADRs)**:
  - [루트 아키텍처 결정 기록 (ADR-001 ~ 005)](./_docs/architecture-decisions/ko)
  - [코어 엔진 아키텍처 결정 기록 (ADR-001 ~ 011)](./packages/rendium-engine/_docs/history-architecture/ko)
  - [데스크톱 스튜디오 아키텍처 결정 기록 (ADR-001 ~ 005)](./apps/desktop-studio/_docs/history-architecture/ko)
- **개발 컨벤션**: 루트 [Conventions Directory](./_docs/conventions/ko)에서 TypeScript 및 주석 관련 약속을 정의합니다.
- **코어 엔진 내부 구조 (`packages/rendium-engine`)**:
  - [엔진 핵심 아키텍처 사양서](./packages/rendium-engine/_docs/ko/ARCHITECTURE.md)
  - [엔진 개발자 온보딩 가이드](./packages/rendium-engine/_docs/onboarding/ko/README.md)
- **데스크톱 스튜디오 앱 쉘 (`apps/desktop-studio`)**:
  - [앱 쉘 역사적 구조 및 AI 보류 결정 의사록](./apps/desktop-studio/_docs/history-architecture/ko/README.md)
- **에이전트 툴 (`packages/agent-tools`)**:
  - [에이전트 지침 도구 및 CLI 사용 가이드](./packages/agent-tools/README.ko.md)

---

## 5. Development & Verification

### 5.1 Prerequisites
- Node.js (>= 18.0.0)
- pnpm (10.33.0)

### 5.2 Installation
```bash
pnpm install
```

### 5.3 Build & Verify
```bash
pnpm verify
```
