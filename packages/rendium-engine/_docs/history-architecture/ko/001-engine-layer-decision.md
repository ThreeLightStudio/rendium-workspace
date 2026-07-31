# ADR 001: 엔진 레이어 구조 및 멀티미디어 링크 시스템 설계

[English](../en/001-engine-layer-decision.md)

> Superseded by `009-minimal-layer-model.md`, `010-visual-layer-provider-composition.md`, and `../onboarding/core-layer-onboarding.md`. This document is retained as historical context for the earlier domain-layer design.

## 대상 (Context)
비디오 파일(`*.mp4`)과 같이 시각(Visual)과 청각(Audio)이 동반되는 멀티미디어 에셋을 `@rendium/engine`에서 어떻게 레이어로 추상화하고 관리할 것인가에 대한 구조 설계.
핵심 쟁점은 "영상의 소리를 Video Layer에 포함시킬 것인가, 아니면 별도의 Audio Layer로 분리할 것인가" 였습니다.

## 결정 사항 (Decision)

### 1. 렌더링 주체 단위로 레이어를 분리 (분리형 구조)
통합형 구조(비디오 레이어가 오디오 재생까지 담당) 대신 **에셋과 레이어를 분리하여 시각 트랙과 청각 트랙을 개별 레이어로 다루기로 결정**했습니다.
- **Visual track layer**: WebGPU를 통한 프레임 렌더링만 전담.
- **Audio Layer (`AudioLayer`)**: Web Audio API 기반 오디오 디코딩, 재생 및 분석 데이터 제공 전담.

### 2. 엔진 계층과 UI 계층의 역할 위임
레이어 간의 논리적 묶음(그룹핑) 및 UI 상태는 철저히 **스튜디오(UI) 측에서 관리**하고, **엔진은 독립적인 레이어들의 렌더링에만 집중**합니다.

*   **UI 파트 (`desktop-studio`)**: 
    *   사용자가 타임라인에 비디오 클립을 드래그 앤 드롭하면, 스토어에서 엔진에 **시각 트랙 레이어와 `AudioLayer`** 생성을 요청합니다.
    *   UI 상태 관리(Zustand) 측면에서 이 두 레이어에 동일한 `groupId`를 부여하여 **링크드 레이어(Linked Layers)** 상태를 형성합니다.
    *   오디오 레이어 Hover 시 비디오 레이어 하이라이트, 동기화된 클립 이동(Trim/Drag) 등은 모두 이 `groupId`를 참조하여 UI 레벨에서 제어합니다.

*   **엔진 파트 (`@rendium/engine`)**: 
    *   UI 종속적인 식별자(`groupId` 등)는 알 필요가 없습니다. 각 레이어는 철저히 단일 책임 원칙에 따라 동작합니다.
    *   단, 데이터 의존성이 있는 경우(예: spectrum visual이 특정 오디오의 주파수 분석값이 필요한 경우)에만 `layerConfig`의 속성(`linkedAudioId`)으로 다른 레이어의 ID를 참조(Reference)합니다.

## 결과 및 기대 효과 (Consequences)
1.  **엔진의 순수성 보장**: WebGPU 렌더링과 Audio 재생 책임이 각각의 레이어로 깔끔하게 분리되어 엔진 유지보수가 용이해집니다.
2.  **고급 편집 기능 확장성 확보**: "비디오 클립과 오디오 클립의 링크 해제(Unlink)", "오디오만 따로 삭제", "오디오에 독립적인 이펙트 추가"와 같은 NLE(Non-Linear Editing) 소프트웨어 필수 기능들을 UI 상태 변경(groupId 해제 등)만으로 쉽게 구현할 수 있습니다.
3.  **데이터 라우팅의 유연함**: 분리된 `AudioLayer`의 ID를 바탕으로 spectrum visual과의 데이터 연동(`linkedAudioId`)을 구조적 충돌 없이 자연스럽게 이어나갈 수 있습니다.
