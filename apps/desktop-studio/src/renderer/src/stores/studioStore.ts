import { getProjectContentDuration } from '@rendium/engine';
import { create } from 'zustand';
import {
  type StudioLayerType,
  getSourceParam,
  getStudioLayerTypeFromManifest,
} from '../utils/canonicalLayer';
import { TIMELINE_SOFT_TARGET_SECONDS, clampTimelineExtent } from '../utils/timelineViewport';

export const TIMELINE_EXTENT_PADDING_SECONDS = 5;

function getInitialTimelineExtent(manifest: import('@rendium/engine').IProjectManifest): number {
  const contentDuration = getProjectContentDuration(manifest);
  return clampTimelineExtent(contentDuration + TIMELINE_EXTENT_PADDING_SECONDS);
}

/**
 * UI 표시용 시각 레이어 메타데이터
 * zIndex는 제거 — 배열 내 순서(position)가 곧 렌더링 순서
 */
export interface LayerInfo {
  id: string;
  type: Exclude<StudioLayerType, 'audio' | 'scope:start' | 'scope:end'>;
  name: string;
  visible: boolean;
}

/**
 * UI 표시용 오디오 소스 메타데이터
 * Z-order 없음 — 믹싱 대상
 */
export interface AudioLayerInfo {
  /** 고유 ID (엔진 AudioManager의 key) */
  id: string;
  /** 파일명 표시 */
  name: string;
  /** 0.0 ~ 1.0 볼륨 (향후 확장) */
  volume: number;
  /** 뮤트 상태 */
  muted: boolean;
  /** 재생 시작 시간 */
  startTime: number;
  /** 재생 지속 시간 */
  duration: number;
}

interface StudioState {
  // ─── Layer Data ───
  /** 시각적 레이어 — Z-order 있음 */
  visualLayers: LayerInfo[];
  /** 오디오 소스 — Z-order 없음 */
  audioLayers: AudioLayerInfo[];

  // ─── UI State ───
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  hoveredLayerId: string | null;
  hoverTime: number | null;
  highlightedLayerIds: string[]; // 다중 강조용 ID 배열
  collapsedScopes: Set<string>;
  rightPanelView: 'layers' | 'project';
  rightPanelTab: 'inspector' | 'ai' | 'dev';
  timelineExtent: number;

  // ─── Visual Layer Actions ───
  selectLayer: (id: string | null) => void;
  selectLayers: (ids: string[]) => void;
  toggleSelectedLayer: (id: string) => void;
  clearSelection: () => void;
  setHoveredLayer: (id: string | null) => void;
  setHoverTime: (time: number | null) => void;
  setHighlightedLayers: (ids: string[]) => void; // 다중 강조 설정
  toggleScope: (scopeId: string) => void;
  openProjectSettings: () => void;
  showLayerPanel: () => void;
  showInspectorTab: () => void;
  showAiAssistant: () => void;
  showDevTools: () => void;
  ensureTimelineExtent: (extent: number) => void;

  /**
   * 시각 레이어를 제거합니다.
   */
  removeLayer: (id: string) => void;

  /**
   * 시각 레이어 가시성을 토글합니다.
   */
  toggleLayerVisibility: (id: string) => void;

  // ─── Audio Layer Actions ───
  /**
   * 오디오 소스를 추가합니다.
   */
  addAudioLayer: (id: string, name: string) => void;

  /**
   * 오디오 소스를 제거합니다.
   */
  removeAudioLayer: (id: string) => void;

  /**
   * 오디오 소스의 뮤트 상태를 토글합니다.
   */
  toggleAudioMute: (id: string) => void;

  /**
   * 외부 manifest 로드 시 UI 스토어를 전체 동기화합니다.
   */
  loadScene: (manifest: import('@rendium/engine').IProjectManifest) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  // ─── 초기 상태 ───
  visualLayers: [],
  audioLayers: [],
  selectedLayerId: null,
  selectedLayerIds: [],
  hoveredLayerId: null,
  hoverTime: null,
  highlightedLayerIds: [],
  collapsedScopes: new Set(),
  rightPanelView: 'layers',
  rightPanelTab: 'inspector',
  timelineExtent: TIMELINE_SOFT_TARGET_SECONDS,

  // ─── Visual Layer Actions ───
  selectLayer: (id) =>
    set({
      selectedLayerId: id,
      selectedLayerIds: id ? [id] : [],
    }),

  selectLayers: (ids) => {
    const selectedLayerIds = Array.from(new Set(ids)).filter((id): id is string => id.length > 0);
    set({
      selectedLayerIds,
      selectedLayerId: selectedLayerIds[0] ?? null,
    });
  },

  toggleSelectedLayer: (id) =>
    set((state) => {
      const selectedLayerIds = state.selectedLayerIds.includes(id)
        ? state.selectedLayerIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedLayerIds, id];

      return {
        selectedLayerIds,
        selectedLayerId: selectedLayerIds[0] ?? null,
      };
    }),

  clearSelection: () => set({ selectedLayerId: null, selectedLayerIds: [] }),

  setHoveredLayer: (id) => set({ hoveredLayerId: id }),
  setHoverTime: (t) => set({ hoverTime: t }),
  setHighlightedLayers: (ids) => set({ highlightedLayerIds: ids }),
  openProjectSettings: () =>
    set({
      rightPanelView: 'project',
      rightPanelTab: 'inspector',
      selectedLayerId: null,
      selectedLayerIds: [],
    }),
  showLayerPanel: () =>
    set({
      rightPanelView: 'layers',
      rightPanelTab: 'inspector',
      selectedLayerId: null,
      selectedLayerIds: [],
    }),
  showInspectorTab: () => set({ rightPanelTab: 'inspector' }),
  showAiAssistant: () => set({ rightPanelTab: 'ai' }),
  showDevTools: () => set({ rightPanelTab: 'dev' }),
  ensureTimelineExtent: (extent) => {
    const nextExtent = clampTimelineExtent(extent);
    if (nextExtent <= get().timelineExtent) {
      return;
    }

    set({
      timelineExtent: nextExtent,
    });
  },

  toggleScope: (scopeId) =>
    set((state) => {
      const collapsedScopes = new Set(state.collapsedScopes);
      if (collapsedScopes.has(scopeId)) {
        collapsedScopes.delete(scopeId);
      } else {
        collapsedScopes.add(scopeId);
      }
      return { collapsedScopes };
    }),

  removeLayer: (id) => {
    set((state) => {
      const newLayers = state.visualLayers.filter((l) => l.id !== id);
      const selectedLayerIds = state.selectedLayerIds.filter((selectedId) => selectedId !== id);
      return {
        visualLayers: newLayers,
        // 삭제된 레이어가 선택 중이었으면 선택 해제
        selectedLayerIds,
        selectedLayerId: selectedLayerIds[0] ?? null,
      };
    });
  },

  toggleLayerVisibility: (id) =>
    set((state) => ({
      visualLayers: state.visualLayers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l,
      ),
    })),

  // ─── Audio Layer Actions ───
  addAudioLayer: (id, name, startTime = 0, duration = 5) =>
    set((state) => ({
      audioLayers: [
        ...state.audioLayers,
        { id, name, volume: 1.0, muted: false, startTime, duration },
      ],
    })),

  removeAudioLayer: (id) =>
    set((state) => ({
      audioLayers: state.audioLayers.filter((a) => a.id !== id),
    })),

  toggleAudioMute: (id) =>
    set((state) => ({
      audioLayers: state.audioLayers.map((a) => (a.id === id ? { ...a, muted: !a.muted } : a)),
    })),

  loadScene: (manifest: import('@rendium/engine').IProjectManifest) => {
    const visualLayers: LayerInfo[] = [];
    const audioLayers: AudioLayerInfo[] = [];

    // Use layerOrder to maintain the correct sequence
    for (const id of manifest.layerOrder) {
      const layer = manifest.layers[id];
      if (!layer) continue;

      const layerType = getStudioLayerTypeFromManifest(layer);
      if (layerType === 'audio') {
        audioLayers.push({
          id,
          name: layer.name || 'Audio',
          volume: getSourceParam<number>(layer, 'volume') ?? 1.0,
          muted: getSourceParam<boolean>(layer, 'muted') ?? false,
          startTime: layer.startTime ?? 0,
          duration: layer.duration ?? 30,
        });
      } else if (layerType !== 'scope:start' && layerType !== 'scope:end') {
        // Skip scope markers for the visual layers list
        visualLayers.push({
          id,
          type: layerType as LayerInfo['type'],
          name: layer.name || layerType || 'Visual Layer',
          visible: layer.appearance?.visible ?? true,
        });
      }
    }

    set({
      visualLayers,
      audioLayers,
      selectedLayerId: null,
      selectedLayerIds: [],
      rightPanelTab: 'inspector',
      rightPanelView: 'layers',
      collapsedScopes: new Set(),
      timelineExtent: getInitialTimelineExtent(manifest),
    });
  },
}));
