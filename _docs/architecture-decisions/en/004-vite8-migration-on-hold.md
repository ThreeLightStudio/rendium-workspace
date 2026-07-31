# ADR-004: Decision to Put Vite 8 Migration on Hold

[한국어](../ko/004-vite8-migration-on-hold.md)

> **Status**: Deferred  
> **Date**: 2026-04-26  
> **Author**: Codex  

---

## Context

The `desktop-studio` app in `rendium-workspace` uses a Vite-based toolchain across multiple layers.

- The renderer and Storybook run on `vite`.
- The Electron runtime is developed/built via `electron-vite`.
- Tests are executed using `vitest` and `happy-dom`.

After checking the dependency status of the repository, migrating immediately to `vite 8` was highly likely to conflict with the surrounding toolchain.

### Identified Constraints

1. Storybook dependencies in `apps/desktop-studio/package.json` are a combination of `@storybook/react-vite@8.6.18` and `storybook@^8.6.18`.
2. The currently installed `@storybook/react-vite@8.6.18` and `@storybook/builder-vite@8.6.18` only allow `vite ^4 || ^5 || ^6` in peer dependencies.
3. The currently installed `electron-vite@5.0.0` only allows `vite ^5 || ^6 || ^7` in peer dependencies.
4. While `@vitejs/plugin-react@5.2.0` allows up to `vite ^8.0.0`, updating it alone does not make the entire chain compatible.

In other words, even if the Vite plugins themselves are ready, the Storybook and Electron build chains are blocking the migration.

---

## Decision

We will defer the `vite 8` migration at this time.

Instead, we will follow these principles:

- Do not perform major Vite upgrades unless compatible versions of Storybook and Electron build tools are secured first.
- Maintain the Storybook configuration in `desktop-studio` based on the currently stable Vite 7 series.
- Re-examine the Vite 8 upgrade as a separate dependency cleanup task.

---

## Implementation Status

The repository currently maintains the following state:

- `apps/desktop-studio/.storybook/main.ts` uses the `@storybook/react-vite` framework.
- We maintain the existing configuration that overrides aliases and PostCSS paths inside `viteFinal()`.
- We do not modify the development, build, and preview flows based on `electron-vite`.
- We do not upgrade the `vite` version of the root and app packages until explicitly approved.

---

## Consequences

### Advantages

- It does not break the currently functioning Storybook / Electron / Vitest flows.
- It prevents installation failures or runtime errors caused by peer dependency conflicts.
- We can manage the scope of subsequent tasks needed for the Vite 8 transition separately.

### Precautions

- New features and improvements of Vite 8 cannot be introduced immediately.
- A re-evaluation will be necessary when support for `vite 8` is added to Storybook addons or the Electron toolchain.
- Future upgrades must verify the Storybook, Electron, and testing chains together, rather than just upgrading `vite`.

---

## Revisit Criteria

We will resume the Vite 8 migration once the following conditions are met:

- Storybook's `react-vite` builder officially supports `vite 8`.
- `electron-vite` officially supports `vite 8`, or an alternative build path is prepared.
- Peer dependency warnings after running `pnpm install` are resolved to an acceptable level.
- Storybook execution, Electron development execution, builds, and tests in `desktop-studio` all pass.

---

## Verification

Since this decision is an architectural record rather than a code change, no separate functional verification was performed.

Verification items for future resumption must include:

- `pnpm --filter desktop-studio storybook`
- `pnpm --filter desktop-studio dev`
- `pnpm --filter desktop-studio build`
- `pnpm test`
