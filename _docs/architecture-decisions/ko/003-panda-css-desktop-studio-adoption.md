# ADR-003: desktop-studio 전용 Panda CSS 도입

[English](../en/003-panda-css-desktop-studio-adoption.md)

> **상태**: Accepted  
> **일자**: 2026-04-20  
> **작성자**: Codex  

---

## 컨텍스트 (Context)

`desktop-studio`는 Inspector, Spectrum, Image Tools, Audio/Template 보조 패널 등 UI 계층이 빠르게 확장되어 왔지만, 스타일 표준은 inline style과 전역 CSS, 개별 className이 혼재된 상태였습니다.  
이 구조는 빠른 개발에는 유리하지만, 공통 control primitive와 디자인 토큰을 장기적으로 일관되게 운영하기 어렵습니다.

특히 다음 문제가 있었습니다.

1. 같은 종류의 control이 패널마다 다른 spacing, label, accent color, 상태 표현을 사용함
2. 디자인 규칙이 코드 전반에 흩어져 있어 Inspector UI 확장이 어려움
3. 공통 primitive를 도입하더라도 스타일 기준을 강제할 중심 레이어가 부재함

---

## 결정 (Decision)

`desktop-studio`에만 Panda CSS를 도입하고, 스타일의 기준 레이어를 토큰 + recipe + atomic class 조합으로 이동합니다.  
`packages/rendium-engine`에는 Panda CSS를 도입하지 않습니다.

### 적용 범위

- `apps/desktop-studio` 내부 UI에만 적용한다
- `packages/rendium-engine`에는 적용하지 않는다
- 엔진은 데이터 / 상태 계약에 집중하고, Panda는 표현 계층에서만 사용한다

### 설계 원칙

- 토큰으로 색상, spacing, radius, typography, 상태 색을 정의한다
- recipe로 Inspector primitive의 variant를 정의한다
- UI 컴포넌트는 inline style 대신 Panda의 `css()` / recipe를 우선 사용한다
- Inspector는 공통 primitive를 기반으로 재구성한다
- 공통 UX 규칙은 `apps/desktop-studio/_docs/product/inspector-property-controls.md`를 기준으로 유지한다

---

## 구현 내역 (Implementation)

### Step 1: Panda 설정 추가

- `apps/desktop-studio/panda.config.ts` 추가
- `apps/desktop-studio/postcss.config.cjs` 추가
- `desktop-studio` 전용 토큰을 정의하고, 기존 reset과 충돌을 피하기 위해 `preflight`는 비활성화

### Step 2: 엔트리 CSS 연결

- `apps/desktop-studio/src/renderer/src/index.css`를 추가
- `src/renderer/src/main.tsx`에서 root CSS로 import
- 기존 `main.css`는 유지하면서 Panda PostCSS가 같은 entry를 처리하도록 연결

### Step 3: 경로 및 타입 연결

- `@styled-system/*` alias를 `desktop-studio` 전용으로 추가
- `styled-system` 생성 산출물을 `desktop-studio` 타입 체인에서 인식하도록 연결

### Step 4: 생성 자동화

- `desktop-studio`의 postinstall / build / dev / typecheck 흐름에서 Panda codegen을 실행하도록 연결

---

## 결과 (Consequences)

### 장점

- `desktop-studio` UI의 시각 언어를 토큰 중심으로 통일할 수 있음
- Inspector primitive를 반복 가능한 recipe 기반으로 만들 수 있음
- engine에 스타일 시스템을 끌어오지 않으면서 UI 레이어만 개선 가능

### 주의점

- 초기 도입 시 일부 UI 파일의 마이그레이션 비용이 발생함
- Panda 생성 산출물과 codegen 흐름을 개발자가 이해해야 함
- `styled-system` 생성물은 빌드 / 설치 단계에서 반드시 갱신되어야 함

---

## 검증 (Verification)

- `pnpm --filter desktop-studio typecheck`
- `pnpm --filter desktop-studio build`
- `desktop-studio` dev 서버에서 Panda utility 클래스가 적용되는지 확인
- Inspector 주요 패널의 transient / commit 동작이 유지되는지 확인

---

## 비목표 (Non-goals)

- `packages/rendium-engine`의 스타일 시스템 변경
- 디자인 시스템 외부 패키지화
- UI 기능 동작 자체 변경
- intent / state model 재설계
