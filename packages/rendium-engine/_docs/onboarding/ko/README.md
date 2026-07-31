# Rendium Engine Onboarding

[English](../en/README.md)

이 디렉터리는 `@rendium/engine`을 수정하기 전에 반드시 읽어야 하는 현재형 작업 문서다.

Historical ADR은 의사결정의 배경을 설명하지만, 실제 구현 판단은 이 디렉터리의 문서를 우선한다.

## Required Reading Order

1. `core-layer-onboarding.md`
   - canonical manifest, `LayerKind`, source/link/control policy, runtime factory, reconciliation 기준을 설명한다.
2. `visual-layer-provider-onboarding.md`
   - visual runtime을 `VisualLayer + DrawableProvider`로 확장하는 방법을 설명한다.

## Current Rules

- 새 top-level layer kind를 추가하지 않는다. 기본값은 항상 `visual | audio | control` 중 하나다.
- 새 visual 요소는 layer subclass가 아니라 drawable provider로 추가한다.
- legacy manifest compatibility shim을 추가하지 않는다.
- source identity, layer identity, link relationship, scope marker semantics를 섞지 않는다.
- `packages/rendium-engine/_docs/history-architecture` 문서는 배경 자료이며 현재 구현 규칙의 우선순위는 이 onboarding 문서가 높다.
