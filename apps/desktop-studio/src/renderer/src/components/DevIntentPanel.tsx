import {
  BACKGROUND_CONFIG,
  type EngineIntent,
  type ILayerManifest,
  INTENT_TYPES,
  type IProjectManifest,
  TEXT_CONFIG,
  engineStore,
} from '@rendium/engine';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useEngineStore } from '../hooks/useEngineStore';
import { useStudioStore } from '../stores/studioStore';
import { getStudioLayerType, isScopeStartManifest } from '../utils/canonicalLayer';
import { buildCenteredTextLayerManifest } from '../utils/textLayer';

const DEV_INTENT_ORDER = [
  INTENT_TYPES.ADD_LAYER,
  INTENT_TYPES.UPDATE_LAYER_PROPS,
  INTENT_TYPES.UPDATE_TRANSFORM,
  INTENT_TYPES.CHANGE_OPACITY,
  INTENT_TYPES.CHANGE_START_TIME,
  INTENT_TYPES.CHANGE_DURATION,
  INTENT_TYPES.TOGGLE_VISIBILITY,
  INTENT_TYPES.REORDER_LAYER,
  INTENT_TYPES.REMOVE_LAYER,
  INTENT_TYPES.RENAME_PROJECT,
  INTENT_TYPES.UPDATE_CANVAS_BACKGROUND_COLOR,
  INTENT_TYPES.UPDATE_WATERMARK,
  INTENT_TYPES.UPDATE_EXPORT_RANGE,
  INTENT_TYPES.UPDATE_WORK_AREA,
  INTENT_TYPES.HOVER_LAYER,
] as const;

type DevIntentType = (typeof DEV_INTENT_ORDER)[number];

interface DevTemplateContext {
  readonly snapshot: ReturnType<typeof engineStore.getSnapshot>;
  readonly manifest: ReturnType<typeof engineStore.getManifest>;
  readonly selectedLayerId: string | null;
  readonly selectedLayer: ReturnType<typeof engineStore.getLayerById> | undefined;
}

interface DevIntentDefinition {
  readonly type: DevIntentType;
  readonly label: string;
  readonly description: string;
  readonly buildTemplate: (context: DevTemplateContext) => Record<string, unknown>;
}

const DEV_INTENT_DEFINITIONS: Record<DevIntentType, DevIntentDefinition> = {
  [INTENT_TYPES.ADD_LAYER]: {
    type: INTENT_TYPES.ADD_LAYER,
    label: 'ADD_LAYER',
    description: '새 레이어를 추가합니다.',
    buildTemplate: ({ snapshot, manifest }) => {
      const textTrackStartId = manifest.layerOrder.find((layerId) => {
        const layer = manifest.layers[layerId];
        return isScopeStartManifest(layer) && layer.control?.params?.scopeRole === 'text';
      });

      return {
        type: INTENT_TYPES.ADD_LAYER,
        targetScopeId: textTrackStartId,
        manifest: buildCenteredTextLayerManifest({
          id: `dev-text-${Date.now().toString(36)}`,
          text: 'DEV dispatch text',
          name: 'DEV Text Layer',
          startTime: 0,
          duration: Math.max(snapshot.projectDuration, 5),
          canvasWidth: snapshot.width || manifest.projectSettings.canvas.size.width,
          canvasHeight: snapshot.height || manifest.projectSettings.canvas.size.height,
          params: {
            fontFamily: TEXT_CONFIG.DEFAULT_FONT_FAMILY,
            fontSize: TEXT_CONFIG.DEFAULT_FONT_SIZE,
            fontWeight: 'bold',
            color: TEXT_CONFIG.DEFAULT_COLOR,
            align: TEXT_CONFIG.DEFAULT_ALIGN,
            outlineColor: TEXT_CONFIG.DEFAULT_OUTLINE_COLOR,
            outlineWidth: TEXT_CONFIG.DEFAULT_OUTLINE_WIDTH,
          },
        }),
      };
    },
  },
  [INTENT_TYPES.UPDATE_LAYER_PROPS]: {
    type: INTENT_TYPES.UPDATE_LAYER_PROPS,
    label: 'UPDATE_LAYER_PROPS',
    description: '선택한 레이어의 속성을 일괄 변경합니다.',
    buildTemplate: ({ selectedLayerId, selectedLayer }) => ({
      type: INTENT_TYPES.UPDATE_LAYER_PROPS,
      layerId: selectedLayerId ?? 'layer-id-here',
      patch:
        selectedLayer && getStudioLayerType(selectedLayer) === 'text'
          ? {
              source: {
                sourceId: `text:${selectedLayer.id}`,
                provider: 'text',
                track: 'visual',
                params: {
                  text: 'Updated text',
                  fontSize: TEXT_CONFIG.DEFAULT_FONT_SIZE + 8,
                },
              },
            }
          : {
              appearance: { visible: true, opacity: 0.75 },
            },
    }),
  },
  [INTENT_TYPES.UPDATE_TRANSFORM]: {
    type: INTENT_TYPES.UPDATE_TRANSFORM,
    label: 'UPDATE_TRANSFORM',
    description: '선택한 레이어의 위치 / 크기 / 회전을 변경합니다.',
    buildTemplate: ({ snapshot, manifest, selectedLayerId }) => ({
      type: INTENT_TYPES.UPDATE_TRANSFORM,
      layerId: selectedLayerId ?? 'layer-id-here',
      position: {
        x: Math.round((snapshot.width || manifest.projectSettings.canvas.size.width) / 2),
        y: Math.round((snapshot.height || manifest.projectSettings.canvas.size.height) / 2),
      },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }),
  },
  [INTENT_TYPES.CHANGE_OPACITY]: {
    type: INTENT_TYPES.CHANGE_OPACITY,
    label: 'CHANGE_OPACITY',
    description: '선택한 레이어의 opacity를 변경합니다.',
    buildTemplate: ({ selectedLayerId }) => ({
      type: INTENT_TYPES.CHANGE_OPACITY,
      layerId: selectedLayerId ?? 'layer-id-here',
      opacity: 0.5,
    }),
  },
  [INTENT_TYPES.CHANGE_START_TIME]: {
    type: INTENT_TYPES.CHANGE_START_TIME,
    label: 'CHANGE_START_TIME',
    description: '선택한 레이어의 시작 시간을 변경합니다.',
    buildTemplate: ({ selectedLayerId }) => ({
      type: INTENT_TYPES.CHANGE_START_TIME,
      layerId: selectedLayerId ?? 'layer-id-here',
      startTime: 1.5,
    }),
  },
  [INTENT_TYPES.CHANGE_DURATION]: {
    type: INTENT_TYPES.CHANGE_DURATION,
    label: 'CHANGE_DURATION',
    description: '선택한 레이어의 길이를 변경합니다.',
    buildTemplate: ({ selectedLayerId }) => ({
      type: INTENT_TYPES.CHANGE_DURATION,
      layerId: selectedLayerId ?? 'layer-id-here',
      duration: 6,
    }),
  },
  [INTENT_TYPES.TOGGLE_VISIBILITY]: {
    type: INTENT_TYPES.TOGGLE_VISIBILITY,
    label: 'TOGGLE_VISIBILITY',
    description: '레이어 표시 여부를 변경합니다.',
    buildTemplate: ({ selectedLayerId }) => ({
      type: INTENT_TYPES.TOGGLE_VISIBILITY,
      layerId: selectedLayerId ?? 'layer-id-here',
      visible: false,
    }),
  },
  [INTENT_TYPES.REORDER_LAYER]: {
    type: INTENT_TYPES.REORDER_LAYER,
    label: 'REORDER_LAYER',
    description: '레이어 순서를 이동합니다.',
    buildTemplate: ({ selectedLayerId }) => ({
      type: INTENT_TYPES.REORDER_LAYER,
      layerId: selectedLayerId ?? 'layer-id-here',
      toIndex: 0,
    }),
  },
  [INTENT_TYPES.REMOVE_LAYER]: {
    type: INTENT_TYPES.REMOVE_LAYER,
    label: 'REMOVE_LAYER',
    description: '레이어를 삭제합니다.',
    buildTemplate: ({ selectedLayerId }) => ({
      type: INTENT_TYPES.REMOVE_LAYER,
      layerId: selectedLayerId ?? 'layer-id-here',
    }),
  },
  [INTENT_TYPES.RENAME_PROJECT]: {
    type: INTENT_TYPES.RENAME_PROJECT,
    label: 'RENAME_PROJECT',
    description: '프로젝트 이름을 변경합니다.',
    buildTemplate: ({ manifest }) => ({
      type: INTENT_TYPES.RENAME_PROJECT,
      name: `${manifest.projectInfo.name || 'Rendium Project'} (DEV)`,
    }),
  },
  [INTENT_TYPES.UPDATE_CANVAS_BACKGROUND_COLOR]: {
    type: INTENT_TYPES.UPDATE_CANVAS_BACKGROUND_COLOR,
    label: 'UPDATE_CANVAS_BACKGROUND_COLOR',
    description: '캔버스 배경색을 변경합니다.',
    buildTemplate: () => ({
      type: INTENT_TYPES.UPDATE_CANVAS_BACKGROUND_COLOR,
      color: BACKGROUND_CONFIG.DEFAULT_COLOR,
    }),
  },
  [INTENT_TYPES.UPDATE_WATERMARK]: {
    type: INTENT_TYPES.UPDATE_WATERMARK,
    label: 'UPDATE_WATERMARK',
    description: '워터마크 설정을 변경합니다.',
    buildTemplate: () => ({
      type: INTENT_TYPES.UPDATE_WATERMARK,
      watermark: {
        enabled: true,
        text: 'DEV watermark',
        sourceUrl: null,
        opacity: 0.4,
        position: { x: 64, y: 64 },
        scale: { x: 1, y: 1 },
      },
    }),
  },
  [INTENT_TYPES.UPDATE_EXPORT_RANGE]: {
    type: INTENT_TYPES.UPDATE_EXPORT_RANGE,
    label: 'UPDATE_EXPORT_RANGE',
    description: 'export range를 변경합니다.',
    buildTemplate: ({ snapshot }) => ({
      type: INTENT_TYPES.UPDATE_EXPORT_RANGE,
      range: {
        startTime: 0,
        endTime: Math.max(snapshot.projectDuration, 5),
      },
    }),
  },
  [INTENT_TYPES.UPDATE_WORK_AREA]: {
    type: INTENT_TYPES.UPDATE_WORK_AREA,
    label: 'UPDATE_WORK_AREA',
    description: 'work area 범위를 변경합니다.',
    buildTemplate: ({ snapshot }) => ({
      type: INTENT_TYPES.UPDATE_WORK_AREA,
      range: {
        startTime: 0,
        endTime: Math.max(snapshot.projectDuration, 5),
      },
    }),
  },
  [INTENT_TYPES.HOVER_LAYER]: {
    type: INTENT_TYPES.HOVER_LAYER,
    label: 'HOVER_LAYER',
    description: 'UI 전용 hover intent를 테스트합니다.',
    buildTemplate: ({ selectedLayerId }) => ({
      type: INTENT_TYPES.HOVER_LAYER,
      layerId: selectedLayerId,
    }),
  },
};

function formatSnapshotSummary(
  snapshot: ReturnType<typeof engineStore.getSnapshot>,
  studioState: ReturnType<typeof useStudioStore.getState>,
  selectedLayer: ReturnType<typeof engineStore.getLayerById> | undefined,
): Record<string, unknown> {
  return {
    canvas: {
      width: snapshot.width,
      height: snapshot.height,
      duration: snapshot.duration,
      projectDuration: snapshot.projectDuration,
    },
    counts: {
      layers: snapshot.layers.length,
      undo: snapshot.undoStackSize,
      redo: snapshot.redoStackSize,
    },
    studio: {
      selectedLayerId: studioState.selectedLayerId,
      rightPanelTab: studioState.rightPanelTab,
      rightPanelView: studioState.rightPanelView,
      hoveredLayerId: studioState.hoveredLayerId,
    },
    selectedLayer: selectedLayer
      ? {
          id: selectedLayer.id,
          type: getStudioLayerType(selectedLayer),
          name: selectedLayer.name ?? null,
          startTime: selectedLayer.startTime,
          duration: selectedLayer.duration,
        }
      : null,
  };
}

function summarizeManifestDiff(
  before: IProjectManifest,
  after: IProjectManifest,
): {
  added: string[];
  removed: string[];
  changed: Array<{ id: string; before: ILayerManifest; after: ILayerManifest }>;
} {
  const beforeIds = new Set(Object.keys(before.layers));
  const afterIds = new Set(Object.keys(after.layers));

  const added = after.layerOrder.filter((id) => !beforeIds.has(id));
  const removed = before.layerOrder.filter((id) => !afterIds.has(id));
  const changed: Array<{ id: string; before: ILayerManifest; after: ILayerManifest }> = [];

  for (const id of after.layerOrder) {
    if (!beforeIds.has(id) || !afterIds.has(id)) continue;
    const beforeLayer = before.layers[id];
    const afterLayer = after.layers[id];
    if (!beforeLayer || !afterLayer) continue;

    if (JSON.stringify(beforeLayer) !== JSON.stringify(afterLayer)) {
      changed.push({ id, before: beforeLayer, after: afterLayer });
    }
  }

  return { added, removed, changed };
}

function serializeTemplate(template: Record<string, unknown>): string {
  return `${JSON.stringify(template, null, 2)}\n`;
}

function getIntentDisplayLabel(type: DevIntentType): string {
  return DEV_INTENT_DEFINITIONS[type].label;
}

function getIntentDescription(type: DevIntentType): string {
  return DEV_INTENT_DEFINITIONS[type].description;
}

function buildInitialTemplate(type: DevIntentType): string {
  const definition = DEV_INTENT_DEFINITIONS[type];
  const snapshot = engineStore.getSnapshot();
  const manifest = engineStore.getManifest();
  const selectedLayerId = useStudioStore.getState().selectedLayerId;
  const selectedLayer = selectedLayerId ? engineStore.getLayerById(selectedLayerId) : undefined;

  return serializeTemplate(
    definition.buildTemplate({
      snapshot,
      manifest,
      selectedLayerId,
      selectedLayer,
    }),
  );
}

function isDevIntentType(value: string): value is DevIntentType {
  return value in DEV_INTENT_DEFINITIONS;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLayerId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNumberPair(value: unknown): value is { x: number; y: number } {
  return isPlainObject(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isColorTuple(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

function isTimeRange(value: unknown): value is { startTime: number; endTime: number } {
  return isPlainObject(value) && isFiniteNumber(value.startTime) && isFiniteNumber(value.endTime);
}

function isDevEngineIntent(value: unknown): value is EngineIntent {
  if (!isPlainObject(value)) {
    return false;
  }

  switch (value.type) {
    case INTENT_TYPES.ADD_LAYER:
      return isPlainObject(value.manifest);
    case INTENT_TYPES.UPDATE_LAYER_PROPS:
      return isLayerId(value.layerId) && isPlainObject(value.patch);
    case INTENT_TYPES.UPDATE_TRANSFORM:
      return (
        isLayerId(value.layerId) &&
        (value.position === undefined || isNumberPair(value.position)) &&
        (value.scale === undefined || isNumberPair(value.scale)) &&
        (value.rotation === undefined || isFiniteNumber(value.rotation))
      );
    case INTENT_TYPES.CHANGE_OPACITY:
      return isLayerId(value.layerId) && isFiniteNumber(value.opacity);
    case INTENT_TYPES.CHANGE_START_TIME:
      return isLayerId(value.layerId) && isFiniteNumber(value.startTime);
    case INTENT_TYPES.CHANGE_DURATION:
      return isLayerId(value.layerId) && isFiniteNumber(value.duration);
    case INTENT_TYPES.TOGGLE_VISIBILITY:
      return isLayerId(value.layerId) && typeof value.visible === 'boolean';
    case INTENT_TYPES.REORDER_LAYER:
      return isLayerId(value.layerId) && isFiniteNumber(value.toIndex);
    case INTENT_TYPES.REMOVE_LAYER:
      return isLayerId(value.layerId);
    case INTENT_TYPES.RENAME_PROJECT:
      return typeof value.name === 'string' && value.name.trim().length > 0;
    case INTENT_TYPES.UPDATE_CANVAS_BACKGROUND_COLOR:
      return value.color === undefined || isColorTuple(value.color);
    case INTENT_TYPES.UPDATE_WATERMARK:
      return value.watermark === undefined || isPlainObject(value.watermark);
    case INTENT_TYPES.UPDATE_EXPORT_RANGE:
      return value.range === undefined || isTimeRange(value.range);
    case INTENT_TYPES.UPDATE_WORK_AREA:
      return value.range === undefined || isTimeRange(value.range);
    case INTENT_TYPES.HOVER_LAYER:
      return value.layerId === null || typeof value.layerId === 'string';
    default:
      return false;
  }
}

export function DevIntentPanel(): React.JSX.Element {
  const { width, height, duration, projectDuration, layers, layerOrder } = useEngineStore();
  const currentSnapshot = engineStore.getSnapshot();
  const selectedLayerId = useStudioStore((state) => state.selectedLayerId);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIntentType, setSelectedIntentType] = useState<DevIntentType>(
    INTENT_TYPES.ADD_LAYER,
  );
  const [draftJson, setDraftJson] = useState(() => buildInitialTemplate(INTENT_TYPES.ADD_LAYER));
  const [status, setStatus] = useState<'idle' | 'dispatching' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredIntentTypes = DEV_INTENT_ORDER.filter((type) => {
    const definition = DEV_INTENT_DEFINITIONS[type];
    const haystack =
      `${definition.type} ${definition.label} ${definition.description}`.toLowerCase();
    return haystack.includes(normalizedSearchQuery);
  });

  const resetTemplate = (intentType: DevIntentType) => {
    setSelectedIntentType(intentType);
    setDraftJson(buildInitialTemplate(intentType));
    setStatus('idle');
    setStatusMessage(`Loaded ${intentType} template`);
  };

  const handleDispatch = () => {
    const definition = DEV_INTENT_DEFINITIONS[selectedIntentType];
    const beforeSnapshot = engineStore.getSnapshot();
    const beforeManifest = engineStore.getManifest();
    const studioState = useStudioStore.getState();
    const selectedLayer = selectedLayerId ? engineStore.getLayerById(selectedLayerId) : undefined;

    console.groupCollapsed(`[Rendium Dev Dispatch] ${definition.label}`);
    console.info('Selected intent:', definition.type);
    console.info('Input JSON:', draftJson);
    console.info(
      'Before snapshot summary:',
      formatSnapshotSummary(beforeSnapshot, studioState, selectedLayer),
    );

    setStatus('dispatching');
    setStatusMessage(`Dispatching ${definition.label}...`);

    try {
      const parsed: unknown = JSON.parse(draftJson);
      if (!isPlainObject(parsed)) {
        throw new Error('JSON must be an object.');
      }

      if (!isDevIntentType(String(parsed.type ?? ''))) {
        throw new Error(`Unknown or missing intent type: ${String(parsed.type ?? 'missing')}`);
      }

      if (parsed.type !== selectedIntentType) {
        throw new Error(
          `Selected intent (${selectedIntentType}) does not match JSON type (${String(parsed.type)}).`,
        );
      }

      console.info('Parsed payload:', parsed);

      if (!isDevEngineIntent(parsed)) {
        throw new Error(`Invalid payload for intent type: ${String(parsed.type)}`);
      }

      engineStore.dispatchIntent(parsed);

      const afterSnapshot = engineStore.getSnapshot();
      const afterManifest = engineStore.getManifest();
      const diff = summarizeManifestDiff(beforeManifest, afterManifest);

      console.info(
        'After snapshot summary:',
        formatSnapshotSummary(
          afterSnapshot,
          useStudioStore.getState(),
          selectedLayerId ? engineStore.getLayerById(selectedLayerId) : undefined,
        ),
      );
      console.info('Manifest diff:', diff);

      if (diff.added.length > 0) {
        console.info(
          'Added layer manifests:',
          diff.added.map((id) => afterManifest.layers[id]).filter(Boolean),
        );
      }

      if (diff.changed.length > 0) {
        console.info('Changed layer pairs:', diff.changed);
      }

      setStatus('success');
      setStatusMessage(`Dispatched ${definition.label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Dispatch failed:', error);
      setStatus('error');
      setStatusMessage(message);
    } finally {
      console.groupEnd();
    }
  };

  return (
    <div
      className="dev-intent-panel"
      data-f="root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        gap: '12px',
        padding: '14px',
        width: '100%',
        flex: '0 0 auto',
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
    >
      <div
        data-f="header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div data-f="header-copy">
          <div
            data-f="header-title"
            style={{ fontSize: '12px', fontWeight: 700, color: '#dff6ff' }}
          >
            DEV Intent Dispatch
          </div>
          <div
            data-f="header-description"
            style={{ fontSize: '11px', color: '#8da8b7', marginTop: '2px' }}
          >
            JSON payload를 엔진에 직접 dispatch하고 결과는 DevTools console에서 확인합니다.
          </div>
        </div>
        <span
          data-f="status-badge"
          style={{
            fontSize: '10px',
            padding: '4px 8px',
            borderRadius: '999px',
            background:
              status === 'error'
                ? 'rgba(255,77,77,0.16)'
                : status === 'success'
                  ? 'rgba(76,175,80,0.16)'
                  : status === 'dispatching'
                    ? 'rgba(0,191,255,0.16)'
                    : 'rgba(255,255,255,0.08)',
            color: status === 'error' ? '#ff9b9b' : status === 'success' ? '#95dea0' : '#7fd3ff',
          }}
        >
          {status === 'error'
            ? 'Error'
            : status === 'success'
              ? 'Success'
              : status === 'dispatching'
                ? 'Dispatching'
                : 'Ready'}
        </span>
      </div>

      <div
        data-f="body"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
        }}
      >
        <div
          data-f="panel-scroll-body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minHeight: 0,
            flex: 1,
          }}
        >
          <div
            data-f="search-panel"
            onFocusCapture={() => setIsSearchFocused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsSearchFocused(false);
              }
            }}
            style={{
              position: 'relative',
              zIndex: 2,
              minWidth: 0,
            }}
          >
            <div
              data-f="search-input-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <Search size={14} color="#8da8b7" />
              <input
                type="search"
                data-f="search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search intent types..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#e8f4fb',
                  fontSize: '12px',
                }}
              />
            </div>

            <div
              data-f="intent-overlay"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(10, 16, 22, 0.98)',
                boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)',
                padding: '8px',
                maxHeight: '260px',
                overflowX: 'hidden',
                overflowY: 'auto',
                boxSizing: 'border-box',
                display: isSearchFocused ? 'block' : 'none',
              }}
            >
              <div
                data-f="intent-overlay-count"
                style={{ fontSize: '11px', color: '#8da8b7', marginBottom: '8px' }}
              >
                {filteredIntentTypes.length} intent(s)
              </div>
              <div
                data-f="intent-overlay-list"
                style={{ display: 'grid', gap: '6px', minWidth: 0 }}
              >
                {filteredIntentTypes.length > 0 ? (
                  filteredIntentTypes.map((type) => {
                    const definition = DEV_INTENT_DEFINITIONS[type];
                    const isSelected = type === selectedIntentType;

                    return (
                      <button
                        key={type}
                        type="button"
                        data-f={`intent-item-${type}`}
                        onClick={() => resetTemplate(type)}
                        style={{
                          width: '100%',
                          minWidth: 0,
                          textAlign: 'left',
                          borderRadius: '10px',
                          border: isSelected
                            ? '1px solid rgba(0,191,255,0.42)'
                            : '1px solid rgba(255,255,255,0.06)',
                          background: isSelected
                            ? 'rgba(0,191,255,0.12)'
                            : 'rgba(255,255,255,0.03)',
                          color: '#edf7fb',
                          padding: '10px 10px 9px',
                          cursor: 'pointer',
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          data-f={`intent-item-label-${type}`}
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}
                        >
                          {definition.label}
                        </div>
                        <div
                          data-f={`intent-item-description-${type}`}
                          style={{
                            fontSize: '10px',
                            color: '#8da8b7',
                            marginTop: '3px',
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}
                        >
                          {definition.description}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div
                    data-f="intent-overlay-empty"
                    style={{
                      fontSize: '11px',
                      color: '#8da8b7',
                      padding: '12px 10px',
                    }}
                  >
                    No intents matched.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            data-f="editor-card"
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              flex: 1,
              position: 'relative',
              gap: '10px',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.025)',
            }}
          >
            <div
              data-f="editor-summary-card"
              style={{
                padding: '10px 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div
                data-f="editor-summary-title"
                style={{ fontSize: '12px', fontWeight: 700, color: '#dff6ff' }}
              >
                {getIntentDisplayLabel(selectedIntentType)}
              </div>
              <div
                data-f="editor-summary-description"
                style={{ fontSize: '11px', color: '#8da8b7', marginTop: '3px' }}
              >
                {getIntentDescription(selectedIntentType)}
              </div>
            </div>

            <div
              data-f="editor-toolbar"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <div data-f="editor-selected-layer" style={{ fontSize: '11px', color: '#8da8b7' }}>
                Selected layer: {selectedLayerId ?? 'none'}
              </div>
              <button
                type="button"
                data-f="editor-reset-template-button"
                onClick={() => setDraftJson(buildInitialTemplate(selectedIntentType))}
                style={{
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#edf7fb',
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: '7px 10px',
                }}
              >
                Reset template
              </button>
            </div>

            <textarea
              value={draftJson}
              onChange={(event) => setDraftJson(event.target.value)}
              spellCheck={false}
              data-f="editor-json-editor"
              style={{
                flex: '1 1 0',
                minHeight: '120px',
                width: '100%',
                minWidth: 0,
                resize: 'none',
                overflow: 'auto',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(4, 8, 12, 0.96)',
                color: '#e8f4fb',
                padding: '12px',
                fontFamily:
                  'ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace',
                fontSize: '12px',
                lineHeight: 1.5,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div
              data-f="editor-actions"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <button
                type="button"
                data-f="editor-dispatch-button"
                onClick={handleDispatch}
                disabled={status === 'dispatching'}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(0,191,255,0.35)',
                  background: 'linear-gradient(180deg, rgba(0,191,255,0.22), rgba(0,191,255,0.12))',
                  color: '#eefaff',
                  fontWeight: 700,
                  cursor: status === 'dispatching' ? 'progress' : 'pointer',
                  padding: '10px 14px',
                }}
              >
                {status === 'dispatching' ? 'Dispatching...' : 'Dispatch'}
              </button>
              <div
                data-f="editor-status-message"
                style={{ fontSize: '11px', color: '#8da8b7', lineHeight: 1.4 }}
              >
                {statusMessage}
              </div>
            </div>

            <div
              data-f="editor-help"
              style={{
                fontSize: '10px',
                color: '#7b909e',
                lineHeight: 1.5,
                padding: '10px 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              Payload type is validated against the selected intent before dispatch. Console logs
              include pre/post snapshot summaries and layer diffs.
            </div>
          </div>
        </div>
      </div>

      <div
        data-f="footer"
        style={{
          flexShrink: 0,
          fontSize: '10px',
          color: '#7b909e',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: '10px',
        }}
      >
        DevTools console is the primary output channel for this panel. Canvas {width} × {height},
        project {projectDuration.toFixed(2)}s, content {duration.toFixed(2)}s, {layerOrder.length}{' '}
        ordered layer(s), {layers.length} snapshot layer(s), undo {currentSnapshot.undoStackSize},
        redo {currentSnapshot.redoStackSize}.
      </div>
    </div>
  );
}
