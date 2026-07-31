# Architecture History: Layer Composition Migration (2026-04-07)

[English](../en/005-layer-composition-migration.md)

## 1. 개요 (Overview)
`rendium-engine`의 핵심 레이어 시스템을 기존의 **단일 상속(Single Inheritance)** 구조에서 **구성(Composition)** 기반의 유연한 구조로 전환하였다.

## 2. 배경 (Background)
기존 `BaseLayer`는 모든 하위 레이어(Audio, ScopeEnd 등)에 WebGPU 디바이스 참조, 트랜스폼 행렬, 투명도 등 렌더링에만 필요한 속성을 강제하고 있었다. 이는 다음과 같은 문제를 야기했다:
- **비대한 기저 클래스(Fat Base Class)**: 비활성/비시각 레이어에서도 불필요한 메모리 점유.
- **직렬화 오버헤드**: JSON 저장 시 불필요한 `position`, `scale`, `visible` 데이터 포함.
- **ISP 위배**: 시각적 실체가 없는 레이어에 `draw()`와 `visible` 속성이 강제됨.

## 3. 주요 변경 사항 (Key Changes)

### 3.1 컴포넌트 분리 (Component Segregation)
공간 및 광학 속성을 독립된 인터페이스로 정의하였다.
- `ITransform`: `position`, `scale`, `rotation`, `_localMatrix` 관리.
- `IAppearance`: `visible`, `opacity` 관리.

### 3.2 계층 구조 재편 (Hierarchy Refactoring)
- `ILayer` (Interface): `id`, `startTime`, `duration` 등 순수 시간적 속성과 `update()` 메서드만 정의.
- `BaseLayer` (Abstract): `ILayer`를 구현하며 시간축 관리 로직을 공통화.
- `RenderableLayer` (Abstract): `BaseLayer`를 상속하며 `ITransform`과 `IAppearance`를 필수 소유. WebGPU 리소스 및 `draw()` 메서드 관리.
- `AudioLayer` & `ScopeEndLayer`: `BaseLayer`를 직접 상속하여 GPU 의존성 제거.
- `ScopeStartLayer`: `BaseLayer`를 상속하며 `ITransform`과 `IAppearance`를 선택적으로 주입(Optional) 가능한 구조로 변경.

### 3.3 로직 최적화 (Optimization)
- `Scene.update()`: 모든 레이어를 시간축에 따라 무조건 업데이트. `visible` 체크 제거.
- `Scene.draw()`: `isRenderable` 타입 가드를 통해 시각적 레이어만 필터링하고, `appearance.visible`인 경우에만 렌더링 수행.

## 4. 기대 효과 (Benefits)
- **메모리 절감**: 대규모 프로젝트에서 비시각 레이어의 데이터 비중이 줄어들어 메모리 효율 향상.
- **안정성**: 렌더링 파이프라인과 논리 업데이트가 명확히 분리됨.
- **확장성**: 추후 3D 트랜스폼이나 물리 엔진 등 새로운 컴포넌트 추가가 용이함.
