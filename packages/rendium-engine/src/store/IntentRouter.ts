import type { WritableDraft } from 'immer';
import type { EngineIntent, IIntentRouter, IProjectManifest } from '../_contracts';
import { IntentValidationError } from '../_contracts';
import { addLayer, mutateLayerOrder, mutateLayerProps, removeLayer } from './ManifestMutators';
import {
  mutateCanvasBackgroundColor,
  mutateCanvasSize,
  mutateExportRange,
  mutateInjectionSegments,
  mutateProjectInfo,
  mutateWatermark,
  mutateWorkArea,
} from './ProjectSettingsMutators';
import {
  getInsertionParentSequenceStartLayer,
  getParentSequenceStartLayer,
  getSequenceBounds,
} from './SequenceBoundsService';
import {
  validateScopeConstraint,
  validateScopeInsertionCompatibility,
} from './strategies/ScopeConstraintStrategies';

export class IntentRouter implements IIntentRouter {
  public route(draft: WritableDraft<IProjectManifest>, intent: EngineIntent): void {
    switch (intent.type) {
      case 'CHANGE_OPACITY':
        mutateLayerProps({
          draft,
          layerId: intent.layerId,
          recipe: (l) => {
            if (!l.appearance) l.appearance = { visible: true, opacity: 1 };
            l.appearance.opacity = intent.opacity;
          },
        });
        return;

      case 'CHANGE_START_TIME':
        this._validateScopeTiming(draft, intent.type, intent.layerId, {
          startTime: intent.startTime,
        });
        mutateLayerProps({
          draft,
          layerId: intent.layerId,
          recipe: (l) => {
            l.startTime = intent.startTime;
          },
        });
        return;

      case 'CHANGE_DURATION':
        this._validateScopeTiming(draft, intent.type, intent.layerId, {
          duration: intent.duration,
        });
        mutateLayerProps({
          draft,
          layerId: intent.layerId,
          recipe: (l) => {
            l.duration = intent.duration;
          },
        });
        return;

      case 'TOGGLE_VISIBILITY':
        mutateLayerProps({
          draft,
          layerId: intent.layerId,
          recipe: (l) => {
            if (!l.appearance) l.appearance = { visible: true, opacity: 1 };
            l.appearance.visible = intent.visible;
          },
        });
        return;

      case 'UPDATE_TRANSFORM':
        mutateLayerProps({
          draft,
          layerId: intent.layerId,
          recipe: (l) => {
            if (!l.transform) {
              l.transform = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 };
            }
            if (intent.position) l.transform.position = intent.position;
            if (intent.scale) l.transform.scale = intent.scale;
            if (intent.rotation !== undefined) l.transform.rotation = intent.rotation;
          },
        });
        return;

      case 'UPDATE_LAYER_PROPS':
        this._validateScopeTimingFromPatch(draft, intent.type, intent.layerId, intent.patch);
        mutateLayerProps({
          draft,
          layerId: intent.layerId,
          recipe: (l) => {
            Object.assign(l, intent.patch);
          },
        });
        return;

      case 'ADD_LAYER': {
        const targetScopeId = intent.targetScopeId.trim();
        if (!targetScopeId) {
          throw new IntentValidationError(
            intent.type,
            'targetScopeId is required for ADD_LAYER. 선택한 scope를 지정하세요.',
          );
        }

        const targetScopeBounds = getSequenceBounds({
          manifest: draft,
          sequenceStartId: targetScopeId,
        });
        if (!targetScopeBounds) {
          throw new IntentValidationError(
            intent.type,
            `targetScopeId "${targetScopeId}" does not reference a valid scope:start layer.`,
          );
        }

        const insertAtIndex = targetScopeBounds.endIndex;
        const context = {
          intentType: intent.type,
          layer: intent.manifest,
          ...(insertAtIndex !== undefined ? { insertAtIndex } : {}),
        };
        validateScopeInsertionCompatibility({ manifest: draft, context });
        validateScopeConstraint({ manifest: draft, context });
        addLayer({ draft, manifest: intent.manifest, insertAtIndex });
        return;
      }

      case 'REMOVE_LAYER': {
        const targetLayer = draft.layers[intent.layerId];
        if (targetLayer?.control?.params?.isSystem === true) {
          throw new IntentValidationError(
            intent.type,
            `Layer "${intent.layerId}" is a system scaffold layer and cannot be removed.`,
          );
        }
        removeLayer(draft, intent.layerId);
        return;
      }

      case 'REORDER_LAYER': {
        const layer = draft.layers[intent.layerId];
        if (!layer) {
          throw new IntentValidationError(
            intent.type,
            `Layer "${intent.layerId}" not found in manifest.`,
          );
        }
        if (
          layer.kind === 'control' &&
          (layer.control?.role === 'scopeStart' || layer.control?.role === 'scopeEnd')
        ) {
          throw new IntentValidationError(intent.type, 'Scope marker layers cannot be reordered.');
        }

        const currentParentSequence = getParentSequenceStartLayer(draft, intent.layerId);
        const targetParentSequence = getInsertionParentSequenceStartLayer(draft, intent.toIndex);
        if (
          !currentParentSequence ||
          !targetParentSequence ||
          currentParentSequence.id !== targetParentSequence.id
        ) {
          throw new IntentValidationError(
            intent.type,
            '레이어는 같은 scope 안에서만 이동할 수 있습니다.',
          );
        }

        mutateLayerOrder(draft, (order) => {
          const currentIndex = order.indexOf(intent.layerId);
          if (currentIndex !== -1) {
            order.splice(currentIndex, 1);
            order.splice(intent.toIndex, 0, intent.layerId);
          }
        });
        return;
      }

      case 'RENAME_PROJECT':
        mutateProjectInfo(draft, intent.name);
        return;

      case 'UPDATE_CANVAS_SIZE': {
        const size: { width?: number | undefined; height?: number | undefined } = {};
        if (intent.width !== undefined) size.width = intent.width;
        if (intent.height !== undefined) size.height = intent.height;
        mutateCanvasSize({ draft, size });
        return;
      }

      case 'UPDATE_CANVAS_BACKGROUND_COLOR':
        mutateCanvasBackgroundColor(draft, intent.color);
        return;

      case 'UPDATE_WATERMARK':
        mutateWatermark(draft, intent.watermark);
        return;

      case 'UPDATE_EXPORT_RANGE':
        mutateExportRange(draft, intent.range);
        return;

      case 'UPDATE_WORK_AREA':
        mutateWorkArea(draft, intent.range);
        return;

      case 'UPDATE_INJECTION_SEGMENTS':
        mutateInjectionSegments(draft, intent.segments);
        return;

      case 'HOVER_LAYER':
        throw new IntentValidationError(
          intent.type,
          'HOVER_LAYER is non-persisted and must be handled before IntentRouter.route().',
        );

      default:
        this._assertUnhandledIntent(intent);
    }
  }

  private _assertUnhandledIntent(intent: never): never {
    throw new IntentValidationError(
      'UNKNOWN_INTENT',
      `No handler registered for intent: ${JSON.stringify(intent)}`,
    );
  }

  private _validateScopeTiming(
    draft: WritableDraft<IProjectManifest>,
    intentType: string,
    layerId: string,
    patch: { startTime?: number; duration?: number },
  ): void {
    const layer = draft.layers[layerId];
    if (!layer) return;

    validateScopeConstraint({
      manifest: draft,
      context: {
        intentType,
        layerId,
        layer: {
          ...layer,
          ...patch,
        },
      },
    });
  }

  private _validateScopeTimingFromPatch(
    draft: WritableDraft<IProjectManifest>,
    intentType: string,
    layerId: string,
    patch: {
      readonly startTime?: unknown;
      readonly duration?: unknown;
      readonly [key: string]: unknown;
    },
  ): void {
    const timingPatch: { startTime?: number; duration?: number } = {};
    if (typeof patch.startTime === 'number') timingPatch.startTime = patch.startTime;
    if (typeof patch.duration === 'number') timingPatch.duration = patch.duration;

    if (timingPatch.startTime === undefined && timingPatch.duration === undefined) return;

    this._validateScopeTiming(draft, intentType, layerId, timingPatch);
  }
}
