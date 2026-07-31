# Rendium Desktop Studio

English | [한국어](./README.ko.md)

`desktop-studio` is the Electron + React application for editing Rendium projects. It owns renderer UI, Electron shell integration, project asset storage, AI chat surfaces, Storybook stories, and desktop packaging.

Engine-domain behavior belongs in `packages/rendium-engine`; renderer UI should communicate with the engine through its public intent and snapshot APIs.

## Setup

Install dependencies from the workspace root:

```bash
pnpm install
```

Run the app:

```bash
pnpm dev:studio
```

Or from this package:

```bash
pnpm dev
```

`predev` runs Panda CSS codegen before Electron Vite starts.

## Common Scripts

```bash
pnpm --filter desktop-studio typecheck
pnpm --filter desktop-studio lint
pnpm --filter desktop-studio check
pnpm --filter desktop-studio storybook
pnpm --filter desktop-studio storybook:dev
pnpm --filter desktop-studio build
```

Packaging scripts:

```bash
pnpm --filter desktop-studio build:mac
pnpm --filter desktop-studio build:win
pnpm --filter desktop-studio build:linux
pnpm --filter desktop-studio build:unpack
```

Icon generation:

```bash
pnpm --filter desktop-studio build:icons
```

## Styling And Storybook

- Panda CSS codegen is part of `predev`, `pretypecheck`, `prestorybook`, and `postinstall`.
- Use `storybook:dev` when you want Panda codegen watch mode and Storybook running together.
- Component stories live beside renderer components where practical.

## Selector Anchors

- Use `data-f` for renderer DOM anchors that need to be easy to find in screenshots, tests, or debug tooling.
- Keep values kebab-case and descriptive, such as `editor-dispatch-button` or `search-input`.
- Prefer `data-f` over `data-testid`; new renderer markup should not introduce `data-testid`.
- Run `pnpm --filter desktop-studio check:data-f` when changing renderer JSX anchors.

## Product Docs & Architecture Decisions (ADRs)

To understand the product architecture and design history of Rendium, refer to the following documents:
- [Root Architecture Decisions (ADR-001 ~ 005)](../../_docs/architecture-decisions/en)
- [Core Engine Architecture Decisions (ADR-001 ~ 011)](../../packages/rendium-engine/_docs/history-architecture/en)
- [Desktop Studio Architecture Decisions (ADR-001 ~ 005)](./_docs/history-architecture/en)
