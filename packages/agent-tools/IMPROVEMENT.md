# Agent Improvement Process & Design Record

English | [한국어](./IMPROVEMENT.ko.md)

This document records the design process, core decisions, and testing steps implemented during the creation of the `@rendium/agent-tools` package. The tool was developed to improve the architectural compliance of AI agents (e.g., Cursor, Cline) and prevent regression bugs and conventions breakages across the monorepo.

---

## 1. Problem Statement

AI agents operating in a complex monorepo environment frequently suffered from the following issues:
- **Architectural Drift**: Agents struggled to recognize core design patterns, such as the Zustand + Immer immutable unidirectional data flow and the 1D flat layer sequence. Consequently, they would attempt to reintroduce legacy nested trees or direct in-place state mutations.
- **Convention & Lint Failures**: Agents often modified files without respecting the strict Biome lint rules and TypeScript type configurations, leading to broken builds.
- **Missing Prerequisites**: Agents attempted to write code before reading crucial developer onboarding guides (`_docs/onboarding`) or coding style files, leading to incorrect assumptions.

To resolve these bottlenecks, we needed an automated tool that dynamically feeds context-aware constraints, active guidelines, and prerequisite reading lists directly to the agent before any code changes are proposed.

---

## 2. Improvement Journey

We analyzed the agent's startup phase and built a pipeline that dynamically generates, merges, and validates instruction prompts for the agent.

### 2.1 Step 1: Declarative Rule Configuration (`.agentrules.yml`)
- We defined a `root` type policy schema at the monorepo root to set global guidelines.
- For individual packages (`packages/*`, `apps/*`), we defined a `package` type policy file that extends the root rules and declares package-level overrides.
- We listed mandatory onboarding documents under the `required_reading` metadata array.

### 2.2 Step 2: Inheritance & Merge Loader (`ConfigLoader`)
- We implemented a `ConfigLoader` class to handle YAML parsing and relative path resolution.
- It walks the `inheritance.extends` reference to fetch root policies and performs an ID-based merge for arrays under `principles`, `conventions`, and `sops`.
- It integrates an `AgentRulesSchema` validation layer powered by Zod to catch configuration issues (such as duplicate rule IDs) early.

### 2.3 Step 3: Contextual Prompt Renderer (`PromptRenderer`)
- We introduced a Handlebars template (`src/templates/base_prompt.hbs`) to aggregate rules, SOP steps, coding conventions, and resolved relative paths of required reading documents into a structured markdown prompt.
- The template enforces the rule **"Do not modify code before reading these required files first"** with clear callouts.

### 2.4 Step 4: CLI Wrapper and Workspace Integration
- We built a CLI entry point so developers can easily review the generated instructions.
- We linked the wrapper script so running `pnpm agent` or `pnpm agent -- --package-dir <dir>` from the workspace root instantly prints the tailored prompt for the targeted Bounded Context.

---

## 3. Guidelines for Agents

Any AI agent working on this repository must strictly adhere to the following sequence:

1. **Load Instructions**: At the beginning of the task, run the `pnpm agent` wrapper or inspect the prompt configuration output by `@rendium/agent-tools`.
2. **Read Prerequisite Docs**: Before editing files in a package, use the `view_file` tool to fully read all documents listed in `required_reading` (e.g., `visual-layer-provider-onboarding.md`, `typescript.md`).
3. **Smallest Viable Scope**: Keep changes confined to the narrowest path that satisfies the task, respecting package boundaries and avoiding unnecessary coupling.
