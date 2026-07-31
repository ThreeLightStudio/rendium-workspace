# @rendium/agent-tools

English | [한국어](./README.ko.md)

`@rendium/agent-tools` loads `.agentrules.yml`, validates the schema, merges root and package rules, and renders the final agent prompt text.

This package is the isolated implementation area for MAS rule loading, validation, and prompt rendering work.

## What It Does

- Treats the workspace root rules file as the canonical source for repo-wide policy and reads it from `<workspace-root>/.agentrules.yml`.
- Reads package rules from `<package-dir>/.agentrules.yml` as bounded-context overrides.
- Surfaces package `required_reading` entries so the final prompt includes the documents that should be read before editing.
- Requires package rules to declare `inheritance.extends` pointing at the root rules file.
- Merges root and package rules with id-aware merging for arrays such as `principles`, `conventions`, and `sops`.
- Validates the merged result with `AgentRulesSchema`.
- Renders prompt text with `src/templates/base_prompt.hbs`.

## CLI Usage

From the repository root, use the wrapper script:

```bash
pnpm agent -- --package-dir packages/rendium-engine
```

From inside a package directory or a nested child directory, the wrapper can infer the target package from the current working directory:

```bash
pnpm agent
```

If you are at the repository root, always pass `--package-dir`. The wrapper cannot infer a package target from the root alone, because the root is the shared policy source rather than a package context.

The underlying package CLI is also available after build:

```bash
pnpm --filter @rendium/agent-tools build
node packages/agent-tools/dist/cli.js \
  --workspace-root . \
  --package-dir packages/rendium-engine
```

Options:

- `-w, --workspace-root`: workspace root containing the root `.agentrules.yml`.
- `-p, --package-dir`: target package directory containing package `.agentrules.yml`.
- `-h, --help`: print usage.

## Library Usage

```typescript
import { ConfigLoader, PromptRenderer } from '@rendium/agent-tools';

const rules = new ConfigLoader(workspaceRoot, packageDir).load();
const prompt = new PromptRenderer().render(rules);
```

Public exports include `AgentRulesSchema`, `ConfigLoader`, `PromptRenderer`, `runCli`, and the schema-derived rule types.

## Schema Notes

- `schema_version` is currently `1`.
- `kind` must be either `root` or `package`.
- Package rules must include `inheritance.extends`.
- IDs inside `principles`, `conventions`, and `sops` must be unique.
- SOP `outputs.key` values must be unique within each SOP.

## Verification

Use the package-local checks first:

```bash
pnpm --filter @rendium/agent-tools test
pnpm --filter @rendium/agent-tools build
pnpm --filter @rendium/agent-tools check
```

For root policy, shared script, or template changes that affect more than this package, use the workspace verification path described in the root `AGENTS.md`.
