# Rendium Desktop Studio

[English](./README.md) | 한국어

`desktop-studio`는 Rendium 프로젝트 편집을 위한 Electron + React 애플리케이션입니다. 렌더러 UI, Electron 쉘 통합, 프로젝트 에셋 저장소, AI 채팅 화면, Storybook 컴포넌트 환경 및 데스크톱 패키징을 소유합니다.

엔진 도메인 동작은 `packages/rendium-engine`에 귀속되며, 렌더러 UI는 엔진의 공개 intent 및 snapshot API를 통해서만 엔진과 통신해야 합니다.

## 설치 및 설정 (Setup)

워크스페이스 루트에서 의존성을 설치합니다:

```bash
pnpm install
```

앱 실행:

```bash
pnpm dev:studio
```

또는 이 패키지 디렉토리 내부에서 직접 실행:

```bash
pnpm dev
```

`predev` 스크립트는 Electron Vite가 구동되기 전 Panda CSS 코드 생성을 미리 실행합니다.

## 공통 스크립트 (Common Scripts)

```bash
pnpm --filter desktop-studio typecheck
pnpm --filter desktop-studio lint
pnpm --filter desktop-studio check
pnpm --filter desktop-studio storybook
pnpm --filter desktop-studio storybook:dev
pnpm --filter desktop-studio build
```

패키징(빌드) 스크립트:

```bash
pnpm --filter desktop-studio build:mac
pnpm --filter desktop-studio build:win
pnpm --filter desktop-studio build:linux
pnpm --filter desktop-studio build:unpack
```

아이콘 생성 스크립트:

```bash
pnpm --filter desktop-studio build:icons
```

## 스타일링 및 스토리북 (Styling & Storybook)

- Panda CSS 코드 생성은 `predev`, `pretypecheck`, `prestorybook`, `postinstall` 단계의 일부로 함께 구동됩니다.
- Panda 코드 생성의 watch 모드와 Storybook을 함께 실행하려면 `storybook:dev` 명령을 이용하십시오.
- 컴포넌트 스토리(Story) 파일은 관리상 실용적인 경우 관련 렌더러 컴포넌트 파일 바로 옆에 위치합니다.

## 셀렉터 앵커 규칙 (Selector Anchors)

- 스크린샷, 자동화 테스트 또는 디버그 툴링에서 식별이 간편해야 하는 렌더러 DOM 앵커에는 `data-f` 속성을 사용하십시오.
- `editor-dispatch-button` 또는 `search-input`처럼 설명적이고 kebab-case인 값을 작성하십시오.
- `data-testid` 보다는 `data-f`를 권장합니다. 신규 렌더러 마크업에 `data-testid`를 새로 도입하지 마십시오.
- 렌더러 JSX 앵커를 변경할 때는 `pnpm --filter desktop-studio check:data-f` 명령을 통해 사전 검사하십시오.

## 제품 아키텍처 문서 및 의사결정 기록 (ADRs)

Rendium의 제품 아키텍처와 설계 역사를 파악하려면 다음 문서를 참조하세요:
- [루트 아키텍처 결정 기록 (ADR-001 ~ 005)](../../_docs/architecture-decisions/ko)
- [코어 엔진 아키텍처 결정 기록 (ADR-001 ~ 011)](../../packages/rendium-engine/_docs/history-architecture/ko)
- [데스크톱 스튜디오 아키텍처 결정 기록 (ADR-001 ~ 005)](./_docs/history-architecture/ko)
