# ADR 007: Global Canvas Attributes Migration

[한국어](../ko/007-global-canvas-attributes-migration.md)

- **Status**: Accepted & Implemented
- **Date**: 2026-04-16
- **Context**: Rendium Engine architecture and manifest boundary cleanup for background / canvas settings.

## Context

The previous architecture treated `background` as if it were timeline content, which blurred the boundary between global render settings and time-based layers.
That made project duration coupling, undo/redo normalization, and render-pass setup more complicated than necessary.

## Decision

Move all non-temporal canvas configuration into the project-level fields of `IProjectManifest`.

### 1. Project-Owned Global Settings
The following values are owned by the project manifest, not by layers:
- `canvasSize`
- `canvasBackgroundColor`
- `watermark`
- `exportRange`
- `workArea`
- `meta`

### 2. Timeline Layers Only for Temporal Content
Only values that have `startTime` and `duration` remain in `layers`.
- Full-screen overlays with a time range are still layers.
- Always-on overlays are project settings.
- The old dedicated `background` layer is removed.

### 3. Render Path Simplification
Canvas background rendering is handled by render-pass clear configuration.
- The renderer no longer needs a background layer instance.
- Export and preview flows share the same global background source.
- `normalizeInfiniteLayers()` is no longer part of the background workflow.

## Consequences

- Clearer ownership boundaries between project-level settings and timeline content.
- Simpler undo/redo history because background normalization is no longer mixed into layer mutation.
- Better alignment with NLE-style project models where sequence settings live apart from clips.
- Lower render-path cost because background drawing becomes a clear step instead of an extra layer pass.

## Notes

This ADR archives the migration that was previously tracked in the removed migration memo.
The canonical architecture now lives in [ARCHITECTURE.md](../../en/ARCHITECTURE.md).
