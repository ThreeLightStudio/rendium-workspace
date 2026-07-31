# ADR-002: Introduction of Intent-Driven Architecture

[한국어](../ko/002-intent-driven-architecture.md)

> **Status**: Accepted  
> **Date**: 2026-04-14  
> **Author**: Automated Migration  

---

## Context

The Rendium Engine had established a Single Source of Truth (SSOT) centered around `IProjectManifest`, but it had a **tight coupling** structure where UI components (`desktop-studio`) directly called `ManifestMutators` inside the engine to change state.

### Problems
1. Mutators such as `mutateLayerProps`, `addLayer`, `removeLayer`, `mutateLayerOrder`, and `mutateProjectMeta` were directly imported at the top of UI files.
2. When adding new features, the UI code had to know the Immer draft manipulation logic.
3. Automation scripts (macros / AI agents) had to write the duplicate mutation logic, which was inefficient.

---

## Decision

Abstract all user interactions into a standardized TypeScript Discriminated Union called **`EngineIntent`**, and introduce an **Intent Router** inside the `EngineStore` to clearly separate the API boundary between the UI and the Engine.

### Changed Architectural Flow

```
[As-Is]  UI → Import ManifestMutators directly → EngineStore.dispatch(recipe)
[To-Be]  UI → Create EngineIntent object → EngineStore.dispatchIntent(intent) → Intent Router → ManifestMutators
```

---

## Implementation

### Step 1: Define Contracts
- **File**: `packages/rendium-engine/src/_contracts/intents.contracts.ts`
- Defined 12 intent interfaces (6 for Layer Properties, 3 for Lifecycle, 2 for Project, 1 for UI-Only)
- Split into `EngineIntent` (persisted) and `TransientIntent` (non-persisted) unions
- Created `INTENT_TYPES` constant object and `isNonPersistedIntent()` type guard

### Step 2: Introduce Intent Router
- **File**: `packages/rendium-engine/src/store/EngineStore.ts`
- `dispatchIntent(intent: EngineIntent)` — Public API
- `dispatchTransient(intent: TransientIntent)` — Draft-Commit 60 FPS preview
- `_routeIntent()` — Private exhaustive switch/case router
- `_handleNonPersisted()` — Handles non-saved actions such as `HOVER_LAYER`

### Step 3: Refactor UI Layer
- **Affected Files**: `Inspector.tsx`, `Timeline.tsx`, `RightPanel.tsx`
- `StudioEditor.tsx` — `mutateProjectMeta` → `RENAME_PROJECT` intent
- `useTimelineDrag.ts` — `mutateLayerOrder` → `REORDER_LAYER` intent
- `useEngineStore.ts` — Added `dispatchIntent`/`dispatchTransient` to hook return values
- **`packages/rendium-engine/src/index.ts`** — Removed deprecated legacy mutators (`addLayer`, `removeLayer`, etc.) and related types from the public API (encapsulation)

---

## Consequences

### Advantages
- **UI Simplification**: UI components do not need to know about Immer, ManifestMutators, or draft manipulation logic at all.
- **Automation Support**: User edits can be 100% emulated using only arrays of intent objects.
- **Living Specification**: The `EngineIntent` TypeScript interface acts as the feature specification.
- **Compile-time Safety**: Exhaustive switch + `never` type detects missing intent handlers during compilation.
- **Backward Compatibility**: Kept the existing `dispatch(recipe)` API as deprecated to support gradual migration.

### Precautions
- `dispatch(recipe)` and `legacyDispatch()` are deprecated and must not be used in new code.
- When adding a new user action, define the intent interface in `intents.contracts.ts` first, then add the case to the Intent Router.

---

## Verification

- `npx tsc --noEmit` (engine) — ✅ 0 errors
- `npx tsc --noEmit` (desktop-studio) — ✅ 0 errors
- `pnpm build` (engine) — ✅ Build succeeded
- Direct imports of ManifestMutators in UI — ✅ 0 instances (completely removed)
