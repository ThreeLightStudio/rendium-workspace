# TypeScript Conventions

[한국어](../ko/typescript.md)

This document defines the common default conventions applied to all TypeScript code in `rendium-workspace`.

Package-specific architectures, domain terms, and runtime constraints defined in package READMEs, `.agentrules.yml`, or package `_docs` documents take precedence.

---

## 1. Core Principles

### Explicit TypeScript
Code should be written so that inputs and outputs are clear at function and method boundaries, rather than relying solely on type inference.

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

### Type Safety
Prefer explicitly narrowing and validating data starting from `unknown`, rather than bypassing type checks.

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
Isolate pure logic from side effects like file I/O, network requests, or process execution as much as possible.

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
Treat contract data (DTOs, manifests, configurations, schema results) as immutable values. If modifications are needed, return a new object or an explicit patch rather than mutating in place.

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
    projectInfo: {
      ...manifest.projectInfo,
      name,
    },
  };
}
```

### Package Boundary
When crossing package boundaries, prioritize public APIs and existing workspace utilities over internal file paths.

Bad:
```ts
import { normalizeProjectManifest } from '@rendium/engine/src/store/ProjectManifestMigration';
```

Good:
```ts
import { normalizeProjectManifest } from '@rendium/engine';
```

If it seems necessary to access internal paths because a public API is missing, first verify if the export surface of the owning package is intentionally closed.

---

## 2. Type Usage

### `any`
Explicit `any` is prohibited in production code.
- Start with `unknown` for external inputs, parsing results, and dynamic data.
- When dealing with private state or incomplete fixtures in tests, isolate them using `as unknown as TargetType` or small test helpers.
- Do not use `as any`.

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
Avoid type assertions as much as possible. Prioritize runtime validation, type guards, discriminated unions, and generic constraints if they can represent the solution.

Allowable assertions are restricted to narrow boundaries:
- `as const`
- Fixing tuple literals
- Bridges connecting values that TypeScript is unaware of immediately after runtime validation
- Boundaries outside the type system like Electron IPC, DOM, and external APIs
- Limited assertions in test fixtures

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
Use `interface` for object shapes and public contracts:
```ts
export interface ProjectAssetRecord {
  id: string;
  kind: ProjectAssetKind;
  status: AssetStatus;
}
```

Use `type` for unions, discriminated unions, primitive aliases, tuples, mapped types, conditional types, and function types:
```ts
export type AssetStatus = 'pending' | 'ready' | 'failed';

export type TimelineSeekHandler = (timeSeconds: number) => void;
```

Respect the existing `I*` prefix style in current packages. Root conventions do not enforce a new naming rule.

Object parameter types and public object contracts should default to `interface`. However, `type` can be used for unions, intersections, combinations based on utility types, or where framework-local conventions are more appropriate.

### Function and Method Boundaries
Exported functions, public methods, and callbacks that cross package boundaries must explicitly declare parameter and return types.

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

### Function Parameters
In production code, exported functions, public methods, and business logic functions with 2 or more parameters should default to using a named parameter object.

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

Specifically, if the same type of parameter is repeated or if optional parameters are mixed in, they must be wrapped in a parameter object.

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

The following special cases may be excluded:
- Widely known mathematical/sorting utilities like `compare(a, b)` and `clamp(value, min, max)`.
- Functions with fixed external API signatures such as array callbacks, event handlers, and framework callbacks.
- Very small local helpers where parameter meanings are clear from their types and names alone.
- React components and hooks where React-specific conventions take precedence.

---

## 3. Functions and Modules

### Single Responsibility
A single function should handle one decision or conversion. If a function name starts describing conditions and procedures at length, consider separating responsibilities.

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
Generic utilities should not be bound to specific business terms, and domain-specific helpers should live inside their owning context.

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

Within a domain context, using domain terms like `layer`, `manifest`, and `sequence` is permitted.

### Pure Utility Boundary
Pure TypeScript utilities and business logic should be separated as much as possible.
- Pure utilities do not import domain types, stores, runtime services, or file I/O.
- Pure utilities return deterministic outputs for given inputs and return the same output for the same input.
- Business logic may use domain language but should not be placed in generic utility directories.
- If a generic utility begins to require domain terms from a specific package, keep it as a helper inside the owning context.

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

### Predictable Shared Functions
Shared functions must have predictable inputs and outputs for the caller.

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

### Abstraction
Prefer small utilities with clear context over large generic helpers. Do not create unnecessary classes, inheritance, or framework-style abstractions.

---

## 4. Comments
Comments should follow the guidelines in [`comments.md`](./comments.md).
Specifically in TypeScript code, ensure:
- Document *why* and what trade-offs were made for type assertions, validation bypasses, and compatibility fallbacks.
- Link comments requiring follow-up discussions or tasks to the `_docs/issues` document in the owning context.
- Functions requiring "What" comments should be accompanied by unit tests or narrow integration tests.

---

## 5. Validation

### Validation Location
At external input boundaries, entry points, adapters, and parsers handle validation. Design business logic internals to receive already-validated types.

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
Public functions or public methods must guard invariants that callers can easily break. Private/internal functions should surface their assumptions via types and naming, avoiding duplicate validation.

---

## 6. Error Handling

### Prevent Silent Failures
Do not swallow errors at failure boundaries. Return values that the caller can handle, or throw errors with sufficient context.

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

### Error Messages and Logging
- Distinguish between user-facing errors and internal diagnostic errors.
- Include the failed operation and the context required to trace the cause in error messages.
- Logging should follow the package's runtime boundary and logging policy.
- Avoid catch-and-rethrow patterns that lose the original cause.

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

---

## 7. Non-goals
- React component patterns are not defined in this document.
- Paradigms such as declarative, OOP, or functional styles are not enforced as workspace-wide rules.
- Do not duplicate package-specific architectures and domain terms into this document.
