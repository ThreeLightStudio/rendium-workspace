# Conventions

이 디렉터리는 `rendium-workspace` 전체에 적용되는 공통 개발 컨벤션을 정의한다.

루트 컨벤션은 모든 패키지의 기본값이다. 패키지별 `_docs/conventions` 또는 `.agentrules.yml`이 더 구체적인 규칙을 제공하면, 해당 bounded context 안에서는 패키지 규칙을 우선한다.

## 적용 범위

- TypeScript 공통 스타일과 안전성 기준
- 테스트, 검증, 패키지 경계 같은 workspace-wide 규칙
- 에이전트와 사람이 함께 참고할 수 있는 판단 기준

## 우선순위

규칙이 충돌할 때는 다음 순서를 따른다.

1. 명시적인 사용자 요청
2. 패키지 `.agentrules.yml`
3. 패키지 `_docs/conventions/*`
4. 루트 `.agentrules.yml`
5. 루트 `_docs/conventions/*`

## 문서 목록

- [`typescript.md`](./typescript.md): 모든 TypeScript 코드에 적용되는 기본 컨벤션
- [`comments.md`](./comments.md): 코드와 문서에 적용되는 주석 및 follow-up 기록 컨벤션
