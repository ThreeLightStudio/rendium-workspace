/**
 * intents.contracts.ts
 *
 * Intent-Driven Architecture — Step 1: Contract 정의
 *
 * 시스템이 허용하는 **모든** 사용자 액션을 TypeScript 인터페이스로 선언합니다.
 * 이 파일은 UI ↔ Engine 사이의 유일한 API 경계(Contract)이며,
 * TypeScript 컴파일러가 곧 검수자가 되어 코드 자체가 기능 명세서 역할을 합니다.
 *
 * Design rules:
 *  - 모든 Intent는 `type` 필드로 구분되는 Discriminated Union입니다.
 *  - UI는 "무엇을(What)" 원하는지만 전달하며, "어떻게(How)" 변이할지는 모릅니다.
 *  - ManifestMutators 내부 구조(Immer draft, layerOrder splice 등)는 절대 노출하지 않습니다.
 *  - Transient intent는 별도 유니온으로 분리하여 Draft-Commit 패턴을 명확히 합니다.
 *
 * Usage (Step 2 완료 후):
 *   engineStore.dispatchIntent({ type: 'CHANGE_OPACITY', layerId: 'abc', opacity: 0.5 });
 *   engineStore.dispatchIntent({ type: 'ADD_LAYER', layerType: 'image', ... });
 */

import type { ILayerManifest, ITimeRange, IWatermarkConfig, Segment } from './engine.contracts';
import type { LayerConfig, LayerId } from './layer.contracts';

// =============================================================================
// 1. Layer Property Intents — 개별 속성 변경
// =============================================================================

/**
 * 레이어의 불투명도를 변경합니다.
 *
 * Mapped to: mutateLayerProps(draft, layerId, l => { l.appearance.opacity = opacity })
 */
export interface IChangeOpacityIntent {
  readonly type: 'CHANGE_OPACITY';
  readonly layerId: LayerId;
  readonly opacity: number;
}

/**
 * 레이어의 시작 시간을 변경합니다.
 *
 * Mapped to: mutateLayerProps(draft, layerId, l => { l.startTime = startTime })
 */
export interface IChangeStartTimeIntent {
  readonly type: 'CHANGE_START_TIME';
  readonly layerId: LayerId;
  readonly startTime: number;
}

/**
 * 레이어의 duration을 변경합니다.
 *
 * Mapped to: mutateLayerProps(draft, layerId, l => { l.duration = duration })
 */
export interface IChangeDurationIntent {
  readonly type: 'CHANGE_DURATION';
  readonly layerId: LayerId;
  readonly duration: number;
}

/**
 * 레이어의 가시성을 토글합니다.
 *
 * Mapped to: mutateLayerProps(draft, layerId, l => { l.appearance.visible = visible })
 */
export interface IToggleVisibilityIntent {
  readonly type: 'TOGGLE_VISIBILITY';
  readonly layerId: LayerId;
  readonly visible: boolean;
}

/**
 * 레이어의 Transform(position, scale, rotation)을 일괄 변경합니다.
 * 개별 필드만 변경할 수 있도록 모두 optional입니다.
 *
 * Mapped to: mutateLayerProps(draft, layerId, l => { Object.assign(l.transform, partial) })
 */
export interface IUpdateTransformIntent {
  readonly type: 'UPDATE_TRANSFORM';
  readonly layerId: LayerId;
  readonly position?: { x: number; y: number } | undefined;
  readonly scale?: { x: number; y: number } | undefined;
  readonly rotation?: number | undefined;
}

/**
 * 레이어의 런타임 설정을 일괄 변경합니다.
 *
 * Mapped to: mutateLayerProps(draft, layerId, l => { Object.assign(l, patch) })
 */
export interface IUpdateLayerPropsIntent {
  readonly type: 'UPDATE_LAYER_PROPS';
  readonly layerId: LayerId;
  readonly patch: Partial<ILayerManifest>;
}

// =============================================================================
// 2. Layer Lifecycle Intents — 추가 / 삭제
// =============================================================================

/**
 * 새로운 레이어를 추가합니다.
 *
 * UI는 레이어 타입과 초기 설정, 그리고 목표 scope만 전달합니다.
 * layerOrder 삽입 위치 계산은 엔진이 targetScopeId 기반으로 담당합니다.
 *
 * Mapped to: addLayer(draft, manifest, targetScopeId?)
 */
export interface IAddLayerIntent {
  readonly type: 'ADD_LAYER';
  readonly manifest: ILayerManifest;
  readonly targetScopeId: LayerId;
}

/**
 * 레이어를 삭제합니다.
 *
 * Mapped to: removeLayer(draft, layerId)
 */
export interface IRemoveLayerIntent {
  readonly type: 'REMOVE_LAYER';
  readonly layerId: LayerId;
}

/**
 * 레이어의 Z-Order(렌더링 순서)를 변경합니다.
 *
 * UI는 "어떤 레이어를 몇 번째로 옮겨라"라는 의도만 전달합니다.
 * layerOrder 배열의 splice 로직은 엔진 내부에서 처리합니다.
 *
 * Mapped to: mutateLayerOrder(draft, order => { splice logic })
 */
export interface IReorderLayerIntent {
  readonly type: 'REORDER_LAYER';
  readonly layerId: LayerId;
  readonly toIndex: number;
}

// =============================================================================
// 3. Project-Level Intents — 프로젝트 메타데이터 / 캔버스 / 글로벌 설정
// =============================================================================

/**
 * 프로젝트 이름을 변경합니다.
 *
 * Mapped to: mutateProjectInfo(draft, name)
 */
export interface IRenameProjectIntent {
  readonly type: 'RENAME_PROJECT';
  readonly name: string;
}

/**
 * 캔버스 크기(해상도)를 변경하고 기존 visual content를 새 비율에 맞게 reflow합니다.
 *
 * 현재 legacyDispatch({ type: 'update_project' })로 처리되는 것을 대체합니다.
 * projectSettings 하위의 canvas/background/export 관련 전역 값은
 * 모두 manifest-level 설정으로 관리합니다.
 *
 * Mapped to:
 * - draft.projectSettings.canvas.size = { width, height }
 * - eligible visual layer transform / text fontSize reflow patches
 */
export interface IUpdateCanvasSizeIntent {
  readonly type: 'UPDATE_CANVAS_SIZE';
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/**
 * 캔버스 배경색을 변경합니다.
 *
 * Mapped to: draft.projectSettings.canvas.backgroundColor = color
 */
export interface IUpdateCanvasBackgroundColorIntent {
  readonly type: 'UPDATE_CANVAS_BACKGROUND_COLOR';
  readonly color?: [number, number, number, number] | undefined;
}

/**
 * 워터마크 글로벌 설정을 변경합니다.
 *
 * Mapped to: draft.projectSettings.watermark = watermark
 */
export interface IUpdateWatermarkIntent {
  readonly type: 'UPDATE_WATERMARK';
  readonly watermark?: IWatermarkConfig | undefined;
}

/**
 * export range 글로벌 설정을 변경합니다.
 *
 * Mapped to: draft.projectSettings.exportRange = range
 */
export interface IUpdateExportRangeIntent {
  readonly type: 'UPDATE_EXPORT_RANGE';
  readonly range?: ITimeRange | undefined;
}

/**
 * work area 글로벌 설정을 변경합니다.
 *
 * Mapped to: draft.projectSettings.workArea = range
 */
export interface IUpdateWorkAreaIntent {
  readonly type: 'UPDATE_WORK_AREA';
  readonly range?: ITimeRange | undefined;
}

/**
 * manually injected segments를 업데이트합니다.
 */
export interface IUpdateInjectionSegmentsIntent {
  readonly type: 'UPDATE_INJECTION_SEGMENTS';
  readonly segments: Segment[];
}

// =============================================================================
// 4. UI-Only Intents — 비저장 상호작용
// =============================================================================

/**
 * 레이어 호버 상태를 변경합니다 (Undo/Redo 대상 아님).
 *
 * 현재 legacyDispatch({ type: 'hover' })로 처리되는 것을 대체합니다.
 *
 * Mapped to: scene.hoveredLayerId = layerId
 */
export interface IHoverLayerIntent {
  readonly type: 'HOVER_LAYER';
  readonly layerId: LayerId | null;
}

// =============================================================================
// 5. Discriminated Union — 모든 Intent의 총합
// =============================================================================

/**
 * Persisted Intent — dispatch를 통해 Undo/Redo 기록에 남는 모든 사용자 액션.
 *
 * Intent Router(Step 2)에서 switch(intent.type)으로 분기합니다.
 * TypeScript의 exhaustive check가 누락된 intent를 컴파일 타임에 잡아냅니다.
 */
export type EngineIntent =
  // Layer Properties
  | IChangeOpacityIntent
  | IChangeStartTimeIntent
  | IChangeDurationIntent
  | IToggleVisibilityIntent
  | IUpdateTransformIntent
  | IUpdateLayerPropsIntent
  // Layer Lifecycle
  | IAddLayerIntent
  | IRemoveLayerIntent
  | IReorderLayerIntent
  // Project
  | IRenameProjectIntent
  | IUpdateCanvasSizeIntent
  | IUpdateCanvasBackgroundColorIntent
  | IUpdateWatermarkIntent
  | IUpdateExportRangeIntent
  | IUpdateWorkAreaIntent
  | IUpdateInjectionSegmentsIntent
  // UI-Only (non-persisted but routed through the same dispatcher)
  | IHoverLayerIntent;

// =============================================================================
// 6. Transient Intent — Draft-Commit 패턴 (60 FPS 프리뷰, Undo 스택 미포함)
// =============================================================================

/**
 * Transient preview — applyTransient을 통해 GPU만 업데이트하고
 * manifest/history에는 기록하지 않는 액션입니다.
 *
 * 슬라이더 드래그 중 매 프레임 호출되며,
 * 마우스를 놓을 때 대응하는 Persisted Intent를 dispatch합니다.
 *
 * Usage (Step 2 완료 후):
 *   engineStore.dispatchTransient({ type: 'TRANSIENT_LAYER_UPDATE', layerId, partial })
 */
export interface ITransientLayerUpdateIntent {
  readonly type: 'TRANSIENT_LAYER_UPDATE';
  readonly layerId: LayerId;
  readonly partial: Partial<LayerConfig>;
}

/**
 * 현재 Transient Intent는 하나뿐이지만, 향후 확장 가능성을 위해
 * 유니온 타입으로 선언합니다.
 */
export type TransientIntent = ITransientLayerUpdateIntent;

// =============================================================================
// 7. Intent Type Guards — 런타임 타입 판별 유틸리티
// =============================================================================

/** intent.type 문자열 상수 모음 (IDE 자동완성 + 테스트 사용) */
export const INTENT_TYPES = {
  // Layer Properties
  CHANGE_OPACITY: 'CHANGE_OPACITY',
  CHANGE_START_TIME: 'CHANGE_START_TIME',
  CHANGE_DURATION: 'CHANGE_DURATION',
  TOGGLE_VISIBILITY: 'TOGGLE_VISIBILITY',
  UPDATE_TRANSFORM: 'UPDATE_TRANSFORM',
  UPDATE_LAYER_PROPS: 'UPDATE_LAYER_PROPS',
  // Layer Lifecycle
  ADD_LAYER: 'ADD_LAYER',
  REMOVE_LAYER: 'REMOVE_LAYER',
  REORDER_LAYER: 'REORDER_LAYER',
  // Project
  RENAME_PROJECT: 'RENAME_PROJECT',
  UPDATE_CANVAS_SIZE: 'UPDATE_CANVAS_SIZE',
  UPDATE_CANVAS_BACKGROUND_COLOR: 'UPDATE_CANVAS_BACKGROUND_COLOR',
  UPDATE_WATERMARK: 'UPDATE_WATERMARK',
  UPDATE_EXPORT_RANGE: 'UPDATE_EXPORT_RANGE',
  UPDATE_WORK_AREA: 'UPDATE_WORK_AREA',
  UPDATE_INJECTION_SEGMENTS: 'UPDATE_INJECTION_SEGMENTS',
  // UI-Only
  HOVER_LAYER: 'HOVER_LAYER',
  // Transient
  TRANSIENT_LAYER_UPDATE: 'TRANSIENT_LAYER_UPDATE',
} as const;

/**
 * AI assistant와 제품 UI가 공통으로 사용할 수 있는
 * 엔진 편집 intent 타입의 최소 집합입니다.
 *
 * 이 값들은 모두 엔진의 public intent contract에 정의된 문자열이며,
 * 외부 계층은 이 상수를 단일 소스처럼 참조합니다.
 */
export const EDITABLE_INTENT_TYPES = [
  INTENT_TYPES.ADD_LAYER,
  INTENT_TYPES.UPDATE_LAYER_PROPS,
  INTENT_TYPES.UPDATE_TRANSFORM,
  INTENT_TYPES.TOGGLE_VISIBILITY,
  INTENT_TYPES.REORDER_LAYER,
  INTENT_TYPES.REMOVE_LAYER,
] as const;

export type EditableIntentType = (typeof EDITABLE_INTENT_TYPES)[number];

type IntentRecordKey =
  | 'color'
  | 'duration'
  | 'enabled'
  | 'endTime'
  | 'height'
  | 'id'
  | 'kind'
  | 'layerId'
  | 'manifest'
  | 'name'
  | 'opacity'
  | 'patch'
  | 'position'
  | 'range'
  | 'rotation'
  | 'scale'
  | 'segments'
  | 'sourceUrl'
  | 'startTime'
  | 'targetScopeId'
  | 'text'
  | 'toIndex'
  | 'type'
  | 'visible'
  | 'watermark'
  | 'width'
  | 'x'
  | 'y';

type IntentRecord = Record<string, unknown> & Partial<Record<IntentRecordKey, unknown>>;

function isRecord(value: unknown): value is IntentRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isVector(value: unknown): boolean {
  return isRecord(value) && isNumber(value.x) && isNumber(value.y);
}

function isColorTuple(value: unknown): boolean {
  return Array.isArray(value) && value.length === 4 && value.every(isNumber);
}

function isTimeRange(value: unknown): boolean {
  return isRecord(value) && isNumber(value.startTime) && isNumber(value.endTime);
}

function isWatermarkConfig(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || !isBoolean(value.enabled)) return false;
  if (value.text !== undefined && !isString(value.text)) return false;
  if (value.sourceUrl !== undefined && value.sourceUrl !== null && !isString(value.sourceUrl)) {
    return false;
  }
  if (value.opacity !== undefined && !isNumber(value.opacity)) return false;
  if (value.position !== undefined && !isVector(value.position)) return false;
  if (value.scale !== undefined && !isVector(value.scale)) return false;
  return true;
}

function isLayerManifestInput(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    (value.kind === 'visual' || value.kind === 'audio' || value.kind === 'control') &&
    isNumber(value.startTime) &&
    isNumber(value.duration)
  );
}

export function isEngineIntent(value: unknown): value is EngineIntent {
  if (!isRecord(value) || !isString(value.type)) return false;

  switch (value.type) {
    case 'CHANGE_OPACITY':
      return isString(value.layerId) && isNumber(value.opacity);
    case 'CHANGE_START_TIME':
      return isString(value.layerId) && isNumber(value.startTime);
    case 'CHANGE_DURATION':
      return isString(value.layerId) && isNumber(value.duration);
    case 'TOGGLE_VISIBILITY':
      return isString(value.layerId) && isBoolean(value.visible);
    case 'UPDATE_TRANSFORM':
      return (
        isString(value.layerId) &&
        (value.position === undefined || isVector(value.position)) &&
        (value.scale === undefined || isVector(value.scale)) &&
        (value.rotation === undefined || isNumber(value.rotation))
      );
    case 'UPDATE_LAYER_PROPS':
      return isString(value.layerId) && isRecord(value.patch);
    case 'ADD_LAYER':
      return isLayerManifestInput(value.manifest) && isString(value.targetScopeId);
    case 'REMOVE_LAYER':
      return isString(value.layerId);
    case 'REORDER_LAYER':
      return isString(value.layerId) && isNumber(value.toIndex);
    case 'RENAME_PROJECT':
      return isString(value.name);
    case 'UPDATE_CANVAS_SIZE':
      return (
        (value.width === undefined || isNumber(value.width)) &&
        (value.height === undefined || isNumber(value.height))
      );
    case 'UPDATE_CANVAS_BACKGROUND_COLOR':
      return value.color === undefined || isColorTuple(value.color);
    case 'UPDATE_WATERMARK':
      return isWatermarkConfig(value.watermark);
    case 'UPDATE_EXPORT_RANGE':
      return value.range === undefined || isTimeRange(value.range);
    case 'UPDATE_WORK_AREA':
      return value.range === undefined || isTimeRange(value.range);
    case 'UPDATE_INJECTION_SEGMENTS':
      return Array.isArray(value.segments);
    case 'HOVER_LAYER':
      return value.layerId === null || isString(value.layerId);
    default:
      return false;
  }
}

/**
 * 해당 intent가 Undo/Redo 기록에 남지 않는 비저장 액션인지 판별합니다.
 * Intent Router에서 persisted vs non-persisted intent 분기에 사용합니다.
 */
export function isNonPersistedIntent(intent: EngineIntent): intent is IHoverLayerIntent {
  return intent.type === 'HOVER_LAYER';
}
