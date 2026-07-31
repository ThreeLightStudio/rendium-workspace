/**
 * @rendium/engine - Unified Flat Architecture
 */

// --- Contracts ---
export * from './_contracts';
// --- Utils (needed for Timeline Depth) ---
export * from './_utils';

// --- Core Tools (needed for Export/Internal usage) ---
export { AudioManager } from './core/AudioManager';
export { AudioLayer } from './layers/audio/AudioLayer';
export { resolveImageLayout } from './layers/visual/providers/rasterLayout';
export { VisualLayer } from './layers/visual/VisualLayer';
export type { VisualDrawableProvider } from './layers/visual/VisualDrawableProvider';
export {
  getDefaultLayerInsertionIndex,
  getInsertionParentSequenceRuleType,
  getInsertionParentSequenceStartLayer,
  getParentSequenceRuleType,
  getParentSequenceStartLayer,
  getProjectContentDuration,
  getSequenceBounds,
  getSequenceDuration,
} from './store/SequenceBoundsService';
export {
  createDefaultProjectInfo,
  createDefaultProjectSettings,
  normalizeProjectManifest,
  resolveProjectInfo,
  resolveProjectSettings,
} from './store/ProjectManifestMigration';
export { getDisplayProjectName, sanitizeProjectName } from './store/ProjectNameValidation';
export { EngineSelectors } from './store/EngineSelectors';
// --- State Bridge (CQRS + Phase 2 Manifest) ---
export { engineStore } from './store/EngineStore';
export { getAutomationValues } from './core/automationBinder';
export type { AutomationValues } from './core/automationBinder';

// --- Compiler and Validator ---
export { validatePresetSchema } from './validator/schemaValidator';
export { compileRelativeCoords, CLASSIC_VISUALIZER_PRESET } from './compiler/layoutCompiler';

// --- Note: Core internals are encapsulated. ---
