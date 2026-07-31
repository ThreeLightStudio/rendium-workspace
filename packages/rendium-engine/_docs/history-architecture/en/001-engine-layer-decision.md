# ADR 001: Engine Layer Structure and Multimedia Link System Design

[한국어](../ko/001-engine-layer-decision.md)

> Superseded by `009-minimal-layer-model.md`, `010-visual-layer-provider-composition.md`, and `../onboarding/core-layer-onboarding.md`. This document is retained as historical context for the earlier domain-layer design.

## Context
Structural design on how to abstract and manage multimedia assets with both visual and audio components, such as video files (`*.mp4`), as layers in `@rendium/engine`.
The key issue was: "Should the audio of the video be included in the Video Layer, or should it be separated into a separate Audio Layer?"

## Decision

### 1. Separate Layers by Rendering Subject (Separated Structure)
Instead of an integrated structure (where the video layer is also responsible for audio playback), we decided to **separate assets and layers to treat visual and audio tracks as individual layers**.
- **Visual track layer**: Dedicated only to frame rendering via WebGPU.
- **Audio Layer (`AudioLayer`)**: Dedicated to Web Audio API-based audio decoding, playback, and providing analysis data.

### 2. Delegation of Roles between Engine Layer and UI Layer
Logical grouping of layers and UI state are managed strictly on the **Studio (UI) side**, and the **Engine focuses solely on rendering independent layers**.

* **UI Part (`desktop-studio`)**: 
  - When a user drags and drops a video clip onto the timeline, the store requests the engine to create a **visual track layer and an `AudioLayer`**.
  - On the UI state management side (Zustand), both layers are assigned the same `groupId` to form a **Linked Layers** state.
  - UI-level controls (such as highlighting the video layer when hovering over the audio layer, or synchronized clip movement/trim/drag) are managed by referencing this `groupId`.

* **Engine Part (`@rendium/engine`)**: 
  - The engine does not need to know UI-dependent identifiers like `groupId`. Each layer operates strictly under the single responsibility principle.
  - However, if there is a data dependency (e.g., when a spectrum visual requires frequency analysis values from a specific audio), it references the other layer's ID via properties in `layerConfig` (such as `linkedAudioId`).

## Consequences and Benefits
1. **Engine Purity Guaranteed**: Responsibilities for WebGPU rendering and Audio playback are cleanly separated into their respective layers, making engine maintenance easier.
2. **Extensibility for Advanced Editing**: Essential NLE (Non-Linear Editing) software features—such as "unlinking video and audio clips", "deleting audio only", or "adding independent effects to audio"—can be easily implemented by simply changing the UI state (e.g., clearing the `groupId`).
3. **Data Routing Flexibility**: Based on the separated `AudioLayer`'s ID, data integration with the spectrum visual (`linkedAudioId`) can be naturally established without structural conflicts.
