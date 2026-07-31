import {
  type ILayerManifest,
  type IProjectManifest,
  type JsonValue,
  type ScopeRoleType,
  engineStore,
} from '@rendium/engine';
import type { Decorator } from '@storybook/react';
import type { AiAssetRecommendationEnvelope } from '../services/AiService';
import type { ProjectAssetRecord } from '../stores/projectAssetTypes';
import { useStudioStore } from '../stores/studioStore';
import { useAiChatStore } from '../stores/useAiChatStore';
import { useProjectAssetsStore } from '../stores/useProjectAssetsStore';
import type { StudioLayerType } from '../utils/canonicalLayer';
import { TIMELINE_SOFT_TARGET_SECONDS } from '../utils/timelineViewport';

export const STORY_PROJECT_ID = 'storybook-assets';

export type StoryLayerFixture = {
  id: string;
  studioType: StudioLayerType;
  name?: string;
  startTime?: number;
  duration?: number;
  visible?: boolean;
  scopeRole?: ScopeRoleType;
  isProjectAnchor?: boolean;
  params?: Record<string, JsonValue>;
};

export type StoryProjectFixture = {
  name: string;
  layers: StoryLayerFixture[];
};

export interface StorybookFixtureDecoratorOptions {
  projectId?: string;
  projectName?: string;
  manifest?: IProjectManifest;
  rightPanelView?: 'layers' | 'project';
  assets?: ProjectAssetRecord[];
  isLoading?: boolean;
  isSaving?: boolean;
  error?: string | null;
  recommendation?: AiAssetRecommendationEnvelope | null;
}

type StorybookRendererApi = {
  getPathForFile: (file: File) => string;
  readFileAsArrayBuffer: (filePath: string) => Promise<ArrayBuffer>;
  startExport: (config: { width: number; height: number; fps: number }) => Promise<void>;
  sendFrame: (buffer: ArrayBuffer) => void;
  endExport: () => Promise<void>;
  prepareExport: (
    originPath?: string,
  ) => Promise<{ success: boolean; exportId?: string; filePath?: string; error?: string }>;
  writeExportChunk: (
    exportId: string,
    buffer: ArrayBuffer,
    position: number,
  ) => Promise<{ success: boolean; error?: string }>;
  finalizeExport: (exportId: string) => Promise<{ success: boolean; error?: string }>;
  abortExport: (exportId: string) => Promise<{ success: boolean; error?: string }>;
  projectAssets: {
    storeFile: (request: {
      projectId: string;
      sourcePath: string;
      contentHash: string;
    }) => Promise<{
      success: boolean;
      filePath?: string;
      sourceUrl?: string;
      copied?: boolean;
      error?: string;
    }>;
    deleteFile: (request: { projectId: string; filePath: string }) => Promise<{
      success: boolean;
      error?: string;
    }>;
  };
  aiChat: {
    start: (request: unknown) => Promise<{ success: boolean; error?: string }>;
    cancel: (requestId: string) => Promise<{ success: boolean; error?: string }>;
    onEvent: (listener: (event: unknown) => void) => () => void;
  };
};

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function guessExtension(sourcePath: string): string {
  const dotIndex = sourcePath.lastIndexOf('.');
  return dotIndex >= 0 ? sourcePath.slice(dotIndex) : '.asset';
}

function getInitialStoreState<TState extends object>(store: {
  getState: () => TState;
  getInitialState?: () => TState;
}): TState {
  return store.getInitialState?.() ?? store.getState();
}

export function createThumbnailDataUrl(label: string, backgroundColor = '#111827'): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${backgroundColor}" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)" />
      <circle cx="1080" cy="160" r="110" fill="rgba(255,255,255,0.08)" />
      <circle cx="210" cy="540" r="160" fill="rgba(0,212,255,0.12)" />
      <text x="88" y="336" fill="#f8fafc" font-size="72" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-weight="700">
        ${escapeXml(label)}
      </text>
      <text x="88" y="414" fill="rgba(248,250,252,0.72)" font-size="28" font-family="Inter, ui-sans-serif, system-ui, sans-serif">
        Storybook thumbnail
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function createStoryAsset(overrides: {
  id: string;
  displayName: string;
  projectId?: string;
  contentHash?: string;
  sourceUrl?: string | null;
  lastKnownSourceUrl?: string | null;
  importedFromPath?: string | null;
  assetKind?: ProjectAssetRecord['assetKind'];
  mimeType?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  status?: 'ready' | 'missing';
  createdAt?: number;
  updatedAt?: number;
}): ProjectAssetRecord {
  const projectId = overrides.projectId ?? STORY_PROJECT_ID;
  const contentHash = overrides.contentHash ?? `hash-${overrides.id}`;
  const internalSourceUrl =
    overrides.sourceUrl ?? `rendium-asset://${projectId}/files/${contentHash}.png`;
  const sourceUrl =
    overrides.sourceUrl !== undefined
      ? overrides.sourceUrl
      : overrides.status === 'missing'
        ? null
        : internalSourceUrl;
  const lastKnownSourceUrl =
    overrides.lastKnownSourceUrl ??
    sourceUrl ??
    `rendium-asset://${projectId}/files/${contentHash}.png`;
  const now = overrides.createdAt ?? 1_700_000_000_000;

  return {
    id: overrides.id,
    projectId,
    assetKind: overrides.assetKind ?? 'image',
    contentHash,
    displayName: overrides.displayName,
    sourceUrl,
    lastKnownSourceUrl,
    importedFromPath: overrides.importedFromPath ?? null,
    mimeType: overrides.mimeType ?? 'image/png',
    size: overrides.size ?? 1024,
    width: overrides.width ?? 1280,
    height: overrides.height ?? 720,
    durationSeconds: overrides.durationSeconds ?? null,
    status: overrides.status ?? 'ready',
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function createStoryWindowApi(): StorybookRendererApi {
  return {
    getPathForFile: (file: File) => `/storybook/${file.name}`,
    readFileAsArrayBuffer: async (_filePath: string) => new ArrayBuffer(0),
    startExport: async () => undefined,
    sendFrame: () => undefined,
    endExport: async () => undefined,
    prepareExport: async () => ({ success: false }),
    writeExportChunk: async () => ({ success: false }),
    finalizeExport: async () => ({ success: false }),
    abortExport: async () => ({ success: false }),
    projectAssets: {
      storeFile: async (request: {
        projectId: string;
        sourcePath: string;
        contentHash: string;
      }) => ({
        success: true,
        filePath: `/storybook/project-assets/${request.projectId}/files/${request.contentHash}${guessExtension(request.sourcePath)}`,
        sourceUrl: `rendium-asset://${request.projectId}/files/${request.contentHash}${guessExtension(request.sourcePath)}`,
        copied: true,
      }),
      deleteFile: async () => ({ success: true }),
    },
    aiChat: {
      start: async () => ({ success: false }),
      cancel: async () => ({ success: true }),
      onEvent: () => () => undefined,
    },
  };
}

export function installStoryWindowApi(): StorybookRendererApi {
  const api = createStoryWindowApi();
  const target = window as unknown as Window & { api?: StorybookRendererApi };
  Object.defineProperty(target, 'api', {
    configurable: true,
    writable: true,
    value: api,
  });
  return api;
}

export function createStoryProjectManifest({
  name,
  layers,
}: StoryProjectFixture): IProjectManifest {
  const manifestLayers: Record<string, ILayerManifest> = {};
  const layerOrder: string[] = [];

  for (const layer of layers) {
    const isScopeStart = layer.studioType === 'scope:start';
    const isScopeEnd = layer.studioType === 'scope:end';
    const baseLayer = {
      id: layer.id,
      name: layer.name ?? layer.id,
      startTime: layer.startTime ?? 0,
      duration: layer.duration ?? 1,
      ...(!isScopeEnd
        ? {
            appearance: {
              visible: layer.visible ?? true,
              opacity: 1,
            },
          }
        : {}),
    };

    if (isScopeStart || isScopeEnd) {
      manifestLayers[layer.id] = {
        ...baseLayer,
        kind: 'control',
        control: {
          role: isScopeStart ? 'scopeStart' : 'scopeEnd',
          params: {
            ...(layer.scopeRole ? { scopeRole: layer.scopeRole } : {}),
            ...(layer.isProjectAnchor ? { isProjectAnchor: true } : {}),
          },
        },
      };
    } else if (layer.studioType === 'audio') {
      manifestLayers[layer.id] = {
        ...baseLayer,
        kind: 'audio',
        source: {
          sourceId: `audio:${layer.id}`,
          provider: 'audio-file',
          track: 'audio',
          params: {
            sourceUrl: null,
            volume: 1,
            muted: false,
            ...(layer.params ?? {}),
          },
        },
      };
    } else {
      const provider =
        layer.studioType === 'video'
          ? 'video'
          : layer.studioType === 'text'
            ? 'text'
            : layer.studioType === 'spectrum'
              ? 'generated-visual'
              : 'raster';
      manifestLayers[layer.id] = {
        ...baseLayer,
        kind: 'visual',
        source: {
          sourceId: `${provider}:${layer.id}`,
          provider,
          track: 'visual',
          params: {
            ...(layer.studioType === 'text' ? { text: layer.name ?? layer.id } : {}),
            ...(layer.params ?? {}),
          },
        },
      };
    }

    layerOrder.push(layer.id);
  }

  return {
    version: '1.0',
    projectInfo: {
      name,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    },
    projectSettings: {
      canvas: {
        size: {
          width: 1920,
          height: 1080,
        },
      },
    },
    layers: manifestLayers,
    layerOrder,
    links: {},
  };
}

export function resetEngineStore(
  options: {
    projectName?: string;
    manifest?: IProjectManifest;
    pxPerSec?: number;
  } = {},
): void {
  engineStore.hoveredLayerId = null;

  if (options.manifest) {
    engineStore.loadManifest(options.manifest);
  } else {
    engineStore.createBlankProject({
      name: options.projectName ?? 'Storybook Project',
      width: 1920,
      height: 1080,
    });
  }

  engineStore.setPxPerSec(options.pxPerSec ?? 20);
}

export function resetStudioStore(rightPanelView: 'layers' | 'project' = 'layers'): void {
  useStudioStore.setState(
    {
      ...getInitialStoreState(useStudioStore),
      visualLayers: [],
      audioLayers: [],
      selectedLayerId: null,
      selectedLayerIds: [],
      hoveredLayerId: null,
      hoverTime: null,
      highlightedLayerIds: [],
      collapsedScopes: new Set(),
      rightPanelView,
      rightPanelTab: 'inspector',
      timelineExtent: TIMELINE_SOFT_TARGET_SECONDS,
    },
    true,
  );
}

export function resetProjectAssetsStore(options: {
  assets: ProjectAssetRecord[];
  projectId?: string;
  isLoading?: boolean;
  isSaving?: boolean;
  error?: string | null;
}): void {
  useProjectAssetsStore.getState().clearActiveProject();
  useProjectAssetsStore.setState(
    {
      ...getInitialStoreState(useProjectAssetsStore),
      activeProjectId: options.projectId ?? STORY_PROJECT_ID,
      assets: options.assets,
      isLoading: options.isLoading ?? false,
      isSaving: options.isSaving ?? false,
      error: options.error ?? null,
    },
    true,
  );
}

export function resetAiChatStore(recommendation: AiAssetRecommendationEnvelope | null): void {
  useAiChatStore.getState().clearChat();
  useAiChatStore.setState(
    {
      ...getInitialStoreState(useAiChatStore),
      messages: [],
      isGenerating: false,
      pendingExecution: null,
      assetRecommendation: recommendation,
      autoApplyEdits: false,
    },
    true,
  );
}

export function createStorybookFixtureDecorator(
  options: StorybookFixtureDecoratorOptions = {},
): Decorator {
  return (Story) => {
    installStoryWindowApi();
    resetEngineStore({
      projectName: options.projectName,
      manifest: options.manifest,
    });
    resetStudioStore(options.rightPanelView ?? 'layers');
    resetProjectAssetsStore({
      projectId: options.projectId ?? STORY_PROJECT_ID,
      assets: options.assets ?? [],
      isLoading: options.isLoading ?? false,
      isSaving: options.isSaving ?? false,
      error: options.error ?? null,
    });
    resetAiChatStore(options.recommendation ?? null);

    return Story();
  };
}
