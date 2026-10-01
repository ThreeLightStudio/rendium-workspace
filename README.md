# Rendium Desktop Studio

English | [한국어](./README.ko.md)

A free, local, no-login video editor built with Electron, React, and a separate declarative TypeScript media engine.

Import local media → edit a timeline → preview the scene → export MP4 locally. The public source shows three engineering paths:

- **Editor state:** typed intents, immutable manifests, patch reconciliation, and undo/redo. [Mutation pipeline](./packages/rendium-engine/src/store/EngineStore.ts) · [Contract tests](./packages/rendium-engine/src/__tests__/verification.test.ts)
- **Rendering:** layer-ID lookup, ordered runtime layers, and recovery from reconciliation errors. [Reconciler](./packages/rendium-engine/src/timeline/SceneReconciler.ts) · [Recovery/order tests](./packages/rendium-engine/src/__tests__/SceneReconciler.test.ts)
- **Media output:** WebCodecs encoding, MP4 muxing, and chunk writes across Electron IPC. [Export pipeline](./apps/desktop-studio/src/renderer/src/pipeline/WebCodecsPipeline.ts) · [File handling](./apps/desktop-studio/src/main/index.ts)

## Status and scope

This is a source-stage project, with workspace packages at `0.1.0`. As of October 2, 2026, there are no GitHub Releases or installer artifacts in those releases. The engine is available as [public workspace source](./packages/rendium-engine/README.md); its package configuration alone does not establish an npm release or a stable SDK contract.

The core editing and media-output path is local. AI chat and quick-prompt entry points are disabled in the public OSS workflow; retained parsers, provider files, tests, and historical AI designs do not make that feature available. See the [OSS UI gate](./apps/desktop-studio/src/renderer/src/components/RightPanel.tsx) and [scope decisions](./TODO.md). Reconnecting an optional provider would require explaining which messages, editor context, and submitted images leave the device.

The [release scope](./RELEASE_SCOPE.md) defines an import → edit → preview → export acceptance checklist. It is a plan, not a completed device acceptance report. Timeline UX remains an iteration area ([TODO §4.10](./TODO.md#410-timeline-ux-폴리시-v1-필수--옵션-a)); professional NLE parity and broad codec compatibility are outside that release scope.

## One edit, from intent to scene

For an existing layer `image-1` whose `appearance.opacity` is `1`, a committed opacity edit can use this engine entry point:

```ts
import { engineStore } from '@rendium/engine';

engineStore.dispatchIntent({
  type: 'CHANGE_OPACITY',
  layerId: 'image-1',
  opacity: 0.5,
});
```

1. [`EngineIntent`](./packages/rendium-engine/src/_contracts/intents.contracts.ts) defines the payload; `dispatchIntent` validates it before routing.
2. [`IntentRouter`](./packages/rendium-engine/src/store/IntentRouter.ts) changes `layers['image-1'].appearance.opacity` in an Immer recipe. [`EngineStore`](./packages/rendium-engine/src/store/EngineStore.ts) creates the next manifest plus forward/inverse patches, records history, and forwards the patches to the scene.
3. The corresponding patch is shaped as `{ op: 'replace', path: ['layers', 'image-1', 'appearance', 'opacity'], value: 0.5 }`. [`SceneReconciler`](./packages/rendium-engine/src/timeline/SceneReconciler.ts) resolves the runtime layer by ID and applies `updateConfig({ opacity: 0.5 })`.
4. React consumes engine snapshots through [`useSyncExternalStore`](./apps/desktop-studio/src/renderer/src/hooks/useEngineStore.ts). Undo/redo use the recorded patches; [engine tests](./packages/rendium-engine/src/__tests__/verification.test.ts) specify persisted edits, grouped edits, and transient-preview behavior.

This illustrates the public contract, not a standalone runnable project: the layer must exist first. During a drag or slider preview, `dispatchTransient` updates runtime state without adding manifest history; the committed intent creates the undo step.

## One export, from media to file

For a timeline containing visual media and an audio layer, [`useExport`](./apps/desktop-studio/src/renderer/src/hooks/useExport.ts) passes the scene and selected export profile to `WebCodecsPipeline`:

1. `prepareExport()` crosses the [preload bridge](./apps/desktop-studio/src/preload/index.ts). The [main process](./apps/desktop-studio/src/main/index.ts) opens a save dialog, creates the chosen local file, and returns an export ID.
2. The [pipeline](./apps/desktop-studio/src/renderer/src/pipeline/WebCodecsPipeline.ts) requests a WebGPU device, renders frames, and passes them to `VideoEncoder`. When audio layers exist, it also uses `AudioEncoder`. Encoded video/audio chunks go into `mp4-muxer`.
3. The muxer's chunked `StreamTarget` calls `writeExportChunk(exportId, buffer, position)`. Electron main writes each chunk to the file handle at the supplied offset.
4. Finalization flushes the encoders, finalizes MP4 metadata, and requests file sync/close through IPC. The selected path is the output destination.

The chunked design sends muxed output incrementally instead of assembling one complete MP4 buffer in the renderer. It does not establish a memory ceiling, guaranteed hardware acceleration, or 60fps during export. The pipeline requests `prefer-hardware`; codec, GPU, and device support still matter. [`useExport` tests](./apps/desktop-studio/src/renderer/src/hooks/useExport.test.tsx) mock the pipeline and are not end-to-end encoder/file acceptance evidence.

## Design decisions and trade-offs

| Decision | Why it exists | Boundary or cost |
| --- | --- | --- |
| Typed intents write the manifest; the scene reflects patches. | Keeps editor commands separate from runtime objects and gives persisted edits forward/inverse history. | Runtime and manifest must stay synchronized; recovery can rebuild the scene. [Store](./packages/rendium-engine/src/store/EngineStore.ts) · [Recovery tests](./packages/rendium-engine/src/__tests__/SceneReconciler.test.ts) |
| Transient previews are separate from committed edits. | Avoids creating an undo entry for every pointer movement. | The UI must commit the final change explicitly. [Preview/commit fixture](./packages/rendium-engine/src/__tests__/verification.test.ts) |
| Layers have an ID registry and a separate ordered array. | Property patches address a layer directly; order changes can reuse runtime instances. | The narrow O(1) claim concerns layer-ID registry access. Reconciliation loops over patches, and reordering rebuilds an array; reconciliation as a whole is not O(1). [Scene](./packages/rendium-engine/src/core/Scene.ts) · [Reconciler](./packages/rendium-engine/src/timeline/SceneReconciler.ts) |

## Develop from source

The [CI configuration](./.github/workflows/ci.yml) selects Node.js 20 and pnpm 10.33.0; the [root package](./package.json) pins pnpm 10.33.0. From the workspace root:

```sh
pnpm install
pnpm dev:studio
```

Useful source checks and builds:

```sh
pnpm test:engine
pnpm build:studio
```

These are [workspace scripts](./package.json), not a claim that a fresh installation currently passes. At public base `3bfabbf7725cda8904f4dd8518c1edda1a59b074`, the observed [CI run](https://github.com/ThreeLightStudio/rendium-workspace/actions/runs/30613854869) failed during dependency installation and skipped verification. That is neither a passing verify nor an observed code-test failure.

`pnpm verify` runs `pnpm check`, `pnpm check:data-f:all`, and the workspace tests/builds. **`check` uses `biome check --write .`**, so verification can rewrite files; use a clean, isolated checkout. Desktop development also runs Panda CSS codegen. See the [app guide](./apps/desktop-studio/README.md) for Storybook and platform packaging commands. Packaging scripts are build entry points, not shipped installers.

## Documentation and contribution entry points

Read current contracts and implementation before using prose as an API reference. Historical ADRs explain earlier decisions and may differ from today's contracts; performance wording in older documents should not be treated as a benchmark.

- **Current engine reading path:** [Engine guide](./packages/rendium-engine/README.md) · [Onboarding](./packages/rendium-engine/_docs/onboarding/en/README.md) · [Architecture overview](./packages/rendium-engine/_docs/en/ARCHITECTURE.md)
- **App and technical setup:** [Desktop Studio](./apps/desktop-studio/README.md) · [English technical spec/troubleshooting](./docs/en/technical-spec.md) · [Korean technical spec](./docs/ko/technical-spec.md)
- **Design history:** [Root ADRs](./_docs/architecture-decisions/en) · [Engine ADRs](./packages/rendium-engine/_docs/history-architecture/en) · [Desktop ADRs](./apps/desktop-studio/_docs/history-architecture/en) · [App-shell and AI deferral record](./apps/desktop-studio/_docs/history-architecture/en/README.md)
- **Contributor tools:** [Conventions](./_docs/conventions/en) · [Agent prompt tools and CLI](./packages/agent-tools/README.md) · [Contributing](./CONTRIBUTING.md)

`agent-tools` loads and validates root/package rules and renders prompts with required-reading entries. This helps communicate architecture constraints; it is not proof that agents always comply or that regressions are prevented. [Loader](./packages/agent-tools/src/ConfigLoader.ts) · [Schema](./packages/agent-tools/src/AgentRulesSchema.ts) · [Renderer](./packages/agent-tools/src/PromptRenderer.ts)
