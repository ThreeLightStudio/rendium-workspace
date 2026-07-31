# Rendium Technical Specification & Architecture Document (EN)

[한국어](../ko/technical-spec.md)

This document describes the core engine architecture, key infrastructure decisions, and macOS deployment/troubleshooting specifications for the **Rendium** project.

---

## 1. Core Monorepo Infrastructure

The Rendium monorepo (`rendium-workspace`) adopts the following toolchains to guarantee strict package boundary isolation and build optimization.

### 1.1 Package Manager: pnpm (`pnpm@10.33.0`)
- **Role:** Workspace package management and dependency tree pruning.
- **Rationale:** By using a content-addressable store and symbolic links, pnpm creates a strict `node_modules` structure. This prevents phantom dependencies and guarantees absolute module isolation between the core engine (`@rendium/engine`) and application shells (`apps/*`).

### 1.2 Build System: Turborepo (`turbo`)
- **Role:** Package build pipeline construction and task caching.
- **Rationale:** Turborepo manages build topology order based on a Directed Acyclic Graph (DAG) and provides build artifact caching to maximize build performance by skipping unchanged packages.

### 1.3 Linter/Formatter: Biome (`@biomejs/biome`)
- **Role:** Static analysis and style formatting.
- **Rationale:** Written in Rust, Biome is extremely fast compared to JavaScript-based tools (ESLint/Prettier) and integrates both linting and formatting under a single config file (`biome.json`).

### 1.4 Test Framework: Vitest (`vitest`)
- **Role:** Unit and integration test execution.
- **Rationale:** A WebGPU and ESM-native environment requires fast ES Module compilation. Vitest leverages Vite's HMR mechanism to resolve test runners quickly without compilation bottlenecks.

---

## 2. Intent-Driven Architecture

Rendium Engine utilizes the **Intent-Driven Pattern** to decouple the UI renderer (`desktop-studio`) from state mutation internals.

```
[UI / AI Agent / Preview] → EngineIntent (Union) → EngineStore (dispatchIntent) → IntentRouter → ManifestMutators → IProjectManifest (Immer Patches) → SceneReconciler
```

### 2.1 Core Mechanism
- **Standardized Intent**: All user interactions and AI-guided action previews are represented as unified, typed `EngineIntent` objects.
- **Exhaustive Routing**: The `IntentRouter` routes incoming intents to the respective `ManifestMutators` with compile-time type safety.
- **Immer-based Patch Generation**: Mutations run under Immer's `produceWithPatches` to produce fine-grained JSON Patches, allowing history tracking (Undo/Redo) to be computed automatically.
- **Scene Reconciler**: The resulting JSON Patches are piped to `SceneReconciler` to dynamically update WebGL textures and Web Audio API graph connections at runtime.

---

## 3. macOS Build Troubleshooting

Instructions to address gatekeeper and code-signature challenges when packaging Rendium Desktop Studio on macOS.

### 3.1 "Team ID Mismatch" Crash (SIGABRT)
- **Symptoms:** The packaged `.app` crashes immediately upon launch.
- **Cause:** `electron-builder` tries to apply an Ad-hoc code signature in local builds. A mismatch between the Team ID and inner frameworks prompts macOS to kill the process with a `SIGABRT`.
- **Solution:** Disable code signing for local runs by configuring the identity to `null` in `electron-builder.yml`:
  ```yaml
  mac:
    identity: null
  ```

### 3.2 Gatekeeper & Quarantine Removal
- **Symptoms:** macOS flags the unsigned package as damaged or unsafe to open.
- **Solution:** Strip the quarantine attribute recursively via the terminal:
  ```bash
  xattr -cr apps/desktop-studio/dist/mac-arm64/"Rendium Desktop Studio.app"
  ```

---

## 4. Related Technical Documents & Rationale

For more detailed architectural backgrounds and package-specific development guides, please refer to the following resources:

### 4.1 Monorepo Common Documents (Workspace Conventions & ADRs)
- **Architecture Decision Records (ADR)**: [ADR Directory](../../_docs/architecture-decisions/en)
  - [ADR-001: Core Dependencies Rationale](../../_docs/architecture-decisions/en/001-core-dependencies.md)
  - [ADR-002: Intent-Driven Architecture Adoption](../../_docs/architecture-decisions/en/002-intent-driven-architecture.md)
  - [ADR-003: Panda CSS Desktop Studio Adoption](../../_docs/architecture-decisions/en/003-panda-css-desktop-studio-adoption.md)
  - [ADR-004: Vite 8 Migration on Hold](../../_docs/architecture-decisions/en/004-vite8-migration-on-hold.md)
  - [ADR-005: Agent Context Auto Loading](../../_docs/architecture-decisions/en/005-agent-context-auto-loading.md)
- **Development Conventions**: [Conventions Directory](../../_docs/conventions/en)
  - [TypeScript Basic Conventions](../../_docs/conventions/en/typescript.md)
  - [Comments & Documentation Conventions](../../_docs/conventions/en/comments.md)

### 4.2 Core Engine Documentation (Core Engine Internals)
- **Engine Architecture Details**: [Engine Architecture](../../packages/rendium-engine/_docs/en/ARCHITECTURE.md)
- **Engine Developer Onboarding Guide**: [Engine Onboarding](../../packages/rendium-engine/_docs/onboarding/en/README.md)
  - [Core Layer Policy & Verification](../../packages/rendium-engine/_docs/onboarding/en/core-layer-onboarding.md)
  - [Visual Layer Provider Extension](../../packages/rendium-engine/_docs/onboarding/en/visual-layer-provider-onboarding.md)
- **Engine Historical Design Evolution**: [Engine History Directory](../../packages/rendium-engine/_docs/history-architecture/en)

### 4.3 Desktop Studio Documentation (Desktop App Shell)
- **App Shell Architecture History**: [Studio History Directory](../../apps/desktop-studio/_docs/history-architecture/en)
  - [ADR-005: AI Monetization Deferral Record](../../apps/desktop-studio/_docs/history-architecture/en/005-ai-monetization-deferral.md)
