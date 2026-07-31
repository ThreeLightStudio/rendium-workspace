# Rendium Engine Onboarding

[한국어](../ko/README.md)

This directory contains active onboarding documents that must be read before modifying `@rendium/engine`.

While historical ADRs explain the context of decisions, the documents in this directory take precedence for actual implementation decisions.

## Required Reading Order

1. `core-layer-onboarding.md`
   - Explains the canonical manifest, `LayerKind`, source/link/control policy, runtime factory, and reconciliation standards.
2. `visual-layer-provider-onboarding.md`
   - Explains how to extend the visual runtime using `VisualLayer + DrawableProvider`.

## Current Rules

- Do not add new top-level layer kinds. The kind must always be one of `visual | audio | control`.
- Add new visual elements as drawable providers, not as layer subclasses.
- Do not add compatibility shims for legacy manifests.
- Do not mix source identity, layer identity, link relationships, and scope marker semantics.
- Documents in `packages/rendium-engine/_docs/history-architecture` are background materials. The onboarding documents in this directory have higher precedence for current implementation rules.
