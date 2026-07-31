# ADR-005: Introduction of Agent Context Auto-Loading

[한국어](../ko/005-agent-context-auto-loading.md)

> **Status**: Accepted  
> **Date**: 2026-05-06  
> **Author**: Codex  

---

## Context

`pnpm agent` was already merging the workspace root `.agentrules.yml` and package `.agentrules.yml` to render the final agent prompt.

However, for a bounded context like `@rendium/engine`, simple policy merging was not enough. Before actually starting work, reading the `README.md` and onboarding documents first was essential to safely follow the current implementation rules, such as the manifest shape, runtime factory, and layer/provider boundaries.

Specifically, the current problems were as follows:
1. Rules were automatically loaded, but the required documents for the task were not automatically highlighted.
2. Even if package-specific onboarding documents existed, they were separated from the agent prompt, making them easy to miss.
3. In a bounded context like the engine where reading documents beforehand is critical, "policies" and "reading orders" were managed via different channels.

---

## Decision

Add `required_reading` metadata to the package `.agentrules.yml`, and have `@rendium/agent-tools` render it into the final prompt.

### Application Principles

- `required_reading` contains only the "list of documents that must be read before starting work".
- The policy body is still managed in the existing sections of `.agentrules.yml`.
- The onboarding document body remains in `_docs/onboarding`, and the rules file declaratively references the list.
- The root policy remains the canonical source, and package rules are only responsible for bounded-context overrides and required reading declarations.

### Initial Application Scope for `@rendium/engine`

- `README.md`
- `_docs/onboarding/README.md`
- `_docs/onboarding/core-layer-onboarding.md`
- `_docs/onboarding/visual-layer-provider-onboarding.md`

---

## Implementation

### Step 1: Extend Schema
- Add the `required_reading` field to the rules schema in `packages/agent-tools`.
- Model each item as a declarative record with `id`, `label`, and `path`.
- Validate duplicate `id`s in the same manner as existing principles/conventions/SOPs.

### Step 2: Extend Rendering
- Have `PromptRenderer` render an additional "Required Reading" section in the prompt.
- Show both the `label` and the relative path in a human-readable format.

### Step 3: Package Declaration
- Add the required reading list to `packages/rendium-engine/.agentrules.yml`.
- Expose the engine README and onboarding documents as required reading lists.

### Step 4: Clean Up Entry Points
- The root `pnpm agent` operates based on the package target as before.
- Provide a `pnpm agent` forwarding script in `packages/rendium-engine` to allow using the same entry point inside the package directory.

---

## Consequences

### Advantages
- The agent prompt displays both the policies and the context reading at once, reducing omissions.
- Start-of-work rules for each bounded context can be managed declaratively.
- Improves work safety in packages where document priority is critical, such as the engine.

### Precautions
- The required reading list needs to be continuously updated.
- Since a long document body could bloat the prompt, only essential items should be kept in the list.
- When expanding to other packages, each onboarding structure must be organized first.

---

## Verification

- `pnpm --filter @rendium/agent-tools test`
- `pnpm --filter @rendium/agent-tools build`
- `pnpm --filter @rendium/agent-tools check`
- `pnpm agent -- --package-dir packages/rendium-engine`
- `cd packages/rendium-engine && pnpm agent`

---

## Non-goals

- Do not duplicate onboarding document bodies into `.agentrules.yml`.
- The onboarding structure of `desktop-studio` is not completed in this ADR.
- Do not standardize the required reading structure of all non-engine packages in this stage.
