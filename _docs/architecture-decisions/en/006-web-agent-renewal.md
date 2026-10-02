# ADR-006: Web Agent Renewal Direction

[한국어](../ko/006-web-agent-renewal.md)

> **Status**: Proposed (exploration approved)
>
> **Date**: 2026-08-08
>
> **Author**: Codex

---

## Context

Rendium currently provides an Electron-based GUI video editor together with `@rendium/engine`. The GUI surface has accumulated enough UX bugs and debugging cost that continuing to complete the entire editor is less efficient than validating a web-based video tool that an agent can use directly.

The existing architecture already provides reusable foundations:

- The `@rendium/engine` manifest, `EngineIntent`, atomic execution, and rendering paths
- A Studio-owned `ProductCommand` concept
- A Headless Workflow direction for compiling deterministic edits without exposing the UI
- Agent and automation boundaries based on command abstractions

This is therefore defined as a Renewal exploration that adds an AI-first web product surface on top of the existing engine, rather than a new video-engine project or an immediate replacement of the Electron product.

## Related Decisions

- [ADR-001: Product Command Layer](../../../apps/desktop-studio/_docs/history-architecture/en/001-product-command-layer.md) keeps user-facing product policy above engine intents.
- [ADR-002: Intent-Driven Architecture](./002-intent-driven-architecture.md) defines `EngineIntent` as the engine-facing interaction boundary.
- [ADR-003: Headless Workflow Layer](../../../apps/desktop-studio/_docs/history-architecture/en/003-headless-workflow-layer.md) establishes deterministic compilation and atomic application for UI- and AI-driven workflows.

## Decision

Rendium will explore a **Web Agent Studio** as a separate product surface while keeping the existing engine and Electron implementation. The web surface will expose a command and verification contract that browser agents can operate.

The first web version will not prioritize a professional GUI editor for general users. It will prioritize an AI-oriented work console with:

- Command or structured-action input
- Project and capability queries
- Deterministic ProductCommand execution
- Structured results, errors, change information, and undo information
- Render preview
- Export job progress and result artifacts

Browser agents should not edit through DOM clicks alone. Where possible, they should use product-level commands, while the web UI exposes those commands and state accessibly. ProductCommands may compile to one or more `EngineIntent` values and execute through the existing engine.

This remains a proposed exploration direction. It does not promote Web Agent Studio to the primary product, create the web application, or change public code contracts in this ADR.

## Product Boundary

```text
Browser Agent / Command Console
        ↓
Web Agent Contract
        ↓
Studio Product Context + ProductCommand
        ↓
EngineIntent Batch
        ↓
@rendium/engine
        ↓
Preview / Export Artifact
```

The expected workspace shape is a target structure, not a statement of current implementation:

- `@rendium/engine`: core editing model, state, rendering, and export foundation
- `apps/desktop-studio`: existing Electron reference implementation and maintenance target
- `apps/web-agent-studio`: future web application centered on AI command input and state inspection
- Future `editor-agent-contracts`: conceptual home for command, state, capability, job, and error contracts

The current Renewal work does not create `apps/web-agent-studio` or `editor-agent-contracts`. The engine's core semantics remain shared. Electron IPC, filesystem, and app-shell paths may be separated into web adapters or extended in a later implementation phase where necessary.

## Interface Impact

This ADR changes no public API, type, package, or wire schema. `ProductCommand`, `EngineIntent`, capability, job, and error contracts are architectural boundaries only. Detailed web contracts require a follow-up design and implementation decision.

## Exploration Scope

The first validation flow is intentionally limited to:

1. Importing a local video or image
2. Trimming or reordering media
3. Adding a text layer
4. Previewing and verifying project state
5. Exporting MP4

The validation criterion is whether an agent can start from a clean project, enter commands, read the resulting state and structured result or error, and verify the export artifact.

## Reliability Rules

The web exploration does not require resolving every Electron GUI UX bug first. However, the following engine- or contract-level issues must be fixed or clearly isolated before relying on the web prototype:

- State and manifest consistency
- Atomicity of intent batches and undo/redo
- Asset persistence and reload
- Media readiness and time/frame calculations
- Preview and export consistency

If the same problems reproduce in the web prototype, they should be treated as engine or contract problems rather than GUI problems.

## Electron Preservation and Migration Policy

- Preserve the current public Electron implementation as a reference implementation.
- Validate the web prototype on `codex/renewal-web-agent` first.
- Do not delete Electron before the web version is validated.
- If the web version becomes the primary product, preserve Electron in an archive branch, tag, or separate repository.
- Do not reinitialize the repository's Git history. Product cleanup and history deletion are separate concerns.
- Keep existing Electron ADRs as historical documents and state their relationship to the Renewal direction in a follow-up decision if the web product supersedes them.

## Non-goals

- Building a professional NLE-grade timeline GUI in the first phase
- Fixing every Electron UX bug before exploration
- Depending on a model to handle every edit through natural language alone
- Writing a new video-rendering engine
- Creating the web app or detailed web schemas in this ADR
- Bulk-deleting Electron code or existing documentation before the web prototype is validated

## Revisit

Reconsider promoting Web Agent Studio to the primary product direction when:

- A browser agent can repeat the first validation flow
- Command results and errors are available as structured state
- The export artifact is consistent with the preview
- The web adapters and engine boundary remain maintainable
- The product decision to retire the Electron reference implementation is explicit
