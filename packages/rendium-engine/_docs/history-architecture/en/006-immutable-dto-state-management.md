# 002: Immutable DTO-based State Management & Serialization

[한국어](../ko/006-immutable-dto-state-management.md)

- **Status**: Accepted & Implemented (Phase 1 & 2)
- **Date**: 2026-04-12
- **Context**: [ADR 007: Global Canvas Attributes Migration](./007-global-canvas-attributes-migration.md)

## Context & Problem Statement

The previous Rendium Engine architecture relied on a "Runtime State Dump" for serialization, which included hardware-dependent objects (GPU/Audio handles) and derived data (matrices). This led to:
1. Massive data redundancy in project files.
2. Impossibility of implementing a robust Undo/Redo system due to direct mutation of engine instances.
3. Tight coupling between the UI layer (Store) and the Runtime Engine (Scene).

## Decision

Migrate to a **Single Source of Truth (SSOT)** based on an immutable, normalized Data Transfer Object (DTO) called `IProjectManifest`.

### 1. Normalized State Structure
Instead of a flat array of layers, the manifest uses a Record for properties and a separate array for Z-order:
- `layers: Record<LayerId, ILayerManifest>`: Ensures O(1) attribute access and stable patch paths.
- `layerOrder: LayerId[]`: The source of truth for rendering sequence.
- This prevents "Patch Explosions" where inserting one layer shift all subsequent indices in a flat array.

### 2. Immutable Mutation via Immer
- All state changes are performed through `EngineStore.dispatchIntent(intent)` and `EngineStore.executeAtomicIntentBatch(intents)`.
- Immer's `produceWithPatches` automatically generates RFC 6902 JSON Patches.
- Forward patches are used to sync the engine; inverse patches are stored in the `HistoryStack` for Undo functionality.

### 3. SceneReconciler (Direct-Access Reconciler)
- Decouple engine lifecycle from the Store.
- The Reconciler parses patches and applies changes directly to engine instances using an O(1) registry.
- Ensures explicit resource disposal (`dispose()`) when a layer is removed.

### 4. Draft-Commit Pattern
- Transient visual changes (e.g., dragging a slider) bypass the Store and update the engine directly (`applyTransient`).
- Final states are "committed" to the Store via intent routing, creating a single history record.

## Consequence

- **Memory Efficiency**: Patches are minimal (structure sharing).
- **Correctness**: Undo/Redo is mathematically guaranteed by inverse patches.
- **Portability**: Project files (Manifest) are pure JSON and contain zero runtime/hardware references.
- **Scalability**: The Reconciler handles updates at O(1) complexity relative to the change, not O(N) relative to the scene size.

## Implementation Details (Phase 1 & 2)
- `IProjectManifest` version 1.0 defined.
- `EngineStore` refactored to manage Manifest SSOT.
- `ManifestMutators` implemented for type-safe attribute/order isolation.
- `ConsoleDebugger` updated to expose `rd.manifest()` and `rd.history()`.
