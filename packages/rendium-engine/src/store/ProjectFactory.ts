import type { ILayerManifest, IProjectManifest, ScopeRoleType, ScopeRuleType } from '../_contracts';
import { PROJECT_CONFIG, PROJECT_MANIFEST_VERSION, SCENE_CONFIG } from '../_contracts';
import { createDefaultProjectInfo, createDefaultProjectSettings } from './ProjectManifestMigration';
import { sanitizeProjectName } from './ProjectNameValidation';

type ProjectScaffoldSkeleton = {
  layers: Record<string, ILayerManifest>;
  layerOrder: string[];
};

const DEFAULT_SEQUENCE_NAMES: Record<number, string> = {
  1: 'Main Media',
  2: 'Overlay',
  3: 'Text / Subtitle',
};

function createTrackPair(
  trackIndex: number,
  duration: number,
  ruleType: ScopeRuleType,
  scopeRole: ScopeRoleType,
): {
  startLayer: ILayerManifest;
  endLayer: ILayerManifest;
} {
  const trackName = DEFAULT_SEQUENCE_NAMES[trackIndex] || `Track ${trackIndex}`;

  const startId = crypto.randomUUID();
  const endId = crypto.randomUUID();
  return {
    startLayer: {
      id: startId,
      kind: 'control',
      name: trackName,
      startTime: 0,
      duration,
      control: {
        role: 'scopeStart',
        params: {
          ruleType,
          scopeRole,
          isSystem: true,
        },
      },
    },
    endLayer: {
      id: endId,
      kind: 'control',
      name: `${trackName} End`,
      startTime: 0,
      duration,
      control: {
        role: 'scopeEnd',
        targetScopeId: startId,
        params: {
          isSystem: true,
        },
      },
    },
  };
}

export function createDefaultProjectScaffold(duration = 0): ProjectScaffoldSkeleton {
  const scaffoldStartId = crypto.randomUUID();
  const scaffoldEndId = crypto.randomUUID();

  const scaffoldStart: ILayerManifest = {
    id: scaffoldStartId,
    kind: 'control',
    name: 'Project Start',
    startTime: 0,
    duration,
    control: {
      role: 'scopeStart',
      params: {
        isProjectAnchor: true,
      },
    },
  };

  const scaffoldEnd: ILayerManifest = {
    id: scaffoldEndId,
    kind: 'control',
    name: 'Project End',
    startTime: 0,
    duration,
    control: {
      role: 'scopeEnd',
      targetScopeId: scaffoldStartId,
      params: {
        isProjectAnchor: true,
      },
    },
  };

  const tracks = [
    createTrackPair(1, duration, 'freeform', 'main'),
    createTrackPair(2, duration, 'freeform', 'overlay'),
    createTrackPair(3, duration, 'freeform', 'text'),
  ];

  const layerOrder = [scaffoldStart.id];
  const layers: Record<string, ILayerManifest> = {
    [scaffoldStart.id]: scaffoldStart,
    [scaffoldEnd.id]: scaffoldEnd,
  };

  for (const track of tracks) {
    layers[track.startLayer.id] = track.startLayer;
    layers[track.endLayer.id] = track.endLayer;
    layerOrder.push(track.startLayer.id, track.endLayer.id);
  }
  layerOrder.push(scaffoldEnd.id);

  return { layers, layerOrder };
}

export const createDefaultSequenceSkeleton = createDefaultProjectScaffold;

export interface CreateBlankManifestInput {
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * ProjectFactory — Phase 5
 *
 * Provides utilities for creating standard project structures.
 * Enforces the "project scaffold" principle where every project starts
 * with an outermost anchor pair as a structural sentinel.
 */
export const ProjectFactory = {
  /**
   * Creates a blank project manifest with the mandatory scaffold pair.
   *
   * @param name Optional project name (defaults to "Untitled Project")
   */
  createBlankManifest(input: CreateBlankManifestInput = {}): IProjectManifest {
    const name = input.name ?? PROJECT_CONFIG.DEFAULT_NAME;
    const width = input.width ?? SCENE_CONFIG.DEFAULT_RESOLUTION.width;
    const height = input.height ?? SCENE_CONFIG.DEFAULT_RESOLUTION.height;
    const sanitizedName = sanitizeProjectName(name) || PROJECT_CONFIG.DEFAULT_NAME;
    const createdAt = Date.now();
    const { layers, layerOrder } = createDefaultProjectScaffold();
    const projectSettings = createDefaultProjectSettings({ width, height });

    return {
      version: PROJECT_MANIFEST_VERSION,
      projectInfo: createDefaultProjectInfo({ name: sanitizedName, createdAt }),
      projectSettings,
      layers,
      layerOrder,
      links: {},
    };
  },
};
