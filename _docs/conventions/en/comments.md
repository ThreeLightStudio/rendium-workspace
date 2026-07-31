# Comment Conventions

[한국어](../ko/comments.md)

This document defines the guidelines for code and documentation comments and follow-up tracking in `rendium-workspace`.

Comments are not decorations to compensate for poor naming or structure. They are a medium for documenting decisions, trade-offs, constraints, and follow-up discussions that must remain near the code or documentation.

## Why and Trade-off

Comments should explain *why* something was done and what *trade-offs* were accepted, rather than repeating *what* the code does.

Good:

```ts
// Keep the outer anchor pair even when the sequence is empty.
// Downstream reconciliation treats these sentinels as stable timeline bounds.
return createSequenceWithAnchors(layers);
```

Good:

```ts
// Prefer a full manifest clone here. The migration path runs at load time,
// and preserving the caller input is more important than allocation cost.
return cloneManifest(input);
```

## Follow-up Issues

If a trade-off documented in a comment requires further discussion, follow-up work, design decisions, or owner review, create an internal issue document in the owning context's `_docs/issues` directory and reference it from the comment.

Keep package-local issues in the package's `_docs/issues` directory, and reserve the root `_docs/issues` directory for workspace-wide or cross-package issues.

Good:

```ts
// Preserve the legacy timing fallback until imported v1 projects are migrated.
// Follow-up: packages/rendium-engine/_docs/issues/2026-05-17-remove-legacy-timing-fallback.md
return normalizeLegacyTiming(layer);
```

Detailed rules for writing internal issues follow the conventions in `_docs/issues` (if applicable).

## What Comments

Avoid writing comments that merely explain what the code does ("what" comments). Prioritize revealing intent through clear function names, variable names, types, and small function decomposition.

Bad:

```ts
// Add one to the index.
const nextIndex = index + 1;
```

Good:

```ts
const nextLayerIndex = currentLayerIndex + 1;
```

"What" comments are only permitted when it is difficult to express intent through code alone, such as complex mathematical formulas, highly optimized algorithms, or coordinate system mappings.

Allowed:

```ts
// Convert from normalized device coordinates to canvas pixels.
// x: [-1, 1] maps to [0, width], y: [1, -1] maps to [0, height].
const x = ((normalized.x + 1) / 2) * canvasWidth;
const y = ((1 - normalized.y) / 2) * canvasHeight;
```

Functions requiring "what" comments indicate high complexity and regression risk. Write unit tests or narrow integration tests alongside these functions.

## Structure Over Comments

If a comment starts explaining multiple sequential steps of a function, review whether you can split it into smaller, descriptive helper functions.

Bad:

```ts
// First validate the layer, then normalize its timing,
// then insert it after the selected layer.
export function prepareLayer(input: unknown, selectedLayerId: LayerId): ILayerManifest {
  // ...
}
```

Good:

```ts
export function prepareLayer(input: unknown, selectedLayerId: LayerId): ILayerManifest {
  const layer = parseLayerInput(input);
  const normalizedLayer = normalizeLayerTiming(layer);

  return placeLayerAfter(normalizedLayer, selectedLayerId);
}
```

## Documentation Comments and Notes

Apply the same criteria to documentation:

- Retain decision history, constraints, and trade-offs.
- Avoid repeating details that are already obvious from headings or sentences.
- Link follow-ups or further discussions to internal issues.
- Promote long-standing temporary notes to document sections or internal issues.
