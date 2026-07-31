# ADR-003: Adoption of Panda CSS for desktop-studio

[한국어](../ko/003-panda-css-desktop-studio-adoption.md)

> **Status**: Accepted  
> **Date**: 2026-04-20  
> **Author**: Codex  

---

## Context

While the UI layer of `desktop-studio` has expanded rapidly (with Inspector, Spectrum, Image Tools, and Audio/Template auxiliary panels), the styling standard was mixed with inline styles, global CSS, and individual classNames.  
Although this structure is advantageous for rapid development, it makes it difficult to maintain common control primitives and design tokens consistently over the long term.

Specifically, the following problems existed:
1. The same type of control used different spacing, labels, accent colors, and state expressions across different panels.
2. Design rules were scattered throughout the codebase, making it difficult to expand the Inspector UI.
3. Even if a common primitive were introduced, there was no central layer to enforce styling standards.

---

## Decision

Introduce Panda CSS exclusively for `desktop-studio`, and shift the styling standard to a combination of tokens, recipes, and atomic classes.  
Do not introduce Panda CSS to `packages/rendium-engine`.

### Scope of Application

- Apply only to the UI inside `apps/desktop-studio`.
- Do not apply to `packages/rendium-engine`.
- The engine focuses on data/state contracts, and Panda is used only in the presentation layer.

### Design Principles

- Define colors, spacing, radius, typography, and state colors using tokens.
- Define variants of Inspector primitives using recipes.
- UI components should prioritize using Panda's `css()` / recipes instead of inline styles.
- Reconstruct the Inspector based on common primitives.
- Maintain common UX rules based on `apps/desktop-studio/_docs/product/inspector-property-controls.md` (if existing).

---

## Implementation

### Step 1: Add Panda Configuration
- Add `apps/desktop-studio/panda.config.ts`.
- Add `apps/desktop-studio/postcss.config.cjs`.
- Define tokens exclusive to `desktop-studio`, and disable `preflight` to avoid conflicts with existing resets.

### Step 2: Connect Entry CSS
- Add `apps/desktop-studio/src/renderer/src/index.css`.
- Import it as the root CSS in `src/renderer/src/main.tsx`.
- Connect it so that Panda PostCSS processes the same entry while keeping the existing `main.css`.

### Step 3: Connect Paths and Types
- Add the `@styled-system/*` alias exclusively for `desktop-studio`.
- Connect the generated `styled-system` output so that the `desktop-studio` type chain recognizes it.

### Step 4: Automate Generation
- Run Panda codegen as part of the postinstall, build, dev, and typecheck flows in `desktop-studio`.

---

## Consequences

### Advantages
- Unifies the visual language of the `desktop-studio` UI around tokens.
- Allows building Inspector primitives based on repeatable recipes.
- Enhances the UI layer without pulling the style system into the engine.

### Precautions
- Initial adoption incurs migration costs for some UI files.
- Developers must understand the Panda generated output and the codegen flow.
- The `styled-system` artifacts must be updated during build/install steps.

---

## Verification

- `pnpm --filter desktop-studio typecheck`
- `pnpm --filter desktop-studio build`
- Verify that Panda utility classes are applied on the `desktop-studio` dev server.
- Verify that transient and commit behaviors on major Inspector panels are maintained.

---

## Non-goals

- Changing the style system of `packages/rendium-engine`.
- External packaging of the design system.
- Modifying the UI behavior itself.
- Redesigning the intent or state model.
