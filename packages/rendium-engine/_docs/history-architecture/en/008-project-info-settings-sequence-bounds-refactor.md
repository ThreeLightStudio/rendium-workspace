# ADR 008: Project Info, Settings, and Sequence Bounds Refactor

[한국어](../ko/008-project-info-settings-sequence-bounds-refactor.md)

- **Status**: Accepted & Implemented
- **Date**: 2026-04-17
- **Context**: Rendium Engine architecture cleanup for `projectInfo` / `projectSettings`, sequence bounds derivation, and scope marker semantics.

## Context

The previous architecture kept project-level values split across several top-level manifest fields, while `meta` acted as a broad container for unrelated document data. At the same time, sequence handling, scope interpretation, and root scaffold semantics were spread across selectors, mutators, and UI helpers.

That made the model harder to explain and harder to evolve:

- `meta` was too broad to describe both document identity and project settings.
- Sequence bounds and parent resolution were being derived in more than one place.
- `scope:start` / `scope:end` were persisted as layers, but treated inconsistently between storage and UI.
- root scaffold carried more meaning than a project boundary sentinel should.

## Decision

Refactor the manifest boundary and derived-structure responsibilities as follows.

### 1. Normalize the project DTO

Keep `IProjectManifest` as the SSOT, but structure it as:

- `projectInfo`
- `projectSettings`
- `layers`
- `layerOrder`

The `projectInfo` group owns document identity fields such as name and timestamps, while `projectSettings` owns canvas, background, watermark, export range, and work area settings.

### 2. Preserve the flat storage model

Do not add a new `sequences` manifest collection.

- `Sequence` remains a computed wrapper over `layers + layerOrder`.
- `scope:start` / `scope:end` remain stored as layers for compatibility.
- Semantically, they are structure markers rather than user-facing content layers.

### 3. Separate derived structure calculation

Move sequence-related derivation out of `EngineSelectors` and into a dedicated service.

- sequence bounds
- parent sequence lookup
- insertion context
- derived duration

`EngineSelectors` stays focused on UI snapshot and viewport-oriented data.

### 4. Reframe root scaffold

Treat the root scaffold as a project boundary sentinel.

- it supports recovery and structural integrity
- it is not a content layer
- it is not a persisted user concept on its own

### 5. Keep empty-sequence policy in the product layer

The storage model does not decide how empty sequences are shown.

- product/UI can render placeholders
- storage and derivation stay focused on structure

## Consequences

- Project ownership boundaries are clearer.
- Manifest migration is easier because the document shape is explicit.
- Derived structure becomes easier to test in isolation.
- UI can consume sequence bounds without re-deriving them.
- Compatibility is preserved without introducing a new manifest collection.

## Notes

The canonical architecture now lives in [ARCHITECTURE.md](../../en/ARCHITECTURE.md).
The migration memo that guided this refactor has been retired.
