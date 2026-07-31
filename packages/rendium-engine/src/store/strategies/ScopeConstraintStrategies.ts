import type {
  ILayerManifest,
  IProjectManifest,
  LayerCapability,
  LayerId,
  ScopeRoleType,
  ScopeRuleType,
} from '../../_contracts';
import {
  IntentValidationError,
  getAllowedChildCapabilities,
  isLayerCapabilityAllowedInScopeRole,
} from '../../_contracts';
import {
  getInsertionParentSequenceRuleType,
  getInsertionParentSequenceStartLayer,
  getParentSequenceRuleType,
  getParentSequenceStartLayer,
  getSequenceBounds,
} from '../SequenceBoundsService';

export interface IScopeConstraintStrategy {
  validate(manifest: IProjectManifest, context: ScopeConstraintContext): void;
}

export interface ScopeConstraintContext {
  readonly intentType: string;
  readonly layer: ILayerManifest;
  readonly layerId?: LayerId;
  readonly insertAtIndex?: number;
}

export interface ValidateScopeConstraintInput {
  readonly manifest: IProjectManifest;
  readonly context: ScopeConstraintContext;
}

function isScopeMarkerLayer(layer?: Pick<ILayerManifest, 'kind' | 'control'>): boolean {
  return (
    layer?.kind === 'control' &&
    (layer.control?.role === 'scopeStart' || layer.control?.role === 'scopeEnd')
  );
}

function resolveScopeRole(layer?: Pick<ILayerManifest, 'control'>): ScopeRoleType {
  const scopeRole = layer?.control?.params?.scopeRole;
  return scopeRole === 'main' || scopeRole === 'overlay' || scopeRole === 'text'
    ? scopeRole
    : 'composite';
}

function getLayerCapability(layer: ILayerManifest): LayerCapability {
  return {
    kind: layer.kind,
    ...(layer.source?.provider ? { provider: layer.source.provider } : {}),
    ...(layer.control?.role ? { controlRole: layer.control.role } : {}),
  };
}

function getProjectedTiming(layer: ILayerManifest): { startTime: number; endTime: number } {
  const startTime = layer.startTime ?? 0;
  const endTime = startTime + (layer.duration ?? 0);
  return { startTime, endTime };
}

function validateNoOverlap(
  manifest: IProjectManifest,
  context: ScopeConstraintContext,
  sequenceStartLayer: ILayerManifest,
): void {
  if (isScopeMarkerLayer(context.layer)) return;

  const sequenceBounds = getSequenceBounds({ manifest, sequenceStartId: sequenceStartLayer.id });
  if (!sequenceBounds) return;

  const { startTime: newStartTime, endTime: newEndTime } = getProjectedTiming(context.layer);

  for (let i = sequenceBounds.startIndex + 1; i < sequenceBounds.endIndex; i++) {
    const layerId = manifest.layerOrder[i];
    if (!layerId) continue;

    const sibling = manifest.layers[layerId];
    if (!sibling || sibling.id === context.layerId || isScopeMarkerLayer(sibling)) continue;

    const siblingStartTime = sibling.startTime ?? 0;
    const siblingEndTime = siblingStartTime + (sibling.duration ?? 0);

    if (newStartTime < siblingEndTime && newEndTime > siblingStartTime) {
      throw new IntentValidationError(
        context.intentType,
        '해당 트랙에서는 레이어가 겹칠 수 없습니다.',
      );
    }
  }
}

function validateAddLayerCompatibility(
  manifest: IProjectManifest,
  context: ScopeConstraintContext,
): void {
  const parentSequenceStartLayer = context.layerId
    ? getParentSequenceStartLayer(manifest, context.layerId)
    : getInsertionParentSequenceStartLayer(manifest, context.insertAtIndex);

  if (
    !parentSequenceStartLayer ||
    parentSequenceStartLayer.control?.params?.isProjectAnchor === true
  ) {
    throw new IntentValidationError(
      context.intentType,
      '선택한 scope에는 레이어를 추가할 수 없습니다. scope를 먼저 선택하세요.',
    );
  }

  const parentRole = resolveScopeRole(parentSequenceStartLayer);
  if (!isLayerCapabilityAllowedInScopeRole(getLayerCapability(context.layer), parentRole)) {
    const allowed = getAllowedChildCapabilities(parentRole)
      .filter((capability) => capability.controlRole !== 'scopeStart')
      .map((capability) => capability.provider ?? capability.controlRole ?? capability.kind)
      .join(', ');
    throw new IntentValidationError(
      context.intentType,
      `선택한 scope에는 ${context.layer.kind} 레이어를 추가할 수 없습니다. 허용 타입: ${allowed}.`,
    );
  }
}

export class FreeformStrategy implements IScopeConstraintStrategy {
  public validate(_manifest: IProjectManifest, _context: ScopeConstraintContext): void {
    // No-op: freeform scopes allow all timing overlaps.
  }
}

export class MutexStrategy implements IScopeConstraintStrategy {
  public validate(manifest: IProjectManifest, context: ScopeConstraintContext): void {
    const ruleType = context.layerId
      ? getParentSequenceRuleType(manifest, context.layerId)
      : getInsertionParentSequenceRuleType(manifest, context.insertAtIndex);
    if (ruleType !== 'mutex') return;

    const sequenceStartLayer = context.layerId
      ? getParentSequenceStartLayer(manifest, context.layerId)
      : getInsertionParentSequenceStartLayer(manifest, context.insertAtIndex);
    if (!sequenceStartLayer) return;

    validateNoOverlap(manifest, context, sequenceStartLayer);
  }
}

const freeformStrategy = new FreeformStrategy();
const mutexStrategy = new MutexStrategy();

export const ScopeConstraintStrategies = {
  freeform: freeformStrategy,
  mutex: mutexStrategy,
} as const;

export function getScopeConstraintStrategy(ruleType?: ScopeRuleType): IScopeConstraintStrategy {
  return ruleType === 'mutex' ? mutexStrategy : freeformStrategy;
}

export function validateScopeConstraint(input: ValidateScopeConstraintInput): void {
  const { manifest, context } = input;
  const ruleType = context.layerId
    ? getParentSequenceRuleType(manifest, context.layerId)
    : getInsertionParentSequenceRuleType(manifest, context.insertAtIndex);

  getScopeConstraintStrategy(ruleType).validate(manifest, context);
}

export function validateScopeInsertionCompatibility(input: ValidateScopeConstraintInput): void {
  const { manifest, context } = input;
  validateAddLayerCompatibility(manifest, context);
}
