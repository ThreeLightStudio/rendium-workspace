# OSS Contest Release Decisions

This document records product decisions for the OSS Contest release. These decisions protect the release from scope creep and keep the team focused on the smallest strong demo.

## Decision 1: Position Rendium as a local-first video creation tool with an open-source engine

### Decision

Rendium will be presented as a local-first desktop video creation tool powered by an open-source media rendering engine.

### Why

The current project has both a working Desktop Studio and a separately structured `@rendium/engine`. The strongest contest story is the combination: a visible local creation workflow for judges and an inspectable engine architecture for open-source reviewers.

### Impact

This avoids competing directly with mature professional video editors and avoids presenting Rendium as a broad content platform.

### Revisit

After the contest release and after contributor feedback on the engine boundary.

## Decision 2: Optimize for Import → Edit → Preview → Export → Result

### Decision

The Golden Path is the only required product workflow for the contest release.

### Why

A reliable three-minute demo is more valuable than a larger but fragile feature set. The current codebase already contains many features, so the release risk is breadth rather than ambition.

### Impact

Any work that does not improve import, edit, preview, export, result, save, reload, or demo reliability is deprioritized.

### Revisit

After the Golden Path passes release QA 10 consecutive times.

## Decision 3: Exclude AI editing from the contest scope

### Decision

AI editing, AI chat, AI action execution, AI metadata, and AI recommendations are not contest-critical features.

### Why

AI features increase setup, key management, provider variability, UX surface area, and judging confusion. They also shift attention away from the local-first engine and export story.

### Impact

AI UI may remain in the codebase, but the contest demo and release messaging should not require it. Fixes to AI are lower priority than Golden Path reliability.

### Revisit

After the contest, if the core local editing loop is stable and users ask for AI-assisted workflows.

## Decision 4: Exclude cloud sync

### Decision

Cloud sync is out of scope for the OSS Contest release.

### Why

The release identity is local-first. Cloud sync would require accounts, backend state, conflict handling, privacy messaging, and operational responsibility.

### Impact

Project persistence work should focus on local save, reload, and asset references.

### Revisit

Only after local project persistence is proven reliable and there is explicit user demand.

## Decision 5: Exclude collaboration

### Decision

Realtime collaboration, shared workspaces, and team editing are out of scope.

### Why

Collaboration adds product and infrastructure complexity that does not improve the contest Golden Path.

### Impact

No work should introduce user accounts, permissions, presence, comments, or multiplayer editing for this release.

### Revisit

After a stable single-user local release exists.

## Decision 6: Exclude 4K and 8K optimization claims

### Decision

The contest release will not claim production-grade 4K or 8K export performance.

### Why

Export correctness and repeatability matter more than high-resolution performance claims. Performance claims create avoidable judging risk.

### Impact

The demo should use a verified asset and conservative export profile. Performance work is limited to issues that block the default demo export.

### Revisit

After default MP4 export is stable and benchmarked on multiple machines.

## Decision 7: Treat MP4 export as release-critical

### Decision

Default MP4 export is a Must Have release requirement.

### Why

Export is the proof that Rendium is more than a preview UI. The local-first creation loop is incomplete without a local result file.

### Impact

Export bugs outrank most UI polish, AI, spectrum, metadata, and advanced timeline features.

### Revisit

After export succeeds 10 consecutive times with the verified demo project.

## Decision 8: Treat save and reload as release-critical

### Decision

Save → Reload must preserve the Golden Path project and assets.

### Why

Open-source judges and developers will restart apps, inspect code, and retry flows. Losing local project state damages trust more than missing optional features.

### Impact

Asset persistence, local storage, and file reference integrity outrank optional feature polish.

### Revisit

After Save → Reload succeeds 10 consecutive times with the verified demo project.

## Decision 9: Limit timeline editing to stable basics

### Decision

The contest demo should use only stable timeline interactions: seek, scrub, playback, placement, and optionally one verified move, trim, or split.

### Why

Timeline features are high-value but high-risk, especially with linked video/audio layers and sequence scopes.

### Impact

Advanced timeline behaviors should not be required for the demo. Bugs in optional timeline interactions do not block release unless they affect the Golden Path.

### Revisit

After the base Golden Path passes release QA.

## Decision 10: Keep spectrum visualizer optional

### Decision

Spectrum visualizer is Could Have for the contest release.

### Why

It is technically interesting but not essential to proving the local creation loop.

### Impact

Spectrum-specific bugs should not block release unless they affect shared audio, preview, or export paths used by the demo.

### Revisit

After core image/video/text export is stable.

## Decision 11: Do not present Rendium as a workflow platform

### Decision

Workflow platform, template marketplace, plugin marketplace, and multi-project dashboard messaging are excluded from the contest release.

### Why

These messages make the project look broader but less complete. The current strongest proof is one complete local editing loop.

### Impact

Docs and demo scripts should avoid platform language unless referring to future possibilities outside the release scope.

### Revisit

After the first public OSS release has real contributor feedback.

## Decision 12: Keep agent tooling separate from the product story

### Decision

Agent tooling is not part of the contest product demo.

### Why

Agent tooling may help development, but it can confuse judges evaluating Rendium as a creative tool and open-source media engine.

### Impact

Agent tooling should not be featured in the main contest flow. It may remain documented for contributors where appropriate.

### Revisit

After the contest when contributor automation and maintenance workflows become a priority.

## Decision 13: Prefer narrow reliability fixes over broad polish

### Decision

Release work should prioritize bugs and documentation that protect the Golden Path.

### Why

The project already has enough surface area. Additional polish across unrelated features increases risk without strengthening the demo.

### Impact

Broad refactors, visual redesigns, and optional feature cleanup are deferred unless they directly unblock the contest path.

### Revisit

After the contest branch or release tag is cut.

## Decision 14: Document limitations explicitly

### Decision

Known limitations and out-of-scope areas should be stated in release docs.

### Why

Open-source reviewers reward clarity. Honest scope boundaries make the project easier to evaluate and contribute to.

### Impact

README and release docs should explain what works, what is intentionally excluded, and where contributors can help later.

### Revisit

Before tagging the contest release and again after judging feedback.

## Decision 15: Support one verified macOS screen-recording MOV path

### Decision

The OSS Contest release supports a verified H.264 MOV produced by macOS screen recording when Electron can load its metadata, decode a first frame, and start muted playback. It does not claim support for every MOV container or codec.

### Why

MOV is a container, not a codec guarantee. A file extension cannot prove Chromium/Electron can decode it. The narrow Golden Path needs a real renderer probe before persistence so a supported macOS screen recording works while incompatible MOV inputs fail clearly.

### Impact

The app may offer `.mov` in the video picker, but only persists it and creates layers after metadata, first-frame decode, and muted playback succeed. Failed probes must not become image assets or silent timeline failures. The contest demo uses a verified H.264 macOS screen recording.

### Revisit

After the contest, if user demand justifies broader codec reporting or a transcoding pipeline.
