import { describe, expect, it, vi } from 'vitest';
import type {
  ILayerManifest,
  IProjectManifest,
  SourceProviderKind,
  SourceTrackKind,
} from '../_contracts';
import { Scene } from '../core/Scene';
import { RuntimeLayerFactory } from '../layers/factories';
import { ScopeEndLayer } from '../layers/scope/ScopeEndLayer';
import { ScopeStartLayer } from '../layers/scope/ScopeStartLayer';
import { VisualLayer } from '../layers/visual/VisualLayer';
import { engineStore } from '../store/EngineStore';
import { ProjectFactory } from '../store/ProjectFactory';
import { normalizeProjectManifest } from '../store/ProjectManifestMigration';
import { SceneReconciler } from '../timeline/SceneReconciler';

function visualLayer(
  id: string,
  provider: SourceProviderKind,
  track: SourceTrackKind = 'visual',
): ILayerManifest {
  return {
    id,
    kind: 'visual',
    startTime: 0,
    duration: 5,
    source: { sourceId: `source:${id}`, provider, track },
  };
}

function audioLayer(
  id: string,
  provider: SourceProviderKind = 'audio-file',
  track: SourceTrackKind = 'audio',
): ILayerManifest {
  return {
    id,
    kind: 'audio',
    startTime: 0,
    duration: 5,
    source: { sourceId: `source:${id}`, provider, track },
  };
}

describe('minimal layer model contract', () => {
  it('normalizes version 1.0 manifests and default links', () => {
    const layer = visualLayer('image', 'raster');
    const manifest = normalizeProjectManifest({
      version: '1.0',
      layers: { image: layer },
      layerOrder: ['image'],
    });

    expect(manifest.version).toBe('1.0');
    expect(manifest.links).toEqual({});
    expect(Object.values(manifest.layers)[0]?.kind).toBe('visual');
  });

  it('rejects legacy version, type, and props input', () => {
    expect(() =>
      normalizeProjectManifest({
        version: '2.0',
        layers: {},
        layerOrder: [],
      }),
    ).toThrow(/unsupported manifest version/);

    expect(() =>
      normalizeProjectManifest({
        version: '1.0',
        layers: {
          legacy: {
            id: 'legacy',
            type: 'image',
            startTime: 0,
            duration: 1,
            props: {},
          },
        },
        layerOrder: ['legacy'],
      }),
    ).toThrow(/legacy "type"/);
  });

  it('rejects missing layerOrder and link references', () => {
    expect(() =>
      normalizeProjectManifest({
        version: '1.0',
        layers: {},
        layerOrder: ['missing'],
      }),
    ).toThrow(/layerOrder references missing layer/);

    const layer = visualLayer('image', 'raster');
    expect(() =>
      normalizeProjectManifest({
        version: '1.0',
        layers: { image: layer },
        layerOrder: ['image'],
        links: {
          bad: {
            id: 'bad',
            from: 'image',
            to: 'missing',
            roles: ['dependsOn'],
          },
        },
      }),
    ).toThrow(/link "bad" references missing to layer/);
  });

  it('rejects malformed layer records and non-array layer order', () => {
    expect(() =>
      normalizeProjectManifest({
        version: '1.0',
        layers: { malformed: null },
        layerOrder: ['malformed'],
      }),
    ).toThrow(/layer "malformed" must be an object/);

    expect(() =>
      normalizeProjectManifest({
        version: '1.0',
        layers: {},
        layerOrder: 'not-an-array',
      }),
    ).toThrow(/layerOrder must be an array/);
  });

  it('rejects invalid colors and unsupported source or control fields', () => {
    expect(() =>
      normalizeProjectManifest({
        version: '1.0',
        layers: {},
        layerOrder: [],
        projectSettings: {
          canvas: {
            backgroundColor: [1, 1, 1],
          },
        },
      }),
    ).toThrow(/backgroundColor must be a four-number color tuple/);

    expect(() =>
      normalizeProjectManifest({
        version: '1.0',
        layers: {
          visual: {
            id: 'visual',
            kind: 'visual',
            startTime: 0,
            duration: 1,
            source: {
              sourceId: 'source:visual',
              provider: 'unsupported-provider',
            },
          },
        },
        layerOrder: ['visual'],
      }),
    ).toThrow(/source\.provider is unsupported/);

    expect(() =>
      normalizeProjectManifest({
        version: '1.0',
        layers: {
          control: {
            id: 'control',
            kind: 'control',
            startTime: 0,
            duration: 1,
            control: {
              role: 'unsupported-role',
            },
          },
        },
        layerOrder: ['control'],
      }),
    ).toThrow(/control\.role is unsupported/);
  });
});

describe('minimal layer model mapping', () => {
  it('represents known editor elements with kind plus source/control metadata', () => {
    const image = visualLayer('image', 'raster');
    const videoVisual = visualLayer('video-visual', 'video', 'visual');
    const text = visualLayer('text', 'text');
    const spectrum = visualLayer('spectrum', 'generated-visual');
    const audio = audioLayer('audio');
    const videoAudio = audioLayer('video-audio', 'video', 'audio');
    const scopeStart: ILayerManifest = {
      id: 'scope-start',
      kind: 'control',
      startTime: 0,
      duration: 0,
      control: { role: 'scopeStart' },
    };

    expect([image, videoVisual, text, spectrum].every((layer) => layer.kind === 'visual')).toBe(
      true,
    );
    expect([audio, videoAudio].every((layer) => layer.kind === 'audio')).toBe(true);
    expect(scopeStart.kind).toBe('control');
    expect(scopeStart.control?.role).toBe('scopeStart');
  });
});

describe('runtime factory', () => {
  it('creates runtime paths from new manifest shape only', () => {
    const image = RuntimeLayerFactory.create(visualLayer('image', 'raster'));
    const video = RuntimeLayerFactory.create(visualLayer('video', 'video'));
    const text = RuntimeLayerFactory.create(visualLayer('text', 'text'));
    const spectrum = RuntimeLayerFactory.create(visualLayer('spectrum', 'generated-visual'));

    expect(image).toBeInstanceOf(VisualLayer);
    expect(video).toBeInstanceOf(VisualLayer);
    expect(text).toBeInstanceOf(VisualLayer);
    expect(spectrum).toBeInstanceOf(VisualLayer);
    expect((image as VisualLayer).visualProvider.providerKind).toBe('raster');
    expect((video as VisualLayer).visualProvider.providerKind).toBe('video');
    expect((text as VisualLayer).visualProvider.providerKind).toBe('text');
    expect((spectrum as VisualLayer).visualProvider.providerKind).toBe('generated-visual');
    expect(RuntimeLayerFactory.create(audioLayer('audio'))).toMatchObject({ kind: 'audio' });
    expect(
      RuntimeLayerFactory.create({
        id: 'scope-start',
        kind: 'control',
        startTime: 0,
        duration: 0,
        control: { role: 'scopeStart' },
      }),
    ).toBeInstanceOf(ScopeStartLayer);
    expect(
      RuntimeLayerFactory.create({
        id: 'scope-end',
        kind: 'control',
        startTime: 0,
        duration: 0,
        control: { role: 'scopeEnd', targetScopeId: 'scope-start' },
      }),
    ).toBeInstanceOf(ScopeEndLayer);
  });

  it('throws for unsupported provider and control combinations', () => {
    expect(() => RuntimeLayerFactory.create(visualLayer('shape', 'shape'))).toThrow(
      /Unsupported visual source provider/,
    );
    expect(() =>
      RuntimeLayerFactory.create({
        id: 'camera',
        kind: 'control',
        startTime: 0,
        duration: 0,
        control: { role: 'camera' },
      }),
    ).toThrow(/Unsupported control layer role/);
  });
});

describe('engine store public surface', () => {
  it('does not expose the legacy recipe mutation API', () => {
    expect('dispatch' in (engineStore as unknown as Record<string, unknown>)).toBe(false);
  });

  it('returns manifest snapshots instead of the canonical store reference', () => {
    const baseline = structuredClone(engineStore.getManifest()) as IProjectManifest;
    try {
      engineStore.loadManifest(
        ProjectFactory.createBlankManifest({ name: 'SnapshotTest', width: 1920, height: 1080 }),
      );
      const snapshot = engineStore.getManifest();

      (snapshot as IProjectManifest).projectInfo.name = 'Externally Mutated';

      expect(engineStore.getManifest().projectInfo.name).toBe('SnapshotTest');
      expect(engineStore.toManifest()).not.toBe(engineStore.getManifest());
    } finally {
      engineStore.loadManifest(baseline);
    }
  });

  it('rejects malformed public intent payloads before routing', () => {
    expect(() =>
      engineStore.dispatchIntent({
        type: 'CHANGE_OPACITY',
        layerId: 'missing-opacity',
      }),
    ).toThrow(/Invalid engine intent payload/);
  });

  it('keeps HOVER_LAYER outside persisted manifest routing', () => {
    engineStore.dispatchIntent({ type: 'HOVER_LAYER', layerId: 'hovered-layer' });
    expect(engineStore.hoveredLayerId).toBe('hovered-layer');

    engineStore.dispatchIntent({ type: 'HOVER_LAYER', layerId: null });
    expect(engineStore.hoveredLayerId).toBeNull();
  });
});

describe('engine store mutation pipeline', () => {
  function withRestoredManifest<T>(fn: () => T): T {
    const baseline = structuredClone(engineStore.getManifest());
    try {
      return fn();
    } finally {
      engineStore.loadManifest(baseline);
    }
  }

  function findPrimaryScopeStartId(): string {
    const manifest = engineStore.getManifest();
    const scopeStartId = manifest.layerOrder.find((id) => {
      const layer = manifest.layers[id];
      return (
        layer?.kind === 'control' &&
        layer.control?.role === 'scopeStart' &&
        layer.control.params?.isProjectAnchor !== true
      );
    });
    if (!scopeStartId) {
      throw new Error('Expected a non-anchor scopeStart layer in the blank project scaffold.');
    }
    return scopeStartId;
  }

  it('applies persisted intents and supports undo/redo', () =>
    withRestoredManifest(() => {
      engineStore.loadManifest(
        ProjectFactory.createBlankManifest({ name: 'EngineStoreTest', width: 1920, height: 1080 }),
      );
      const scopeStartId = findPrimaryScopeStartId();
      const layer = audioLayer('intent-layer');

      engineStore.dispatchIntent({
        type: 'ADD_LAYER',
        manifest: layer,
        targetScopeId: scopeStartId,
      });

      expect(engineStore.getManifest().layers[layer.id]).toBeDefined();
      expect(engineStore.undoStackSize).toBe(1);

      engineStore.undo();
      expect(engineStore.getManifest().layers[layer.id]).toBeUndefined();
      expect(engineStore.redoStackSize).toBe(1);

      engineStore.redo();
      expect(engineStore.getManifest().layers[layer.id]).toBeDefined();
    }));

  it('creates a runtime video visual layer through ADD_LAYER', () =>
    withRestoredManifest(() => {
      engineStore.loadManifest(
        ProjectFactory.createBlankManifest({ name: 'EngineStoreTest', width: 1920, height: 1080 }),
      );
      const scopeStartId = findPrimaryScopeStartId();
      const layer = visualLayer('intent-video', 'video');

      engineStore.dispatchIntent({
        type: 'ADD_LAYER',
        manifest: layer,
        targetScopeId: scopeStartId,
      });

      expect(engineStore.getManifest().layers[layer.id]).toBeDefined();
      expect(engineStore.getManifest().layerOrder).toContain(layer.id);
      const runtimeLayer = engineStore.getLayerById(layer.id);
      expect(runtimeLayer).toBeInstanceOf(VisualLayer);
      expect((runtimeLayer as VisualLayer).visualProvider.providerKind).toBe('video');
    }));

  it('groups atomic batches into a single undo step', () =>
    withRestoredManifest(() => {
      engineStore.loadManifest(
        ProjectFactory.createBlankManifest({ name: 'EngineStoreTest', width: 1920, height: 1080 }),
      );
      const scopeStartId = findPrimaryScopeStartId();
      const layer = audioLayer('batch-layer-a');

      engineStore.executeAtomicIntentBatch([
        {
          type: 'ADD_LAYER',
          manifest: layer,
          targetScopeId: scopeStartId,
        },
        {
          type: 'UPDATE_LAYER_PROPS',
          layerId: layer.id,
          patch: { startTime: 3 },
        },
      ]);

      expect(engineStore.getManifest().layers[layer.id]).toBeDefined();
      expect(engineStore.getManifest().layers[layer.id]?.startTime).toBe(3);
      expect(engineStore.undoStackSize).toBe(1);

      engineStore.undo();
      expect(engineStore.getManifest().layers[layer.id]).toBeUndefined();

      engineStore.redo();
      expect(engineStore.getManifest().layers[layer.id]).toBeDefined();
      expect(engineStore.getManifest().layers[layer.id]?.startTime).toBe(3);
    }));

  it('keeps transient layer updates out of manifest history until committed', () =>
    withRestoredManifest(() => {
      const layerId = 'transient-transform-image';
      const startPosition = { x: 10, y: 20 };
      const endPosition = { x: 140, y: 90 };
      engineStore.loadManifest(
        normalizeProjectManifest({
          version: '1.0',
          layers: {
            [layerId]: {
              ...visualLayer(layerId, 'raster'),
              transform: {
                position: startPosition,
                scale: { x: 1, y: 1 },
                rotation: 0,
              },
            },
          },
          layerOrder: [layerId],
          canvasSize: { width: 1920, height: 1080 },
        }),
      );

      engineStore.dispatchTransient({
        type: 'TRANSIENT_LAYER_UPDATE',
        layerId,
        partial: { position: endPosition },
      });

      expect(engineStore.getManifest().layers[layerId]?.transform?.position).toEqual(startPosition);
      expect(engineStore.getLayerById(layerId)?.getConfig().position).toEqual(endPosition);
      expect(engineStore.undoStackSize).toBe(0);

      engineStore.executeAtomicIntentBatch([
        {
          type: 'UPDATE_TRANSFORM',
          layerId,
          position: endPosition,
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
      ]);

      expect(engineStore.getManifest().layers[layerId]?.transform?.position).toEqual(endPosition);
      expect(engineStore.undoStackSize).toBe(1);

      engineStore.undo();
      expect(engineStore.getManifest().layers[layerId]?.transform?.position).toEqual(startPosition);
      expect(engineStore.redoStackSize).toBe(1);

      engineStore.redo();
      expect(engineStore.getManifest().layers[layerId]?.transform?.position).toEqual(endPosition);
    }));

  it('reconciles undo and redo for atomic batches that add multiple layers', () =>
    withRestoredManifest(() => {
      engineStore.loadManifest(
        ProjectFactory.createBlankManifest({ name: 'EngineStoreTest', width: 1920, height: 1080 }),
      );
      const scopeStartId = findPrimaryScopeStartId();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        engineStore.executeAtomicIntentBatch([
          {
            type: 'ADD_LAYER',
            manifest: visualLayer('batch-image', 'raster'),
            targetScopeId: scopeStartId,
          },
          {
            type: 'ADD_LAYER',
            manifest: audioLayer('batch-audio'),
            targetScopeId: scopeStartId,
          },
          {
            type: 'ADD_LAYER',
            manifest: visualLayer('batch-overlay', 'raster'),
            targetScopeId: scopeStartId,
          },
        ]);

        expect(engineStore.undoStackSize).toBe(1);

        engineStore.undo();
        expect(engineStore.getManifest().layers['batch-image']).toBeUndefined();
        expect(engineStore.getManifest().layers['batch-audio']).toBeUndefined();
        expect(engineStore.getManifest().layers['batch-overlay']).toBeUndefined();

        engineStore.redo();
        expect(engineStore.getManifest().layers['batch-image']).toBeDefined();
        expect(engineStore.getManifest().layers['batch-audio']).toBeDefined();
        expect(engineStore.getManifest().layers['batch-overlay']).toBeDefined();
        expect(errorSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('[SceneReconciler] Patch error'),
          expect.anything(),
          expect.anything(),
        );
      } finally {
        errorSpy.mockRestore();
      }
    }));
});

describe('source params hydration', () => {
  it('preserves provider params during manifest normalization', () => {
    const manifest = normalizeProjectManifest({
      version: '1.0',
      layers: {
        image: {
          ...visualLayer('image', 'raster'),
          source: {
            sourceId: 'asset:image',
            provider: 'raster',
            track: 'visual',
            params: {
              sourceUrl: 'rendium-asset://project/files/image.png',
              fit: 'contain',
            },
          },
        },
      },
      layerOrder: ['image'],
    });

    // biome-ignore lint/complexity/useLiteralKeys: manifest.layers is a Record<string, T> which requires bracket access in TS
    expect(manifest.layers['image']?.source?.params).toEqual({
      sourceUrl: 'rendium-asset://project/files/image.png',
      fit: 'contain',
    });
  });

  it('hydrates image, audio, text, and spectrum runtime config from source params', () => {
    const scene = new Scene();
    const image = scene.instantiateLayer({
      ...visualLayer('image', 'raster'),
      source: {
        sourceId: 'asset:image',
        provider: 'raster',
        track: 'visual',
        params: { sourceUrl: null, fit: 'cover' },
      },
    });
    const audio = scene.instantiateLayer({
      ...audioLayer('audio'),
      source: {
        sourceId: 'asset:audio',
        provider: 'audio-file',
        track: 'audio',
        params: {
          sourceUrl: 'rendium-asset://project/files/audio.wav',
          volume: 0.4,
          muted: true,
        },
      },
    });
    const text = scene.instantiateLayer({
      ...visualLayer('text', 'text'),
      source: {
        sourceId: 'text:text',
        provider: 'text',
        track: 'visual',
        params: {
          text: 'Hello',
          fontSize: 42,
          color: [1, 0, 0, 1],
        },
      },
    });
    const spectrum = scene.instantiateLayer({
      ...visualLayer('spectrum', 'generated-visual'),
      source: {
        sourceId: 'generated:spectrum',
        provider: 'generated-visual',
        track: 'visual',
        params: {
          linkedAudioId: 'audio',
          bandCount: 24,
          gain: 0.7,
        },
      },
    });

    expect(image.getConfig()).toMatchObject({ fit: 'cover' });
    expect(audio.getConfig()).toMatchObject({
      sourceUrl: 'rendium-asset://project/files/audio.wav',
      volume: 0.4,
      muted: true,
    });
    expect(text.getConfig()).toMatchObject({
      text: 'Hello',
      fontSize: 42,
      color: [1, 0, 0, 1],
    });
    expect(spectrum.getConfig()).toMatchObject({
      linkedAudioId: 'audio',
      bandCount: 24,
      gain: 0.7,
    });
  });
});

describe('scene reconciliation with links', () => {
  it('keeps links outside render order', () => {
    const manifest = ProjectFactory.createBlankManifest({ name: 'Links' });
    const scene = new Scene();
    const reconciler = new SceneReconciler(scene, () => manifest);

    reconciler.reconcile([{ op: 'replace', path: [], value: manifest }]);
    const before = scene.layers.map((layer) => layer.id);

    reconciler.reconcile([
      {
        op: 'add',
        path: ['links', 'link-1'],
        value: {
          id: 'link-1',
          from: before[0],
          to: before[1],
          roles: ['dependsOn'],
        },
      },
    ]);

    expect(scene.layers.map((layer) => layer.id)).toEqual(before);
  });
});
