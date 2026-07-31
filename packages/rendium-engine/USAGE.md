# @rendium/engine Usage Guide

English | [한국어](./USAGE.ko.md)

`@rendium/engine` uses `IProjectManifest` as its Single Source of Truth, and provides an intent-based API via `EngineStore` to the UI and automation layers.

## Public API

```typescript
import {
  AudioManager,
  EngineSelectors,
  INTENT_TYPES,
  engineStore,
  type EngineIntent,
  type ILayerManifest,
  type IProjectManifest,
} from '@rendium/engine';
```

The primary entry points are:

- `engineStore.dispatchIntent(intent)`: The recommended mutation API representing user edits.
- `engineStore.dispatchTransient(intent)`: Temporary updates (e.g. for drag/slider previews) that are not recorded in the manifest or history.
- `engineStore.executeAtomicIntentBatch(intents)`: Groups multiple intents into a single undo step.
- `engineStore.getSnapshot()` / `engineStore.subscribe(listener)`: Query APIs for UI subscription.
- `engineStore.toManifest()` / `engineStore.loadManifest(manifest)`: Manifest APIs for saving and restoring state.
- `engineStore.onError(listener)`: Used by the UI bridge to subscribe to `RendiumError` engine errors.

The public mutation paths for the engine are `dispatchIntent` and `executeAtomicIntentBatch`. New UI features and automation scripts should use these paths.
`dispatchIntent` handles single intents, whereas `executeAtomicIntentBatch` is separated to execute multiple intents under a single transaction and history record.

## Engine Initialization

The AudioContext must be initialized after a user gesture. In scopes that require a runtime scene (such as custom rendering hooks), `_internalScene` can be used, but general application logic should not manipulate it directly.

```typescript
import { AudioManager, engineStore } from '@rendium/engine';

await AudioManager.init();

const scene = engineStore._internalScene;
await scene.setup(device, format);
```

## Layer Manipulation

Adding, deleting, sorting, and modifying properties of layers are expressed as `EngineIntent` objects. `ADD_LAYER` requires a completed `ILayerManifest` and a target scope ID where it should be inserted.

```typescript
const textLayer: ILayerManifest = {
  id: crypto.randomUUID(),
  kind: 'visual',
  name: 'Title',
  startTime: 0,
  duration: 3,
  source: {
    sourceId: 'text:title',
    provider: 'text',
    params: { text: 'Hello Rendium' },
  },
};

engineStore.dispatchIntent({
  type: 'ADD_LAYER',
  manifest: textLayer,
  targetScopeId: selectedTextScopeId,
});

engineStore.dispatchIntent({
  type: 'UPDATE_TRANSFORM',
  layerId: textLayer.id,
  position: { x: 120, y: 80 },
});

engineStore.dispatchIntent({
  type: 'TOGGLE_VISIBILITY',
  layerId: textLayer.id,
  visible: false,
});

engineStore.dispatchIntent({
  type: 'REMOVE_LAYER',
  layerId: textLayer.id,
});
```

Scope markers or system scaffold layers cannot be moved or deleted like regular content. The `IntentRouter` validates insertions and reorderings inside scopes against scope rules and parent sequences.

## Preview and Commit

High-frequency UI inputs should update only the runtime layer using `dispatchTransient`, and dispatch the corresponding persisted intent once the user action ends.

```typescript
engineStore.dispatchTransient({
  type: 'TRANSIENT_LAYER_UPDATE',
  layerId,
  partial: { startTime: previewStartTime },
});

engineStore.dispatchIntent({
  type: 'CHANGE_START_TIME',
  layerId,
  startTime: committedStartTime,
});
```

## Save, Load, and New Project

Saving is performed by serializing the manifest, while loading runs it through the normalization pipeline.

```typescript
const manifest = engineStore.toManifest();
localStorage.setItem('rendium-project', JSON.stringify(manifest));

const saved = JSON.parse(localStorage.getItem('rendium-project') ?? '{}') as IProjectManifest;
engineStore.loadManifest(saved);

const blank = engineStore.createBlankProject('Untitled', 1920, 1080);
```

## State Subscription

In React, subscribe to state snapshots using `useSyncExternalStore` or the `useEngineStore` hook in `apps/desktop-studio`.

```typescript
const snapshot = useSyncExternalStore(
  engineStore.subscribe,
  engineStore.getSnapshot,
);
```

The snapshot is a projection for UI rendering. Saving and diff tracking must always use the manifest retrieved via `getManifest()` or `toManifest()`.

## Atomic Execution and Error Handling

Complex operations are saved as a single history record when run via `executeAtomicIntentBatch`. If any intermediate intent fails, the transaction is rolled back and a `TransactionError` is propagated.

```typescript
engineStore.executeAtomicIntentBatch([
  { type: 'ADD_LAYER', manifest: videoLayer, targetScopeId: mainScopeId },
  { type: 'ADD_LAYER', manifest: captionLayer, targetScopeId: textScopeId },
]);

const unsubscribe = engineStore.onError((error) => {
  showToast(error.message);
});
```

## Migration Cheat Sheet

| Legacy Expression | Recommended Way |
| :--- | :--- |
| Legacy direct recipe mutation | `engineStore.dispatchIntent({ type: 'ADD_LAYER', manifest, targetScopeId })` |
| `LAYER_TYPES.*` | Combination of `ILayerManifest.kind`, `source.provider`, and `control.role` |
| `getSceneConfig()` | `toManifest()` or `getManifest()` |
| `loadSceneConfig(config)` | `loadManifest(manifest)` |
| Direct import of `ManifestMutators` in UI | Create an `EngineIntent` and call `dispatchIntent` |
