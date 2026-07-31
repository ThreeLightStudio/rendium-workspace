# @rendium/agent-tools

[English](./README.md) | 한국어

`@rendium/agent-tools`는 `.agentrules.yml` 규칙 파일을 로드하고, 스키마를 검증하며, 루트 규칙과 개별 패키지 규칙을 병합하여 최종 에이전트 프롬프트 텍스트를 렌더링하는 역할을 합니다.

이 패키지는 MAS(Multi-Agent System) 규칙 로딩, 검증 및 프롬프트 렌더링 작업을 위해 격리된 구현 영역입니다.

## 주요 기능

- 워크스페이스 루트의 규칙 파일(`<workspace-root>/.agentrules.yml`)을 저장소 전체 정책의 단일 진실 공급원(SSOT)으로 취급하고 이를 읽습니다.
- 바운디드 컨텍스트(Bounded-context) 오버라이드로서 개별 패키지 디렉토리의 규칙 파일(`<package-dir>/.agentrules.yml`)을 읽습니다.
- 패키지별 `required_reading` 항목을 표면화하여, 에이전트가 코드를 수정하기 전에 먼저 읽어야 하는 문서를 최종 프롬프트에 포함하도록 유도합니다.
- 패키지 규칙 파일이 루트 규칙 파일을 가리키도록 `inheritance.extends` 선언을 요구합니다.
- `principles`, `conventions`, `sops`와 같은 배열 형태의 규칙 항목들을 ID 기반으로 병합하여 루트와 패키지 규칙을 합칩니다.
- 병합된 규칙 결과를 `AgentRulesSchema` 스키마 규격으로 검증합니다.
- `src/templates/base_prompt.hbs` 템플릿을 사용하여 최종 에이전트 프롬프트 텍스트를 렌더링합니다.

## CLI 사용법

저장소 루트에서 다음 래퍼 스크립트를 사용할 수 있습니다:

```bash
pnpm agent -- --package-dir packages/rendium-engine
```

패키지 디렉토리 내부나 하위 디렉토리 내에서 실행할 때는 현재 작업 디렉토리로부터 대상 패키지를 유추할 수 있습니다:

```bash
pnpm agent
```

저장소 루트 디렉토리에서 실행할 때는 항상 `--package-dir`을 지정해야 합니다. 루트 디렉토리는 패키지 컨텍스트가 아닌 공통 정책 공급원이기 때문에 래퍼 스크립트가 대상 패키지를 스스로 유추할 수 없습니다.

빌드 후에는 패키지 직접 CLI 도구도 사용할 수 있습니다:

```bash
pnpm --filter @rendium/agent-tools build
node packages/agent-tools/dist/cli.js \
  --workspace-root . \
  --package-dir packages/rendium-engine
```

옵션:

- `-w, --workspace-root`: 루트 `.agentrules.yml`이 위치한 워크스페이스 루트 경로.
- `-p, --package-dir`: 패키지 `.agentrules.yml`이 위치한 대상 패키지 경로.
- `-h, --help`: 사용법 출력.

## 라이브러리 사용법

```typescript
import { ConfigLoader, PromptRenderer } from '@rendium/agent-tools';

const rules = new ConfigLoader(workspaceRoot, packageDir).load();
const prompt = new PromptRenderer().render(rules);
```

공개 export 사항에는 `AgentRulesSchema`, `ConfigLoader`, `PromptRenderer`, `runCli`, 그리고 스키마에서 파생된 규칙 타입들이 포함되어 있습니다.

## 스키마 참고 사항

- `schema_version`은 현재 `1`입니다.
- `kind`는 반드시 `root` 또는 `package`여야 합니다.
- 패키지 규칙은 반드시 `inheritance.extends` 필드를 포함해야 합니다.
- `principles`, `conventions`, `sops` 내부의 각 ID 값은 고유해야 합니다.
- 각 SOP 내부의 `outputs.key` 값은 고유해야 합니다.

## 검증 (Verification)

패키지 범위의 로컬 검증 명령을 먼저 수행하십시오:

```bash
pnpm --filter @rendium/agent-tools test
pnpm --filter @rendium/agent-tools build
pnpm --filter @rendium/agent-tools check
```

루트 정책, 공유 스크립트, 또는 이 패키지 외부 영역에 영향을 주는 템플릿 수정의 경우에는 루트 `AGENTS.md`에 기재된 워크스페이스 수준의 검증 경로를 이용하십시오.
