# ADR 004: Studio Product Domain Boundary

[한국어](../ko/004-studio-product-domain-boundary.md)

- **Status**: Proposed
- **Date**: 2026-05-12
- **Context**: `desktop-studio` needs a clearer internal boundary for ProductCommands, Product Context, and Headless Workflows before deciding whether those concepts deserve a separate workspace package.

## Context

ADR 001 defines ProductCommands as Studio-owned actions above engine intents. ADR 002 defines Product Context as the read-side product meaning used by AI and UI. ADR 003 defines Headless Workflows as deterministic recipes above ProductCommands.

The next workflow requirement is a JSON-ready wizard contract:

- workflow presets should be represented as data
- wizard steps should come from workflow definitions
- each step should declare whether it is required or optional
- optional steps should be skippable
- required steps should drive both UI navigation and compile validation
- UI should not duplicate workflow policy that the compiler also needs

This makes the boundary between UI, ProductCommands, Product Context, and Workflow definitions more important.

There is an attractive future direction: move Studio product policy into a dedicated workspace package such as `@rendium/studio-product`. That package could own product commands, context packs, workflow catalog loading, preset validation, and deterministic compilation.

However, the current implementation is still tightly connected to `desktop-studio` renderer concerns:

- ProductCommands may call renderer stores for selection behavior.
- Some execution helpers seek the local timeline playback controller.
- Product Context uses project asset records owned by Studio.
- AI context types currently live in the desktop app shared layer.
- Workflow compile depends on ProductCommand resolver behavior and Studio asset semantics.
- Storybook remains the main review surface for the user-facing workflow.

Adding a workspace package now would create another onboarding step before the domain boundary is stable. New contributors would need to understand both the app package and a new package boundary while the APIs are still changing.

## Decision

For v1, `desktop-studio` will use an **Internal First** product domain boundary.

That means:

- Do not create `@rendium/studio-product` yet.
- Keep ProductCommands, Product Context, and Headless Workflows owned by `desktop-studio`.
- Move toward an internal product-domain shape before extracting a package.
- Keep renderer side effects outside the product-domain core where practical.
- Make workflow definitions the source of truth for required / optional wizard steps and compile validation.

The preferred internal namespace is:

```text
src/renderer/src/productDomain/
  commands/
  context/
  workflows/
  types/
```

This name is intentionally descriptive. It signals that the code is still inside the desktop app while being separate from React components, Storybook stories, Zustand stores, Electron bridges, and visual UI concerns.

The current `productCommands`, `productContext`, and `workflows` folders may migrate into this shape gradually. The migration does not need to be a single rename. Behavior-preserving moves should happen only when a workflow-driven UI change needs the boundary.

## Rules

- Product-domain code may depend on public `@rendium/engine` contracts, including manifest, snapshot, and intent types.
- Product-domain code should prefer pure resolver functions that return data, intents, summaries, or errors.
- Product-domain code should not import React components.
- Product-domain code should not import Storybook utilities.
- Product-domain code should not directly call Electron APIs.
- Product-domain compile functions must not mutate engine state.
- Renderer side effects stay in app adapters, components, hooks, or stores.

Renderer side effects include:

- `engineStore.executeAtomicIntentBatch()`
- selecting layers in `useStudioStore`
- timeline seek playback controller calls
- file input, upload, and project asset persistence
- toast notifications
- modal open / close state

These side effects may wrap product-domain results, but they should not be required to compute those results.

## Workflow Definition Direction

Workflow definitions should become the bridge between domain logic and UI.

A workflow definition should describe:

- available presets
- asset slots
- ordered steps
- whether each step is required or optional
- whether an optional step can be skipped
- default parameters
- compile behavior

The wizard should render from this definition instead of hardcoded numeric steps such as `0 | 1 | 2 | 3 | 4`.

The compiler should validate from the same definition instead of treating step metadata as display-only information.

For the audio-visual-draft workflow, this means `requiredAssetSlots` should stop being passive preset metadata and become part of a richer workflow contract used by both:

- `WorkflowWizard`
- `compileSelectedWorkflow`

## Future Package Extraction Criteria

Revisit a dedicated workspace package only after the internal product-domain boundary satisfies these criteria:

- The product-domain core typechecks without importing React, Zustand, Electron, or Storybook.
- Product-domain tests run without mounting the desktop renderer.
- Workflow catalog data is used by both UI navigation and compile validation.
- ProductCommand resolvers can produce deterministic outputs without executing renderer side effects.
- AI context generation can consume product-domain types without importing renderer stores.
- A new contributor can understand the product-domain public API without first reading the full `desktop-studio` UI implementation.

If these criteria hold, extraction to a package such as `@rendium/studio-product` can be reconsidered.

## Consequences

- Onboarding stays simpler for now because no new workspace package is introduced.
- The domain boundary can stabilize inside `desktop-studio` before becoming public package API.
- Storybook remains close to the UI while workflow policy moves toward testable domain modules.
- Some short-term coupling remains, especially around asset records, AI context, selection behavior, and timeline seeking.
- Future extraction becomes easier because the internal boundary documents what must be pure and what must remain an app adapter.

## Follow-Up Work

- Refactor `WorkflowWizard` from numeric steps to workflow-definition steps.
- Promote required / optional workflow step metadata into the source of truth for wizard navigation.
- Use the same required / optional metadata for compile validation.
- Keep renderer side effects in local adapters after product-domain compile succeeds.
- Reassess package extraction only after the internal boundary has tests and stable imports.
