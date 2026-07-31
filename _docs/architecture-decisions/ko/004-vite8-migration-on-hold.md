# ADR-004: Vite 8 마이그레이션 보류 결정

[English](../en/004-vite8-migration-on-hold.md)

> **상태**: Deferred  
> **일자**: 2026-04-26  
> **작성자**: Codex  

---

## 컨텍스트 (Context)

`rendium-workspace`의 `desktop-studio`는 Vite 기반 툴체인을 여러 겹으로 사용하고 있습니다.

- 렌더러 및 Storybook은 `vite` 기반으로 동작합니다.
- Electron 런타임은 `electron-vite`를 통해 개발/빌드됩니다.
- 테스트는 `vitest`와 `happy-dom` 기반으로 실행됩니다.

현재 저장소의 의존성 상태를 확인한 결과, `vite 8`로의 즉시 마이그레이션은 주변 툴체인과 충돌할 가능성이 높았습니다.

### 확인된 제약

1. `apps/desktop-studio/package.json`의 Storybook 계열 의존성은 `@storybook/react-vite@8.6.18`과 `storybook@^8.6.18` 조합입니다.
2. 현재 설치된 `@storybook/react-vite@8.6.18` 및 `@storybook/builder-vite@8.6.18`은 peer dependency 상 `vite ^4 || ^5 || ^6`까지만 허용합니다.
3. 현재 설치된 `electron-vite@5.0.0`은 peer dependency 상 `vite ^5 || ^6 || ^7`까지만 허용합니다.
4. 반면 `@vitejs/plugin-react@5.2.0`은 `vite ^8.0.0`까지 허용하지만, 이것만으로 전체 체인이 호환되는 것은 아닙니다.

즉, Vite 자체 플러그인은 준비되어 있어도 Storybook과 Electron 빌드 체인이 아직 마이그레이션을 막고 있습니다.

---

## 결정 (Decision)

`vite 8` 마이그레이션은 현재 시점에서 진행하지 않고 보류합니다.

대신 다음 원칙을 따른다.

- Storybook과 Electron 빌드 툴의 호환 버전이 먼저 확보되지 않으면 Vite 메이저 업그레이드를 수행하지 않는다.
- `desktop-studio`의 Storybook 설정은 현재 안정적으로 동작하는 Vite 7 계열 기준을 유지한다.
- Vite 8 대응 작업은 별도의 의존성 정리 과제로 분리하여 재검토한다.

---

## 구현 상태 (Implementation State)

현재 저장소는 다음 상태를 유지한다.

- `apps/desktop-studio/.storybook/main.ts`는 `@storybook/react-vite` 프레임워크를 사용한다.
- `viteFinal()`에서 alias와 PostCSS 경로를 오버라이드하는 기존 설정을 유지한다.
- `electron-vite` 기반의 `dev`, `build`, `preview` 흐름은 변경하지 않는다.
- 루트 및 앱 패키지의 `vite` 버전은 별도 승인 전까지 상향하지 않는다.

---

## 결과 (Consequences)

### 장점

- 현재 동작 중인 Storybook / Electron / Vitest 흐름을 깨지 않는다.
- peer dependency 충돌로 인한 설치 실패 또는 런타임 오류를 예방한다.
- Vite 8 전환에 필요한 후속 작업 범위를 분리해서 관리할 수 있다.

### 주의점

- Vite 8의 신규 기능과 개선 사항은 즉시 도입하지 못한다.
- Storybook addon 또는 Electron 툴체인에서 `vite 8` 지원이 추가되면 재평가가 필요하다.
- 향후 업그레이드 시에는 `vite`만 올리는 방식이 아니라 Storybook / Electron / 테스트 체인을 함께 검증해야 한다.

---

## 재개 조건 (Revisit Criteria)

다음 조건이 충족되면 Vite 8 마이그레이션을 재개한다.

- Storybook의 `react-vite` 빌더가 `vite 8`을 공식 지원한다.
- `electron-vite`가 `vite 8`을 공식 지원하거나, 이를 대체할 빌드 경로가 준비된다.
- `pnpm install` 이후 peer dependency 경고가 허용 가능한 수준으로 정리된다.
- `desktop-studio`의 Storybook 실행, Electron 개발 실행, 빌드, 테스트가 모두 통과한다.

---

## 검증 (Verification)

이번 결정 자체는 코드 변경이 아니라 아키텍처 기록이므로, 별도 기능 검증은 수행하지 않았다.

향후 재개 시 검증 항목은 다음을 포함해야 한다.

- `pnpm --filter desktop-studio storybook`
- `pnpm --filter desktop-studio dev`
- `pnpm --filter desktop-studio build`
- `pnpm test`
