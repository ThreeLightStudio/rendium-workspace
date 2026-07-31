# AGENTS.md

## AI Agent Instructions for Graphify

This project uses **Graphify** to manage codebase architecture and knowledge graphs. 
Follow these rules to optimize token usage and avoid redundant file scanning:

1. **Graph-First Navigation**: Before using grep, glob, or reading raw source files to understand code architecture or dependencies, always read `graphify-out/GRAPH_REPORT.md` first.
2. **Use Scoped Queries**: Prefer using specific Graphify commands instead of loading whole files:
   - Use `graphify query "<your question>"` to find answers about the codebase.
   - Use `graphify path "<ComponentA>" "<ComponentB>"` to trace dependencies.
   - Use `graphify explain "<concept>"` to understand high-level architecture.
3. **Keep Graph Current**: After modifying, adding, or deleting code files in this session, run `graphify update` to keep the knowledge graph current (this runs locally and incurs no API token costs).

## Scope
This file applies to the entire `rendium-workspace` repository.
If a more specific `AGENTS.md` exists in a nested directory, that file takes precedence for files under its scope.

## Repo Rules
- Read the nearest `.agentrules.yml` before changing code, especially for `packages/*` and `apps/*`.
- Keep changes as narrow as possible and stay within the requested package or bounded context.
- Do not modify unrelated packages or revert changes you did not make.
- Prefer existing workspace scripts, package scripts, and shared utilities over ad hoc commands.

## Package Boundaries
- Treat `packages/agent-tools` as the isolated implementation area for MAS rule loading, validation, and prompt rendering work.
- Avoid touching `packages/rendium-engine` and `apps/desktop-studio` unless the task explicitly requires it.
- When a change spans multiple packages or shared tooling, confirm the boundary before widening scope.

## Verification
- For local package changes, run the narrowest relevant checks first.
- For workspace-wide changes, cross-package changes, or changes that affect shared scripts/config, prefer `pnpm verify` when it is a meaningful end-to-end check.
- If `pnpm verify` is too heavy or not relevant to the task, run the smallest validation path that still proves the change.
- After TypeScript or template changes, run formatting and linting for the touched package or files.
- If a check fails, fix the issue before finishing.

## Editing
- Prefer pure functions and immutable data handling where practical.
- Keep file I/O isolated from business logic.
- Follow the existing code style in the touched area.
- Use destructive commands only when explicitly requested.

## Notes
- `AGENTS.md` instructions supplement system, developer, and user instructions.
- Workspace policy for agent behavior lives in `.agentrules.yml`; use this file for Codex operating guidance and verification expectations.
- For this workspace, the root `.agentrules.yml` is the canonical policy source; package `.agentrules.yml` files only specialize it for their own bounded context.


<!-- headroom:rtk-instructions -->
# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands
```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules
- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage
<!-- /headroom:rtk-instructions -->
