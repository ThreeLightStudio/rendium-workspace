# Rendium Desktop Studio

[English](./README.md) | 한국어

Electron, React, 독립된 선언적 TypeScript 미디어 엔진으로 만든 무료 로컬 영상 편집기입니다. 로그인 없이 사용할 수 있습니다.

로컬 미디어 가져오기 → 타임라인 편집 → 장면 미리보기 → 로컬 MP4 내보내기를 지향합니다. 공개 소스에서 다음 세 가지 구현 경로를 확인할 수 있습니다.

- **편집 상태:** 타입으로 정의한 인텐트, 불변 매니페스트, 패치 동기화, 실행 취소/다시 실행. [변경 파이프라인](./packages/rendium-engine/src/store/EngineStore.ts) · [계약 테스트](./packages/rendium-engine/src/__tests__/verification.test.ts)
- **렌더링:** 레이어 ID 조회, 런타임 레이어 순서 관리, 동기화 오류 복구. [Reconciler](./packages/rendium-engine/src/timeline/SceneReconciler.ts) · [복구·순서 테스트](./packages/rendium-engine/src/__tests__/SceneReconciler.test.ts)
- **미디어 출력:** WebCodecs 인코딩, MP4 먹싱, Electron IPC를 통한 청크 파일 쓰기. [내보내기 파이프라인](./apps/desktop-studio/src/renderer/src/pipeline/WebCodecsPipeline.ts) · [파일 처리](./apps/desktop-studio/src/main/index.ts)

## 현재 상태와 범위

소스 단계의 프로젝트이며 워크스페이스 패키지 버전은 `0.1.0`입니다. 2026년 10월 2일 기준 GitHub Releases와 해당 릴리스의 설치 파일은 없습니다. 엔진은 [공개 워크스페이스 소스](./packages/rendium-engine/README.ko.md)로 제공됩니다. 패키지 설정만으로 npm 배포나 안정된 SDK 계약을 확인할 수는 없습니다.

핵심 편집·미디어 출력 경로는 로컬에서 처리합니다. 공개 OSS 작업 흐름에서는 AI 채팅과 퀵프롬프트 진입점이 비활성화되어 있습니다. 남아 있는 파서, 프로바이더 파일, 테스트, 과거 AI 설계 문서가 현재 사용 가능한 기능을 뜻하지는 않습니다. [OSS UI 제한](./apps/desktop-studio/src/renderer/src/components/RightPanel.tsx)과 [범위 결정](./TODO.md)을 참고하세요. 선택형 프로바이더를 다시 연결한다면 어떤 메시지, 편집기 문맥, 제출한 이미지가 기기 밖으로 전송되는지 안내해야 합니다.

[릴리스 범위](./RELEASE_SCOPE.md)는 가져오기 → 편집 → 미리보기 → 내보내기의 인수 검증 체크리스트를 정의합니다. 완료된 기기 검증 보고서는 아닙니다. 타임라인 UX는 계속 다듬는 영역이며([TODO §4.10](./TODO.md#410-timeline-ux-폴리시-v1-필수--옵션-a)), 전문 NLE 수준의 기능과 폭넓은 코덱 호환성은 해당 릴리스 범위에 포함되지 않습니다.

## 편집 한 번이 인텐트에서 장면까지 전달되는 과정

`appearance.opacity`가 `1`인 기존 레이어 `image-1`의 불투명도를 확정 변경할 때 다음 엔진 진입점을 사용할 수 있습니다.

```ts
import { engineStore } from '@rendium/engine';

engineStore.dispatchIntent({
  type: 'CHANGE_OPACITY',
  layerId: 'image-1',
  opacity: 0.5,
});
```

1. [`EngineIntent`](./packages/rendium-engine/src/_contracts/intents.contracts.ts)가 입력 형식을 정의하고, `dispatchIntent`가 라우팅 전에 입력을 검증합니다.
2. [`IntentRouter`](./packages/rendium-engine/src/store/IntentRouter.ts)가 Immer recipe 안에서 `layers['image-1'].appearance.opacity`를 변경합니다. [`EngineStore`](./packages/rendium-engine/src/store/EngineStore.ts)는 다음 매니페스트와 정방향·역방향 패치를 생성하고, 이력을 기록한 뒤 장면에 패치를 전달합니다.
3. 이때 패치는 `{ op: 'replace', path: ['layers', 'image-1', 'appearance', 'opacity'], value: 0.5 }` 형태입니다. [`SceneReconciler`](./packages/rendium-engine/src/timeline/SceneReconciler.ts)가 ID로 런타임 레이어를 찾아 `updateConfig({ opacity: 0.5 })`를 적용합니다.
4. React는 [`useSyncExternalStore`](./apps/desktop-studio/src/renderer/src/hooks/useEngineStore.ts)를 통해 엔진 스냅샷을 읽습니다. 실행 취소/다시 실행은 기록된 패치를 사용합니다. [엔진 테스트](./packages/rendium-engine/src/__tests__/verification.test.ts)에 영속 변경, 묶음 변경, 임시 미리보기 동작이 정의되어 있습니다.

이 예제는 공개 계약을 설명하며, 레이어를 먼저 생성해야 사용할 수 있습니다. 드래그나 슬라이더 미리보기 중에는 `dispatchTransient`가 매니페스트 이력을 추가하지 않고 런타임 상태를 바꿉니다. 최종 인텐트를 확정하면 실행 취소 단계가 만들어집니다.

## 미디어가 파일로 저장되는 과정

시각 미디어와 오디오 레이어가 있는 타임라인에서 [`useExport`](./apps/desktop-studio/src/renderer/src/hooks/useExport.ts)는 장면과 선택한 출력 프로필을 `WebCodecsPipeline`에 전달합니다.

1. `prepareExport()`가 [preload 브리지](./apps/desktop-studio/src/preload/index.ts)를 거칩니다. [메인 프로세스](./apps/desktop-studio/src/main/index.ts)는 저장 대화상자를 열고, 선택한 로컬 파일을 생성한 뒤 내보내기 ID를 반환합니다.
2. [파이프라인](./apps/desktop-studio/src/renderer/src/pipeline/WebCodecsPipeline.ts)은 WebGPU 기기를 요청하고 프레임을 렌더링해 `VideoEncoder`로 전달합니다. 오디오 레이어가 있으면 `AudioEncoder`도 사용합니다. 인코딩된 영상·오디오 청크는 `mp4-muxer`로 들어갑니다.
3. 먹서의 청크 단위 `StreamTarget`이 `writeExportChunk(exportId, buffer, position)`을 호출합니다. Electron 메인 프로세스는 전달받은 위치에 각 청크를 씁니다.
4. 마무리 단계에서 인코더를 flush하고 MP4 메타데이터를 완성한 뒤, IPC로 파일 동기화와 닫기를 요청합니다. 저장 대화상자에서 선택한 경로가 출력 목적지입니다.

이 구조는 렌더러에서 완성된 MP4 전체 버퍼를 만드는 대신 먹싱된 출력을 점진적으로 전달합니다. 메모리 사용량의 상한, 하드웨어 가속, 내보내기 중 60fps를 보장하는 근거는 아닙니다. 파이프라인은 `prefer-hardware`를 요청하며 실제 동작은 코덱·GPU·기기 지원에 달려 있습니다. [`useExport` 테스트](./apps/desktop-studio/src/renderer/src/hooks/useExport.test.tsx)는 파이프라인을 모킹하므로 실제 인코더부터 파일까지의 인수 검증 근거가 아닙니다.

## 설계 결정과 비용

| 결정 | 이유 | 경계 또는 비용 |
| --- | --- | --- |
| 타입으로 정의한 인텐트가 매니페스트를 바꾸고, 장면은 패치를 반영합니다. | 편집 명령을 런타임 객체와 분리하고 영속 변경의 정방향·역방향 이력을 남깁니다. | 매니페스트와 런타임의 동기화를 유지해야 하며, 복구 시 장면을 다시 만들 수 있습니다. [Store](./packages/rendium-engine/src/store/EngineStore.ts) · [복구 테스트](./packages/rendium-engine/src/__tests__/SceneReconciler.test.ts) |
| 임시 미리보기와 확정 변경을 분리합니다. | 포인터가 움직일 때마다 실행 취소 항목이 생기는 일을 피합니다. | UI가 최종 변경을 명시적으로 확정해야 합니다. [미리보기·확정 테스트](./packages/rendium-engine/src/__tests__/verification.test.ts) |
| 레이어 ID 레지스트리와 순서 배열을 따로 둡니다. | 속성 패치가 레이어를 직접 찾고, 순서 변경 시 기존 런타임 인스턴스를 재사용합니다. | O(1) 설명은 레이어 ID 레지스트리 접근에 한정됩니다. 동기화는 패치를 순회하며, 순서 변경은 배열을 다시 구성하므로 전체 동기화가 O(1)은 아닙니다. [Scene](./packages/rendium-engine/src/core/Scene.ts) · [Reconciler](./packages/rendium-engine/src/timeline/SceneReconciler.ts) |

## 소스로 실행하기

[CI 설정](./.github/workflows/ci.yml)은 Node.js 20과 pnpm 10.33.0을 사용하고, [루트 패키지](./package.json)는 pnpm 10.33.0을 지정합니다. 워크스페이스 루트에서 실행합니다.

```sh
pnpm install
pnpm dev:studio
```

엔진 테스트와 앱 빌드 명령은 다음과 같습니다.

```sh
pnpm test:engine
pnpm build:studio
```

위 명령은 [워크스페이스 스크립트](./package.json)에 정의되어 있습니다. 새 환경의 설치 성공을 보장한다는 뜻은 아닙니다. 공개 기준 커밋 `3bfabbf7725cda8904f4dd8518c1edda1a59b074`의 [CI 실행](https://github.com/ThreeLightStudio/rendium-workspace/actions/runs/30613854869)은 의존성 설치 단계에서 실패해 검증을 건너뛰었습니다. 검증 통과도, 코드 테스트 실패 관측도 아닙니다.

`pnpm verify`는 `pnpm check`, `pnpm check:data-f:all`, 워크스페이스 테스트·빌드를 실행합니다. **`check`는 `biome check --write .`를 사용하므로 파일을 수정할 수 있습니다.** 변경 사항이 없는 별도 체크아웃에서 실행하세요. 데스크톱 개발 과정에는 Panda CSS 코드 생성도 포함됩니다. Storybook과 플랫폼별 패키징 명령은 [앱 가이드](./apps/desktop-studio/README.ko.md)를 참고하세요. 패키징 스크립트가 있다는 사실은 설치 파일 배포를 뜻하지 않습니다.

## 문서와 기여 진입점

API를 확인할 때는 현재 계약과 구현을 먼저 읽으세요. 과거 ADR은 당시 결정을 설명하며 현재 계약과 다를 수 있습니다. 이전 문서의 성능 표현도 벤치마크 결과로 받아들이면 안 됩니다.

- **현재 엔진 읽기 경로:** [엔진 가이드](./packages/rendium-engine/README.ko.md) · [온보딩](./packages/rendium-engine/_docs/onboarding/ko/README.md) · [아키텍처 개요](./packages/rendium-engine/_docs/ko/ARCHITECTURE.md)
- **앱과 기술 설정:** [Desktop Studio](./apps/desktop-studio/README.ko.md) · [한국어 기술 사양·문제 해결](./docs/ko/technical-spec.md) · [영문 기술 사양](./docs/en/technical-spec.md)
- **설계 이력:** [루트 ADR](./_docs/architecture-decisions/ko) · [엔진 ADR](./packages/rendium-engine/_docs/history-architecture/ko) · [데스크톱 ADR](./apps/desktop-studio/_docs/history-architecture/ko) · [앱 셸·AI 유보 기록](./apps/desktop-studio/_docs/history-architecture/ko/README.md)
- **기여 도구:** [컨벤션](./_docs/conventions/ko) · [에이전트 프롬프트 도구와 CLI](./packages/agent-tools/README.ko.md) · [기여 안내](./CONTRIBUTING.md)

`agent-tools`는 루트·패키지 규칙을 읽고 검증하며 필수 읽기 문서를 포함한 프롬프트를 생성합니다. 아키텍처 제약을 전달하는 도구이며, 에이전트의 준수나 회귀 버그 방지를 보장하지는 않습니다. [Loader](./packages/agent-tools/src/ConfigLoader.ts) · [Schema](./packages/agent-tools/src/AgentRulesSchema.ts) · [Renderer](./packages/agent-tools/src/PromptRenderer.ts)
