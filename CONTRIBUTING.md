# Contributing to Rendium Desktop Studio

Thank you for your interest in contributing to Rendium Desktop Studio! We welcome contributions from the community to help make this free, fully local video editor even better.

## How to Contribute

1.  **Search for existing issues**: Before starting work on a new feature or bug fix, please check our [issue tracker](https://github.com/ThreeLightStudio/threelight-studio/issues) to see if it's already being discussed or worked on.
2.  **Fork and branch**: Fork the repository and create a new branch for your changes.
3.  **Follow the architecture**: Rendium Desktop Studio is built with an intent-driven architecture and a clear separation between the engine (`packages/rendium-engine`) and the app shell (`apps/desktop-studio`). Please read [AGENTS.md](./AGENTS.md) for a high-level overview of the package boundaries and rules.
4.  **Write clean code**: Adhere to our coding conventions (TypeScript, Biome for linting/formatting).
5.  **Verify your changes**: Run the following command to ensure everything is correct:
    ```bash
    pnpm verify
    ```
    This command runs linting, type-checking, and all tests across the monorepo.
6.  **Submit a Pull Request**: Once your changes are verified and committed, submit a PR with a clear description of what you've done and why.

## Verification Workflow

We use a unified verification script to maintain high standards across all packages:

-   `pnpm check`: Runs Biome for linting and formatting.
-   `pnpm check:data-f`: Ensures that data attributes (used for testing and debugging) are consistent.
-   `turbo run test build`: Executes all tests and verifies that the production build succeeds.

A PR must pass the CI pipeline (which runs `pnpm verify`) before it can be merged.

## Architecture & Design Decisions

If you're making significant changes, please consult our Architecture Decision Records (ADRs) located in the `_docs/architecture-decisions` and package-level `_docs/history-architecture` directories.

## License

By contributing to Rendium Desktop Studio, you agree that your contributions will be licensed under the MIT License.
