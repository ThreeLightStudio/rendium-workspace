# Rendium Desktop Studio

[한국어 버전 (Korean Version)](./README.ko.md)

A free, fully local, no-login video editor (open source). Built on top of the
`@rendium/engine` declarative audio-reactive graphics/media pipeline, which is
also published as a standalone open-source SDK.

---

## 0. Core Values

Rendium Desktop Studio is built with a focus on privacy, speed, and simplicity:

- **Fully Local**: All media processing, WebGL rendering, and MP4 encoding happen on your device. In the current open-source release, imported files never leave your machine (0 server cost). If the currently excluded OpenAI chat experiment is reconnected in a future release, only the messages, editor context, and images explicitly submitted to that optional service may be sent to its provider; media processing remains local.
- **No Login Required**: Start editing immediately. No accounts, no subscriptions, no tracking.
- **Fast and Lightweight**: Designed as a "Video Notepad" that opens quickly and restores your last project automatically.
- **Permanent Asset Mapping**: Imported media files are automatically managed and mapped to your project directory, preventing broken file links when moving projects.

---

## 1. Core Architecture

Rendium Engine is designed to maximize media processing throughput and synchronize control streams between users and AI agents through the following architectural patterns:

### 1.1 Interface-First Architecture
- **Intent-Driven Separation**: To eliminate tight coupling between the UI layer (`desktop-studio`) and the reactive core engine (`@rendium/engine`), all state-changing actions are strictly defined as a unified `EngineIntent` TypeScript Discriminated Union.
- **Unified AI-UI Pipeline**: Both user mouse gestures and AI agent suggestions (AiActionPreview) route through the same `EngineIntent` specification. This guarantees structural consistency and eliminates code duplication across input channels.

### 1.2 State Management (Zustand + Immer)
- **Unidirectional Data Flow**: The engine coordinates state mutations through Zustand wrapped with Immer's immutable recipe pipeline (`produceWithPatches`).
- **Optimal JSON Patch Sync**: Instead of scanning the entire scene tree on state changes, Immer's O(1) JSON Patches are piped to `SceneReconciler`. This ensures only the affected WebGL and Web Audio API nodes are updated or instantiated, minimizing CPU overhead.

### 1.3 Client-Side Media Pipeline
- **Zero-Server Cost**: Capturing visual frames (WebGL readback) and mixing audio tracks (Web Audio mixing) are handled entirely on the client side.
- **mp4-muxer Local Muxing**: Raw video and audio frames are encoded locally using WebCodecs API (`VideoEncoder`/`AudioEncoder`) and combined via the `mp4-muxer` library, enabling users to export high-definition MP4 files directly from the Electron app.

---

## 2. Technical Achievements

### 2.1 Electron Cross-Process IPC Optimization
- **Buffered Chunk Streaming**: Instead of loading the entire compiled MP4 binary into renderer memory, encoded chunks are streamed to the Electron main process via `StreamTarget` and the `writeExportChunk` IPC channel.
- **I/O Bottleneck Mitigation**: This streaming architecture avoids main process memory spikes and mitigates IPC latency, maintaining a smooth 60fps UI render loop even during high-resolution exports.

### 2.2 Audio FFT Data & WebGL Shader Real-time Mapping
- **Frame Synchronization**: Real-time Fast Fourier Transform (FFT) frequency and time-domain analysis data are sampled from the Web Audio `AnalyserNode` on every frame tick.
- **Audio-Reactive Rendering**: Spectrum strengths are linearly interpolated and mapped to WebGL uniforms and transformation matrices. This yields fluid visual effects that synchronize precisely with audio peaks and troughs.

### 2.3 Agent Prompt Automation (`packages/agent-tools`)
- **Automated Instruction Loading**: To keep AI agents (e.g., Cursor, Cline) aligned with the core architecture constraints (like the Zustand + Immer passive view or the 1D flat layer order), we created the `@rendium/agent-tools` package.
- **Rule Composition & Validation**: It validates and merges the monorepo root-level `.agentrules.yml` policies with package-specific overrides, ensuring ID uniqueness for conventions and procedures.
- **Context-Aware Prompts**: By reading package-level `required_reading` metadata, it constructs a complete, context-aware prompt template. This forces the agent to read onboarding guides first before attempting code edits, successfully preventing regression bugs and architectural drift.

---

## 3. Project Status & Strategic Retrospective

### 3.1 Business Feasibility & Transition to Tech PoC
- **Market & Platform Shift**: With YouTube and other major media platforms introducing stricter AI content disclosure rules and automated detection, simple wrapper B2C utilities face significant platform dependency risks.
- **Workflow Friction Cost**: Analysis of early user journeys showed that a standalone desktop editor introduces context-switching friction when transferring assets manually between planning, editing, and distribution channels.
- **Free + Open-Source First, Monetization by Feedback**: Forecast demand for a
  paid subscription plan was negligible against incumbent editors like CapCut or
  Adobe Premiere. Even so, ~100 days of work in the AI era is too significant to
  shelve. The pragmatic move is to **release completely free first, build
  awareness, and revisit monetization only after real user feedback accumulates**.
  With that strategy, the project is positioned as a **"free, fully local,
  no-login video editor"**, with both Rendium Desktop Studio and `@rendium/engine`
  published as open source.

---

---

## 4. Known Limitations

- **Timeline UX**: The timeline interface is currently an active iteration area. While it supports basic layer management and dragging, advanced features like multi-track ripple editing or nested sequence previews are not yet implemented. See [TODO.md](./TODO.md) §4.10 for the current UX policy.
- **AI Assistant**: AI-powered chat and quick-prompt surfaces are disabled and not connected to an AI provider in the current open-source release, so the core editing workflow remains fully local. The underlying `aiActionParser` and `aiJsonEnvelope` logic remains in the codebase as a PoC for automated video generation. If an optional OpenAI chat integration is reconnected, its privacy notice must explain that the messages, editor context, and images submitted to the chat are sent to the provider.

## 5. Documentation Map

To navigate the codebase architecture, historical design decisions, and coding style guides, start from the following documents:

- **Technical Specification & Troubleshooting**:
  - [English Technical Spec](./docs/en/technical-spec.md)
  - [Korean Technical Spec](./docs/ko/technical-spec.md)
- **Monorepo Architecture Decisions (ADRs)**:
  - [Root Architecture Decisions (ADR-001 ~ 005)](./_docs/architecture-decisions/en)
  - [Core Engine Architecture Decisions (ADR-001 ~ 011)](./packages/rendium-engine/_docs/history-architecture/en)
  - [Desktop Studio Architecture Decisions (ADR-001 ~ 005)](./apps/desktop-studio/_docs/history-architecture/en)
- **Coding Conventions**: Reference the root [Conventions Directory](./_docs/conventions/en) for TypeScript and comment formatting guidelines.
- **Core Engine Internals (`packages/rendium-engine`)**:
  - [Engine Core Architecture](./packages/rendium-engine/_docs/en/ARCHITECTURE.md)
  - [Engine Developer Onboarding Guide](./packages/rendium-engine/_docs/onboarding/en/README.md)
- **Desktop Studio App Shell (`apps/desktop-studio`)**:
  - [App Shell Architecture & AI Deferral Decision](./apps/desktop-studio/_docs/history-architecture/en/README.md)
- **Agent Tools (`packages/agent-tools`)**:
  - [Agent Prompt Tools & CLI Guide](./packages/agent-tools/README.md)

---

## 5. Development & Verification

### 5.1 Prerequisites
- Node.js (>= 18.0.0)
- pnpm (10.33.0)

### 5.2 Installation
```bash
pnpm install
```

### 5.3 Build & Verify
```bash
pnpm verify
```
