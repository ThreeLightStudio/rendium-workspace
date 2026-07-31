# Conventions

This directory defines the common development conventions applied across the entire `rendium-workspace`.

Root conventions act as the default for all packages. If a package-specific `_docs/conventions` or `.agentrules.yml` provides more specific rules, those package rules take precedence within that bounded context.

## Scope

- TypeScript common style and safety criteria
- Workspace-wide rules such as testing, validation, and package boundaries
- Decision guidelines for both agents and human developers

## Precedence

When rules conflict, they are applied in the following order:

1. Explicit user request
2. Package `.agentrules.yml`
3. Package `_docs/conventions/*`
4. Root `.agentrules.yml`
5. Root `_docs/conventions/*`

## Document List

- [`typescript.md`](./typescript.md): Basic conventions applied to all TypeScript code
- [`comments.md`](./comments.md): Guidelines for code/documentation comments and follow-ups
