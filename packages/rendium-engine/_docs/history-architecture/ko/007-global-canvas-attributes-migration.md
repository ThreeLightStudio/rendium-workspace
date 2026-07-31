# ADR 007: Global Canvas Attributes Migration (전역 캔버스 속성 마이그레이션)

[English](../en/007-global-canvas-attributes-migration.md)

- **상태**: 승인 및 구현 완료
- **날짜**: 2026-04-16
- **맥락**: 배경/캔버스 설정을 위한 Rendium Engine 아키텍처 및 manifest 경계 정리.

## 맥락

이전 아키텍처는 `background`를 타임라인 콘텐츠인 것처럼 취급하여 전역 렌더 설정과 시간 기반 레이어 사이의 경계를 모호하게 만들었습니다.
이로 인해 프로젝트 지속 시간(duration) 결합, undo/redo 정규화 및 렌더 패스(render-pass) 설정이 불필요하게 복잡해졌습니다.

## 결정 사항

모든 비시간적(non-temporal) 캔버스 구성을 `IProjectManifest` 프로젝트 수준의 필드로 이동합니다.

### 1. 프로젝트 소유 전역 설정
다음 값들은 레이어가 아닌 프로젝트 manifest에서 소유합니다:
- `canvasSize`
- `canvasBackgroundColor`
- `watermark`
- `exportRange`
- `workArea`
- `meta`

### 2. 시간 기반 콘텐츠용 타임라인 레이어
`startTime`과 `duration`을 가진 값들만 `layers`에 유지됩니다.
- 시간 범위가 있는 전체 화면 오버레이는 여전히 레이어입니다.
- 항상 켜져 있는 오버레이는 프로젝트 설정입니다.
- 기존의 전용 `background` 레이어는 제거됩니다.

### 3. 렌더 경로 단순화
캔버스 배경 렌더링은 렌더 패스 클리어(clear) 구성으로 처리됩니다.
- 렌더러는 더 이상 배경 레이어 인스턴스를 필요로 하지 않습니다.
- 익스포트 및 프리뷰 흐름은 동일한 전역 배경 소스를 공유합니다.
- `normalizeInfiniteLayers()`는 더 이상 배경 워크플로우의 일부가 아닙니다.

## 결과 및 영향

- 프로젝트 수준의 설정과 타임라인 콘텐츠 간의 소유권 경계가 명확해집니다.
- 배경 정규화가 레이어 변형(mutation)에 섞이지 않아 undo/redo 히스토리가 더 간단해집니다.
- 시퀀스 설정이 클립과 격리되어 존재하는 NLE 스타일 프로젝트 모델과 정렬됩니다.
- 배경 그리기가 추가적인 레이어 패스 대신 클리어 단계가 되므로 렌더 패스 비용이 낮아집니다.

## 참고

- 이 ADR은 이전에 제거된 마이그레이션 메모에서 추적되던 마이그레이션을 아카이브합니다.
- 표준 아키텍처는 이제 [ARCHITECTURE.md](../../ko/ARCHITECTURE.md)에서 설명합니다.
