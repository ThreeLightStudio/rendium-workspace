# TypeScript Conventions

[English](../en/typescript.md)

이 문서는 `rendium-workspace`의 모든 TypeScript 코드에 적용되는 공통 기본값을 정의한다.

패키지별 아키텍처, 도메인 용어, 런타임 제약은 각 패키지 README, `.agentrules.yml`, 또는 패키지 `_docs` 문서를 우선한다.

## 기본 원칙

### 명시적인 TypeScript

코드는 타입 추론에만 기대기보다, 중요한 함수 및 메서드 경계에서 입력과 출력의 의미가 읽히도록 작성한다.

Bad:

```ts
export function apply(value, state) {
  return state.update(value);
}
```

Good:

```ts
export interface ApplyLayerPatchInput {
  patch: LayerPatch;
  manifest: IProjectManifest;
}

export function applyLayerPatch(input: ApplyLayerPatchInput): IProjectManifest {
  return updateLayerManifest(input);
}
```

### 타입 안전성

타입 안정성을 낮추는 우회보다, 데이터를 `unknown`에서 시작해 명시적으로 좁히고 검증하는 코드를 선호한다.

Bad:

```ts
const payload = JSON.parse(raw) as ProjectManifest;
return payload.layers[id];
```

Good:

```ts
const payload: unknown = JSON.parse(raw);

if (!isProjectManifest(payload)) {
  throw new Error('Invalid project manifest payload.');
}

return payload.layers[id];
```

### Side Effect Boundary

순수 로직과 파일 I/O, 네트워크 I/O, 프로세스 실행 같은 부수 효과를 가능한 한 분리한다.

Bad:

```ts
export function normalizeManifestFile(path: string): IProjectManifest {
  const raw = readFileSync(path, 'utf8');
  return normalizeProjectManifest(JSON.parse(raw));
}
```

Good:

```ts
export function normalizeManifest(input: unknown): IProjectManifest {
  return normalizeProjectManifest(input);
}

export function readManifestFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
```

### Contract Data

DTO, manifest, configuration, schema result 같은 계약형 데이터는 불변 값처럼 다룬다.

이는 contract data가 변경되지 않는다는 뜻이 아니다. 변경이 필요하면 기존 객체를 직접 수정하지 않고, 새 값이나 명시적인 patch 결과로 교체한다. package-local mutator, Immer `WritableDraft`, builder처럼 의도적으로 mutable boundary를 둔 경우에는 해당 bounded context의 규칙을 따른다.

Bad:

```ts
export interface RenameProjectInput {
  manifest: IProjectManifest;
  name: string;
}

export function renameProject(input: RenameProjectInput): IProjectManifest {
  const { manifest, name } = input;

  manifest.project.name = name;
  return manifest;
}
```

Good:

```ts
export interface RenameProjectInput {
  manifest: IProjectManifest;
  name: string;
}

export function renameProject(input: RenameProjectInput): IProjectManifest {
  const { manifest, name } = input;

  return {
    ...manifest,
    project: {
      ...manifest.project,
      name,
    },
  };
}
```

### Package Boundary

패키지 경계를 넘을 때는 내부 파일 경로보다 공개 API와 기존 workspace utility를 우선한다.

Bad:

```ts
import { normalizeProjectManifest } from '@rendium/engine/src/store/ProjectManifestMigration';
```

Good:

```ts
import { normalizeProjectManifest } from '@rendium/engine';
```

공개 API가 없어서 내부 경로 접근이 필요해 보이면, 먼저 owning package의 export surface가 의도적으로 닫혀 있는지 확인한다.

## 타입 사용

### `any`

명시적인 `any`는 production code에서 금지한다.

- 외부 입력, 파싱 결과, 동적 데이터는 `unknown`에서 시작한다.
- 테스트에서 private state나 불완전한 fixture를 다뤄야 하는 경우에도 `as unknown as TargetType` 또는 작은 test helper로 격리한다.
- `as any`는 사용하지 않는다.

Bad:

```ts
function readLayer(value: any): ILayerManifest {
  return value.layer;
}
```

Good:

```ts
function readLayer(value: unknown): ILayerManifest {
  if (!isLayerEnvelope(value)) {
    throw new Error('Invalid layer envelope.');
  }

  return value.layer;
}
```

### Type Assertion

타입 단언은 가능한 한 피한다. 런타임 검증, type guard, discriminated union, generic constraint로 표현할 수 있으면 그 방법을 우선한다.

허용 가능한 단언은 다음처럼 좁은 경계에 둔다.

- `as const`
- tuple literal 고정
- 런타임 검증 직후 TypeScript가 알지 못하는 값을 연결하는 bridge
- Electron IPC, DOM, 외부 API처럼 타입 시스템 밖의 경계
- 테스트 fixture에서의 제한적 단언

Bad:

```ts
const action = JSON.parse(raw) as EngineIntent;
handleIntent(action);
```

Good:

```ts
const action: unknown = JSON.parse(raw);

if (!isEngineIntent(action)) {
  throw new Error('Invalid engine intent.');
}

handleIntent(action);
```

### `interface` vs `type`

`interface`는 object shape와 공개 contract에 사용한다.

```ts
export interface ProjectAssetRecord {
  id: string;
  kind: ProjectAssetKind;
  status: AssetStatus;
}
```

`type`은 union, discriminated union, primitive alias, tuple, mapped type, conditional type, function type에 사용한다.

```ts
export type AssetStatus = 'pending' | 'ready' | 'failed';

export type TimelineSeekHandler = (timeSeconds: number) => void;
```

기존 패키지의 `I*` prefix 스타일은 존중한다. 루트 컨벤션은 새 이름 규칙을 강제하지 않는다.

parameter object와 public object contract는 `interface`를 기본값으로 둔다. 다만 union, intersection, utility type 기반 조합, framework-local convention이 더 적합한 경우에는 `type`을 사용할 수 있다.

### 함수 및 메서드 경계

exported function, public method, package boundary를 넘는 callback은 입력과 출력 타입을 명시한다.

Bad:

```ts
export const createCommand = (kind, payload) => ({
  kind,
  payload,
});
```

Good:

```ts
export interface CreateCommandInput {
  kind: ProductCommandKind;
  payload: ProductCommandPayload;
}

export function createCommand(input: CreateCommandInput): ProductCommand {
  return {
    kind: input.kind,
    payload: input.payload,
  };
}
```

### 함수 Parameters

production code의 exported function, public method, business function은 parameters가 2개 이상이면 named parameter object로 묶는 것을 기본값으로 한다.

Bad:

```ts
export function moveLayer(
  manifest: IProjectManifest,
  layerId: LayerId,
  targetIndex: number,
): IProjectManifest {
  return reorderLayer(manifest, layerId, targetIndex);
}
```

Good:

```ts
export interface MoveLayerInput {
  manifest: IProjectManifest;
  layerId: LayerId;
  targetIndex: number;
}

export function moveLayer(input: MoveLayerInput): IProjectManifest {
  return reorderLayer(input);
}
```

특히 같은 타입의 parameter가 반복되거나 optional parameter가 섞이면 반드시 object로 묶는다.

Bad:

```ts
export function createRange(start: number, end: number, fallbackStart?: number): TimeRange {
  return { start, end, fallbackStart };
}
```

Good:

```ts
export interface CreateRangeInput {
  start: number;
  end: number;
  fallbackStart?: number;
}

export function createRange(input: CreateRangeInput): TimeRange {
  return {
    start: input.start,
    end: input.end,
    fallbackStart: input.fallbackStart,
  };
}
```

다음과 같은 특수 케이스는 예외로 둘 수 있다.

- `compare(a, b)`, `clamp(value, min, max)`처럼 널리 알려진 수학/정렬 utility
- array callback, event handler, framework callback처럼 외부 API signature가 정해진 함수
- 매우 작은 local helper이고 parameter 의미가 타입과 이름만으로 충분히 명확한 경우
- React component props와 hook API처럼 별도 React convention이 우선하는 경우

## 함수와 모듈

### 단일 책임

하나의 함수는 한 가지 판단 또는 변환을 담당한다. 함수명이 조건과 절차를 길게 설명하기 시작하면, 책임 분리를 검토한다.

Bad:

```ts
function validateAndNormalizeAndPersistProjectManifest(input: unknown): IProjectManifest {
  const manifest = normalizeProjectManifest(input);
  saveManifest(manifest);
  return manifest;
}
```

Good:

```ts
function normalizeValidManifest(input: unknown): IProjectManifest {
  assertProjectManifestInput(input);
  return normalizeProjectManifest(input);
}

function persistManifest(manifest: IProjectManifest): void {
  saveManifest(manifest);
}
```

### Utility Ownership

공통 utility는 특정 비즈니스 용어에 묶이지 않게 만들고, 도메인 helper는 owning context 안에 둔다.

Bad:

```ts
export function sortLayersByProjectAssetName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}
```

Good:

```ts
export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}
```

도메인 context 안에서는 `layer`, `manifest`, `sequence` 같은 소유 용어를 사용해도 된다.

### Pure Utility Boundary

순수 TypeScript utility와 비즈니스 로직은 가능한 한 분리한다.

- 순수 utility는 domain type, store, runtime service, file I/O를 import하지 않는다.
- 순수 utility는 입력만으로 결과가 결정되며, 같은 입력에 대해 같은 출력을 반환한다.
- 비즈니스 로직은 domain language를 사용해도 되지만, generic utility 디렉터리로 올라가지 않는다.
- generic utility가 특정 패키지의 도메인 용어를 필요로 하기 시작하면 owning context 안의 helper로 둔다.

Bad:

```ts
export function sortLayersByTimelineOrder(manifest: IProjectManifest): ILayerManifest[] {
  return manifest.layerOrder.map((id) => manifest.layers[id]).filter(Boolean);
}
```

Good:

```ts
export interface SortByOrderInput<T> {
  items: readonly T[];
  order: readonly string[];
  getId: (item: T) => string;
}

export function sortByOrder<T>(input: SortByOrderInput<T>): T[] {
  const orderIndex = new Map(input.order.map((id, index) => [id, index]));

  return [...input.items].sort((a, b) => {
    return (
      (orderIndex.get(input.getId(a)) ?? Infinity) -
      (orderIndex.get(input.getId(b)) ?? Infinity)
    );
  });
}
```

### 예측 가능한 공유 함수

공유 함수는 호출자가 예측할 수 있는 입력과 출력을 갖게 한다.

Bad:

```ts
export function getLayer(id: LayerId): ILayerManifest | undefined {
  return engineStore.getManifest().layers[id];
}
```

Good:

```ts
export interface GetLayerInput {
  manifest: IProjectManifest;
  layerId: LayerId;
}

export function getLayer(input: GetLayerInput): ILayerManifest | undefined {
  return input.manifest.layers[input.layerId];
}
```

### 추상화

넓은 helper보다 소유 context가 분명한 작은 utility를 선호한다. 불필요한 class, inheritance, framework-style abstraction은 만들지 않는다.

## 주석

주석은 [`comments.md`](./comments.md)를 따른다.

TypeScript 코드에서는 특히 다음을 지킨다.

- type assertion, validation bypass, compatibility fallback에는 Why와 trade-off를 남긴다.
- 후속 논의나 작업이 필요한 주석은 owning context의 `_docs/issues` 문서로 연결한다.
- What 주석이 필요한 함수는 단위 테스트나 좁은 integration test를 함께 둔다.

## Validation

### 검증 위치

외부 입력 경계에서는 entrypoint, adapter, parser가 validation을 담당한다. 비즈니스 로직 내부는 가능한 한 검증된 타입을 받도록 설계한다.

Bad:

```ts
export function addLayer(input: unknown): IProjectManifest {
  const layer = input as ILayerManifest;
  return engineStore.addLayer(layer);
}
```

Good:

```ts
export function parseLayerInput(input: unknown): ILayerManifest {
  if (!isLayerManifest(input)) {
    throw new Error('Invalid layer input.');
  }

  return input;
}

export function addLayer(layer: ILayerManifest): IProjectManifest {
  return engineStore.addLayer(layer);
}
```

### Public API Invariant

public function이나 public method는 호출자가 쉽게 깨뜨릴 수 있는 invariant를 방어한다. private/internal 함수는 타입과 이름으로 전제를 드러내고, 중복 validation을 피한다.

## 오류 처리

### Silent Failure 금지

실패할 수 있는 경계에서는 오류를 삼키지 않는다. 호출자가 처리할 수 있는 결과를 반환하거나, 충분한 context를 담아 오류를 던진다.

Bad:

```ts
try {
  return parseAction(raw);
} catch {
  return null;
}
```

Good:

```ts
try {
  return parseAction(raw);
} catch (error) {
  throw new Error('Failed to parse assistant action.', { cause: error });
}
```

### 오류 메시지와 로깅

- 사용자에게 보여줄 오류와 내부 진단용 오류를 구분한다.
- 오류 메시지에는 실패한 작업과 원인 추적에 필요한 context를 포함한다.
- 로깅은 패키지의 runtime boundary와 logging policy를 따른다.
- 원인을 잃는 catch-and-rethrow 패턴은 피한다.

Bad:

```ts
catch {
  throw new Error('Failed.');
}
```

Good:

```ts
catch (error) {
  logger.error('Export preparation failed.', { exportId, originPath, error });
  throw new Error(`Failed to prepare export: ${originPath}`, { cause: error });
}
```

## 비목표

- React component pattern은 이 문서에서 정의하지 않는다.
- 선언형, OOP, functional style 같은 패러다임을 workspace-wide 규칙으로 고정하지 않는다.
- 패키지별 아키텍처와 도메인 용어를 이 문서에 복제하지 않는다.
