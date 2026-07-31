# Core Dependencies Rationale

[한국어](../ko/001-core-dependencies.md)

This document describes the reasons for selecting the core dependency tools adopted for establishing the infrastructure of the top-level monorepo (`rendium-workspace`) of the Rendium project and their architectural purposes.

## 1. Package Manager: pnpm (`pnpm@10.33.0`)
* **Role:** Workspace package management and dependency tree control
* **Rationale:** 
  * Generates a strict `node_modules` structure using a content-addressable store and symbolic links.
  * Completely blocks phantom dependencies that occur in npm or Yarn flat structures, ensuring module isolation between the core engine package (`@rendium/engine`) and the micro-frontend shell (`apps/*`).
* **References:** pnpm official documentation - "Flat node_modules is not the only way" (2021)

## 2. Monorepo Build System: Turborepo (`turbo`)
* **Role:** Build pipeline configuration between packages, task caching, and orchestration
* **Rationale:**
  * Controls the build order (topology) of multiple packages based on a Directed Acyclic Graph (DAG).
  * In an environment where heterogeneous language pipelines (such as Rust/Wasm compilation and TypeScript builds) coexist, it minimizes configuration overhead while maximizing build performance through parallel execution and artifact caching.
* **References:** Vercel, "Turborepo Architecture and Task Pipeline"

## 3. Linter & Formatter: Biome (`@biomejs/biome`)
* **Role:** Code linting and formatting
* **Rationale:**
  * Written in Rust, it performs static analysis significantly faster than traditional JavaScript-based tools.
  * Consolidates the functions of ESLint and Prettier into a single configuration file (`biome.json`), preventing toolchain fragmentation across multiple packages in the monorepo and improving maintainability.
* **References:** Biome official documentation - "One toolchain for your web project"

## 4. Test Framework: Vitest (`vitest`)
* **Role:** Running unit and integration tests
* **Rationale:**
  * Architectures leveraging WebGPU and Rust (Wasm) require native ESM (ECMAScript Modules) support. Unlike Jest, which is based on CommonJS, Vitest is built on Vite and handles ESM without transpilation bottlenecks.
  * Leverages HMR (Hot Module Replacement) to optimize test execution speed.
* **References:** Vitest official documentation - "Why Vitest"

## 5. Version Control Tool: Changesets (`@changesets/cli`)
* **Role:** Version management of individual packages in the monorepo and changelog automation
* **Rationale:**
  * It is the most stable standard tool for independently or dependently (based on dependencies) controlling the versions of core modules and application layers in the workspace.
  * Automatically handles the release process by explicitly collecting semantic versioning intents during the PR (Pull Request) stage.
* **References:** Atlassian, Changesets Documentation
