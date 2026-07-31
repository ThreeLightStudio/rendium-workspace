# ADR 001: Product Command Layer

[한국어](../ko/001-product-command-layer.md)

- **Status**: Accepted
- **Date**: 2026-05-10
- **Context**: `desktop-studio` needs reusable user-facing commands that can be called from UI surfaces and AI chat without exposing low-level engine intent assembly to each entry point.

## Context

`packages/rendium-engine` intentionally exposes a minimal intent layer. Engine intents such as `ADD_LAYER`, `UPDATE_TRANSFORM`, and `REORDER_LAYER` describe atomic manifest mutations and runtime-safe edit operations.

This is the correct boundary for the engine, but it is not the right boundary for most Studio user actions. A user request such as "attach this image to the end of the video for 7 seconds" implies product-level decisions:

- where the current content ends
- which scope should receive the new layer
- how an asset id resolves to a project source URL
- whether the layer should behave as background, overlay, or inserted media
- which default duration, fit, transform, and selection behavior should apply

Those decisions belong to `desktop-studio`, not to `@rendium/engine`, and they should not be reimplemented separately in every UI or AI entry point.

## Decision

`desktop-studio` will distinguish two command layers.

### IntentCommand

IntentCommand means the public engine intent contract owned by `@rendium/engine`.

Examples:

- `ADD_LAYER`
- `UPDATE_LAYER_PROPS`
- `UPDATE_TRANSFORM`
- `TOGGLE_VISIBILITY`
- `REORDER_LAYER`
- `REMOVE_LAYER`

IntentCommands are minimal, manifest-oriented, and engine-owned. They should remain suitable for deterministic engine validation and atomic execution.

### ProductCommand

ProductCommand means a Studio-owned user action that resolves product context into one or more IntentCommands.

Examples:

- add an image asset to the timeline end
- place an asset into the main or overlay scope
- create a music video draft from audio and image assets
- replace selected layer media
- extend an outro section with a background image

ProductCommands may read Studio stores, project assets, engine snapshots, and product defaults. Their output should ultimately be engine IntentCommands executed through public engine APIs.

## Rules

- UI controls, drag and drop flows, context menus, and AI chat should prefer ProductCommands for user-facing actions.
- AI should not assemble low-level engine manifests when a ProductCommand exists.
- Asset lookup, timeline end calculation, scope resolution, display sizing, default fit, and selection behavior are ProductCommand responsibilities.
- ProductCommands must execute engine changes through public engine intent APIs, usually `engineStore.executeAtomicIntentBatch`.
- Avoid introducing special commands that do not resolve to IntentCommands unless the action is read-only or purely UI state.
- If a ProductCommand becomes broadly useful outside Studio, promote the underlying capability deliberately instead of leaking Studio-specific policy into the engine.

## Consequences

- AI and UI entry points can share the same behavior and defaults.
- Engine contracts stay small and stable.
- Product-level UX policy is easier to test in one place.
- New AI capabilities should first look for an existing ProductCommand before adding parser-only behavior.
- Temporary AI-only actions should be treated as migration candidates into ProductCommands, not as the long-term product API.

## Example

For "add this image as a background at the end for 7 seconds":

```text
ProductCommand: addImageAssetToTimelineEnd
  1. Read current content end from the engine snapshot or sequence derivation.
  2. Resolve the target Studio scope, usually main with overlay fallback if needed.
  3. Resolve assetId to sourceUrl and image metadata from project assets.
  4. Apply Studio display defaults for background usage.
  5. Emit ADD_LAYER with the real targetScopeId, startTime, duration, source, and transform.
```

The engine still receives an `ADD_LAYER` IntentCommand. The product command owns the user-facing interpretation.
