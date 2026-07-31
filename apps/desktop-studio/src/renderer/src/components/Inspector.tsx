import type {
  IAudioLayer,
  ILayerManifest,
  IRenderableLayer,
  JsonValue,
  LayerConfig,
} from '@rendium/engine';
import { SPECTRUM_CONFIG, TEXT_CONFIG as TEXT_DEFAULTS, engineStore } from '@rendium/engine';
import { useRef, useState } from 'react';
import { useEngineStore } from '../hooks/useEngineStore';
import { useLocale } from '../i18n/locale';
import type { AudioLayerInfo } from '../stores/studioStore';
import { useStudioStore } from '../stores/studioStore';
import { useProjectAssetsStore } from '../stores/useProjectAssetsStore';
import {
  buildLayerPatchFromConfig,
  getManifestForLayer,
  getSourceParam,
  getSourceParams,
  getStudioLayerType,
  isScopeEndManifest,
  isScopeStartManifest,
} from '../utils/canonicalLayer';
import { getLayerLabel } from '../utils/layer';
import { isAudioRuntimeLayer, isRenderableRuntimeLayer } from '../utils/runtimeLayerGuards';
import {
  buildDeleteSelectionIntents,
  buildDuplicateSelectionBatch,
} from '../utils/selectionActions';
import {
  isUnsupportedVideoFileError,
  VIDEO_IMPORT_ACCEPT,
} from '../utils/videoImport';
import { AudioControlPanel } from './Inspector/AudioControlPanel';
import { BackgroundControlPanel } from './Inspector/BackgroundControlPanel';
import { TextControlPanel, type TextControlValue } from './Inspector/TextControlPanel';
import { TransformControlPanel } from './Inspector/TransformControlPanel';
import { VideoControlPanel } from './Inspector/VideoControlPanel';
import {
  InspectorDisclosure,
  InspectorField,
  InspectorFileInput,
  InspectorGroup,
  InspectorNumberInput,
  InspectorRangeInput,
  InspectorSection,
  InspectorValue,
} from './Inspector/ui';
import { SpectrumControlPanel, type SpectrumControlValue } from './SpectrumControlPanel';
import { toast } from './ToastSystem';

interface InspectorProps {
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  currentTime?: number;
}

type Rgba = [number, number, number, number];

function numberFromParam(value: JsonValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringFromParam(value: JsonValue | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function booleanFromParam(value: JsonValue | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function nullableStringFromParam(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function getScopeLocalTimeForLayer(layerId: string, currentTime: number): number {
  const manifest = engineStore.getManifest();
  const layerIndex = manifest.layerOrder.indexOf(layerId);
  const stack: ILayerManifest[] = [];

  for (let index = 0; index < layerIndex; index += 1) {
    const layer = manifest.layers[manifest.layerOrder[index] ?? ''];
    if (!layer) continue;

    if (isScopeStartManifest(layer)) stack.push(layer);
    if (isScopeEndManifest(layer)) stack.pop();
  }

  return stack.reduce((scopeTime, scopeLayer) => scopeTime - scopeLayer.startTime, currentTime);
}

function isLayerActiveAtCurrentTime(layer: ILayerManifest, currentTime?: number): boolean {
  if (currentTime === undefined || !Number.isFinite(currentTime)) return true;
  const maybeInfiniteLayer = layer as ILayerManifest & { isInfinite?: boolean };
  if (layer.control?.params?.isProjectAnchor === true || maybeInfiniteLayer.isInfinite === true) {
    return true;
  }
  if (layer.duration <= 0) return false;

  const scopeLocalTime = getScopeLocalTimeForLayer(layer.id, currentTime);
  return scopeLocalTime >= layer.startTime && scopeLocalTime < layer.startTime + layer.duration;
}

function rgbaFromParam(value: JsonValue | undefined, fallback: Rgba): Rgba {
  if (
    Array.isArray(value) &&
    value.length >= 4 &&
    value.slice(0, 4).every((channel) => typeof channel === 'number')
  ) {
    return [value[0] as number, value[1] as number, value[2] as number, value[3] as number];
  }
  return [...fallback] as Rgba;
}

function pointFromParam(
  value: JsonValue | undefined,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const point = value as Record<string, JsonValue>;
    return {
      x: numberFromParam(point.x, fallback.x),
      y: numberFromParam(point.y, fallback.y),
    };
  }
  return { ...fallback };
}

function alignFromParam(value: JsonValue | undefined): 'left' | 'center' | 'right' {
  return value === 'left' || value === 'center' || value === 'right'
    ? value
    : TEXT_DEFAULTS.DEFAULT_ALIGN;
}

function buildTextControlValue(manifest?: ILayerManifest): TextControlValue {
  const params = manifest ? getSourceParams(manifest) : {};
  return {
    text: stringFromParam(params.text, 'Text'),
    fontFamily: stringFromParam(params.fontFamily, TEXT_DEFAULTS.DEFAULT_FONT_FAMILY),
    fontSize: numberFromParam(params.fontSize, TEXT_DEFAULTS.DEFAULT_FONT_SIZE),
    fontWeight: stringFromParam(params.fontWeight, 'bold'),
    color: rgbaFromParam(params.color, [...TEXT_DEFAULTS.DEFAULT_COLOR] as Rgba),
    align: alignFromParam(params.align),
    outlineColor: rgbaFromParam(params.outlineColor, [
      ...TEXT_DEFAULTS.DEFAULT_OUTLINE_COLOR,
    ] as Rgba),
    outlineWidth: numberFromParam(params.outlineWidth, TEXT_DEFAULTS.DEFAULT_OUTLINE_WIDTH),
    anchor: pointFromParam(params.anchor, TEXT_DEFAULTS.DEFAULT_ANCHOR),
  };
}

function buildSpectrumControlValue(
  manifest: ILayerManifest | undefined,
  layer: Partial<IRenderableLayer>,
): SpectrumControlValue {
  const params = manifest ? getSourceParams(manifest) : {};
  return {
    position: layer.position ?? manifest?.transform?.position ?? SPECTRUM_CONFIG.DEFAULT_POSITION,
    scale: layer.scale ?? manifest?.transform?.scale ?? SPECTRUM_CONFIG.DEFAULT_SCALE,
    linkedAudioId: nullableStringFromParam(params.linkedAudioId),
    bandCount: numberFromParam(params.bandCount, SPECTRUM_CONFIG.DEFAULT_BAND_COUNT),
    barGap: numberFromParam(params.barGap, SPECTRUM_CONFIG.DEFAULT_BAR_GAP),
    minHeight: numberFromParam(params.minHeight, SPECTRUM_CONFIG.DEFAULT_MIN_HEIGHT),
    maxHeight: numberFromParam(params.maxHeight, SPECTRUM_CONFIG.DEFAULT_MAX_HEIGHT),
    gain: numberFromParam(params.gain, SPECTRUM_CONFIG.DEFAULT_GAIN),
    smoothing: numberFromParam(params.smoothing, SPECTRUM_CONFIG.DEFAULT_SMOOTHING),
    color: rgbaFromParam(params.color, [...SPECTRUM_CONFIG.DEFAULT_COLOR] as Rgba),
    minFrequency: numberFromParam(params.minFrequency, SPECTRUM_CONFIG.DEFAULT_MIN_FREQUENCY),
    maxFrequency: numberFromParam(params.maxFrequency, SPECTRUM_CONFIG.DEFAULT_MAX_FREQUENCY),
    spectralTilt: numberFromParam(params.spectralTilt, SPECTRUM_CONFIG.DEFAULT_SPECTRAL_TILT),
    gradientMode: booleanFromParam(params.gradientMode, SPECTRUM_CONFIG.DEFAULT_GRADIENT_MODE),
    colorLow: rgbaFromParam(params.colorLow, [...SPECTRUM_CONFIG.DEFAULT_COLOR_LOW] as Rgba),
    colorHigh: rgbaFromParam(params.colorHigh, [...SPECTRUM_CONFIG.DEFAULT_COLOR_HIGH] as Rgba),
  };
}

/**
 * Property Inspector component — Phase 6 Intent-Driven pattern.
 *
 * Slider interactions follow a two-phase model:
 *  1. onChange  → dispatchTransient({ type: 'TRANSIENT_LAYER_UPDATE', ... })
 *  2. onMouseUp → dispatchIntent({ type: 'UPDATE_LAYER_PROPS', ... })
 *
 * This ensures dragging a slider never pollutes the Undo stack.
 * Only releasing the mouse creates one atomic history record.
 */
export function Inspector({ selectedLayerId, selectedLayerIds, currentTime }: InspectorProps) {
  const { t } = useLocale();
  const {
    layers,
    dispatchIntent,
    dispatchTransient,
    duration: projectDuration,
    getLayerById,
    width: canvasWidth,
    height: canvasHeight,
  } = useEngineStore();
  const selectedLayerCandidates = Array.from(
    new Set([...(selectedLayerId ? [selectedLayerId] : []), ...selectedLayerIds]),
  );
  const activeSelectedLayerIds = selectedLayerCandidates.filter((layerId) => {
    const selectedManifestLayer = getManifestForLayer(layerId);
    return selectedManifestLayer ? isLayerActiveAtCurrentTime(selectedManifestLayer, currentTime) : false;
  });
  const activeLayerId =
    selectedLayerId && activeSelectedLayerIds.includes(selectedLayerId)
      ? selectedLayerId
      : activeSelectedLayerIds[0] ?? null;
  const layer = activeLayerId ? getLayerById(activeLayerId) : undefined;
  const manifestLayer = activeLayerId ? getManifestForLayer(activeLayerId) : undefined;

  // Track the "committed" value so onMouseUp can send the correct final value.
  // Using a ref to avoid causing extra re-renders during transient preview.
  const pendingValues = useRef<Partial<LayerConfig>>({});
  const [durationSliderMax, setDurationSliderMax] = useState<number | null>(null);

  if (activeSelectedLayerIds.length > 1) {
    return <BatchSelectionInspector selectedLayerIds={activeSelectedLayerIds} />;
  }

  if (!activeLayerId || !layer) {
    return (
      <div
        className="inspector-container project-settings"
        style={{ padding: '12px 4px', color: '#EEE' }}
      >
        <InspectorGroup>
          <InspectorField label={t('editor.resolution')} value={`${canvasWidth} x ${canvasHeight}`}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '4px',
                  background: 'rgba(0,191,255,0.15)',
                  border: '1px solid #00BFFF',
                  color: '#00BFFF',
                  cursor: 'default',
                  fontSize: '11px',
                  opacity: 1,
                }}
              >
                {`${t('lobby.landscape')} 1920×1080`}
              </button>
            </div>
          </InspectorField>

          <BackgroundControlPanel />

          <InspectorField
            label={t('editor.totalLayers')}
            value={
              <InspectorValue>{layers.filter((l) => !l.isProjectAnchor).length}</InspectorValue>
            }
          >
            <div style={{ fontSize: '13px', color: '#888' }}>{t('editor.visibleLayers')}</div>
          </InspectorField>
        </InspectorGroup>

        <div
          className="inspector-footer"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.05)',
            paddingTop: '16px',
            marginTop: '16px',
            fontSize: '11px',
            color: '#444',
          }}
        >
          {t('editor.activeProject')}
        </div>
      </div>
    );
  }

  const layerType = getStudioLayerType(layer);
  const isScope = layerType.startsWith('scope:');

  /**
   * Commit handler — produces a single Immer patch and Undo record.
   * Called on onMouseUp / onBlur / discrete onChange events.
   */
  const handleCommit = (config: Partial<LayerConfig>) => {
    const runtimeImagePreview =
      config.imageSource !== undefined
        ? {
            imageSource: config.imageSource,
            ...(config.sourceUrl !== undefined ? { sourceUrl: config.sourceUrl } : {}),
          }
        : null;

    if (runtimeImagePreview) {
      dispatchTransient({
        type: 'TRANSIENT_LAYER_UPDATE',
        layerId: activeLayerId,
        partial: runtimeImagePreview,
      });
    }

    dispatchIntent({
      type: 'UPDATE_LAYER_PROPS',
      layerId: activeLayerId,
      patch: manifestLayer ? buildLayerPatchFromConfig(manifestLayer, config) : {},
    });
    if (runtimeImagePreview) {
      dispatchTransient({
        type: 'TRANSIENT_LAYER_UPDATE',
        layerId: activeLayerId,
        partial: runtimeImagePreview,
      });
    }
    // Clear pending state after commit
    pendingValues.current = {};
  };

  /**
   * Transient handler — previews the change at 60 FPS without creating patches.
   * Called on slider onChange.  The value is remembered in pendingValues so
   * onMouseUp can commit the exact final position.
   */
  const handleTransient = (config: Partial<LayerConfig>) => {
    Object.assign(pendingValues.current, config);
    dispatchTransient({
      type: 'TRANSIENT_LAYER_UPDATE',
      layerId: activeLayerId,
      partial: config,
    });
  };

  /**
   * Commit whichever value is currently pending.  Targets sliders' onMouseUp.
   */
  const handleSliderCommit = () => {
    if (Object.keys(pendingValues.current).length > 0) {
      handleCommit(pendingValues.current);
    }
  };

  const beginDurationDrag = () => {
    setDurationSliderMax((current) => current ?? projectDuration);
  };

  const endDurationDrag = () => {
    handleSliderCommit();
    setDurationSliderMax(null);
  };

  const effectiveDurationMax = Math.max(0.1, durationSliderMax ?? projectDuration);

  return (
    <section
      className="inspector-container"
      onMouseEnter={() => dispatchIntent({ type: 'HOVER_LAYER', layerId: activeLayerId })}
      onMouseLeave={() => dispatchIntent({ type: 'HOVER_LAYER', layerId: null })}
      style={{ padding: '12px 4px', color: '#EEE' }}
      aria-label={t('editor.layerInspector')}
    >
      <h3
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: '#AAA',
          textTransform: 'uppercase',
        }}
      >
        {t('editor.layerInspector')}: {layerType}
      </h3>

      <InspectorLayerBody
        key={layer.id}
        layer={layer}
        manifestLayer={manifestLayer}
        layerType={layerType}
        layers={layers}
        isScope={isScope}
        getLayerLabel={getLayerLabel}
        effectiveDurationMax={effectiveDurationMax}
        handleCommit={handleCommit}
        handleTransient={handleTransient}
        handleSliderCommit={handleSliderCommit}
        beginDurationDrag={beginDurationDrag}
        endDurationDrag={endDurationDrag}
      />

      <div
        className="inspector-footer"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: '16px',
          marginTop: '16px',
          fontSize: '11px',
          color: '#444',
        }}
      >
        {t('editor.passiveView')}
      </div>
    </section>
  );
}

type BatchSelectionInspectorProps = {
  selectedLayerIds: string[];
};

function BatchSelectionInspector({ selectedLayerIds }: BatchSelectionInspectorProps) {
  const { t } = useLocale();
  const { getLayerById } = useEngineStore();

  const selectedLayers = selectedLayerIds
    .map((layerId) => getLayerById(layerId))
    .filter((layer): layer is NonNullable<ReturnType<typeof engineStore.getLayerById>> =>
      Boolean(layer),
    );
  const selectedNames = selectedLayers.map((layer) => getLayerLabel(layer));
  const selectionCount = selectedLayerIds.length;
  const selectionTitle = t('rightPanel.selection', { count: selectionCount });

  const handleDeleteSelection = () => {
    const intents = buildDeleteSelectionIntents(selectedLayerIds, engineStore.getManifest());
    if (intents.length === 0) {
      return;
    }

    engineStore.executeAtomicIntentBatch(intents);
    useStudioStore.getState().clearSelection();
  };

  const handleDuplicateSelection = () => {
    const { intents, createdLayerIds } = buildDuplicateSelectionBatch(
      selectedLayerIds,
      engineStore.getManifest(),
    );
    if (intents.length === 0) {
      return;
    }

    engineStore.executeAtomicIntentBatch(intents);
    useStudioStore.getState().selectLayers(createdLayerIds);
  };

  const handleClearSelection = () => {
    useStudioStore.getState().clearSelection();
  };

  return (
    <section
      className="inspector-container"
      style={{ padding: '12px 4px', color: '#EEE' }}
      aria-label={selectionTitle}
    >
      <h3
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: '#AAA',
          textTransform: 'uppercase',
        }}
      >
        {selectionTitle}
      </h3>

      <InspectorGroup>
        <InspectorSection title={t('rightPanel.selection', { count: selectionCount })}>
          <InspectorField
            label={t('editor.layer')}
            value={<InspectorValue>{selectionCount}</InspectorValue>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '13px', color: '#D9D9E3' }}>
                {selectedNames.length > 0 ? selectedNames.join(', ') : t('global.none')}
              </div>
              <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.45 }}>
                {selectedLayerIds.join(', ')}
              </div>
            </div>
          </InspectorField>

          <InspectorField
            label={t('editor.layerId')}
            value={<InspectorValue>{selectionCount}</InspectorValue>}
          >
            <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.45 }}>
              {t('editor.selectionActionsHint')}
            </div>
          </InspectorField>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleDuplicateSelection}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(0,191,255,0.25)',
                background: 'rgba(0,191,255,0.1)',
                color: '#00BFFF',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {t('layer.duplicate')}
            </button>
            <button
              type="button"
              onClick={handleDeleteSelection}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,68,68,0.25)',
                background: 'rgba(255,68,68,0.08)',
                color: '#FF7777',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {t('layer.delete')}
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.04)',
                color: '#DDD',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {t('editor.clearSelection')}
            </button>
          </div>

          <div style={{ marginTop: '8px', fontSize: '12px', color: '#888', lineHeight: 1.5 }}>
            {t('editor.selectionActionsNote')}
          </div>
        </InspectorSection>
      </InspectorGroup>

      <div
        className="inspector-footer"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: '16px',
          marginTop: '16px',
          fontSize: '11px',
          color: '#444',
        }}
      >
        {t('editor.passiveView')}
      </div>
    </section>
  );
}

type InspectorLayerBodyProps = {
  layer: NonNullable<ReturnType<typeof engineStore.getLayerById>>;
  manifestLayer?: ReturnType<typeof getManifestForLayer>;
  layerType: ReturnType<typeof getStudioLayerType>;
  layers: Array<NonNullable<ReturnType<typeof engineStore.getLayerById>>>;
  isScope: boolean;
  getLayerLabel: typeof getLayerLabel;
  effectiveDurationMax: number;
  handleCommit: (config: Partial<LayerConfig>) => void;
  handleTransient: (config: Partial<LayerConfig>) => void;
  handleSliderCommit: () => void;
  beginDurationDrag: () => void;
  endDurationDrag: () => void;
};

function InspectorLayerBody({
  layer,
  manifestLayer,
  layerType,
  layers,
  isScope,
  getLayerLabel,
  effectiveDurationMax,
  handleCommit,
  handleTransient,
  handleSliderCommit,
  beginDurationDrag,
  endDurationDrag,
}: InspectorLayerBodyProps) {
  const { t } = useLocale();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const audioLayer = isAudioRuntimeLayer(layer) ? layer : null;
  const renderableLayer = isRenderableRuntimeLayer(layer) ? layer : null;
  const opacity = renderableLayer?.opacity ?? 1;
  const audioLayerInfos: AudioLayerInfo[] = layers
    .filter(
      (candidate): candidate is IAudioLayer =>
        getStudioLayerType(candidate) === 'audio' && isAudioRuntimeLayer(candidate),
    )
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name || candidate.id,
      volume: candidate.volume,
      muted: candidate.muted,
      startTime: candidate.startTime,
      duration: candidate.duration,
    }));

  return (
    <InspectorGroup>
      <InspectorSection title={t('editor.layerOverview')}>
        <InspectorField
          label={t('editor.layer')}
          value={<InspectorValue>{getLayerLabel(layer)}</InspectorValue>}
          hint={`ID: ${layer.id}`}
        />

        <InspectorField
          label={t('editor.opacity')}
          value={<InspectorValue>{opacity.toFixed(2)}</InspectorValue>}
        >
          <InspectorRangeInput
            id={`${layer.id}-opacity`}
            min="0"
            max="1"
            step="0.01"
            value={opacity}
            onChange={(e) => handleTransient({ opacity: Number.parseFloat(e.target.value) })}
            onMouseUp={handleSliderCommit}
          />
        </InspectorField>

        <InspectorDisclosure
          title={t('editor.advanced')}
          open={advancedOpen}
          onToggle={() => setAdvancedOpen((current) => !current)}
        >
          <InspectorField
            label={t('editor.startTime')}
            value={<InspectorValue>{layer.startTime.toFixed(2)}s</InspectorValue>}
          >
            <InspectorNumberInput
              id={`${layer.id}-startTime`}
              min="0"
              step="0.1"
              inputMode="decimal"
              value={layer.startTime}
              onChange={(e) =>
                handleTransient({
                  startTime: Number.isFinite(Number.parseFloat(e.target.value))
                    ? Number.parseFloat(e.target.value)
                    : 0,
                })
              }
              onBlur={handleSliderCommit}
            />
          </InspectorField>

          <InspectorField
            label={t('editor.duration')}
            value={<InspectorValue>{layer.duration.toFixed(2)}s</InspectorValue>}
          >
            <InspectorRangeInput
              id={`${layer.id}-duration`}
              min="0.1"
              max={Math.max(layer.duration, effectiveDurationMax)}
              step="0.1"
              value={layer.duration}
              onChange={(e) =>
                handleTransient({
                  duration: Number.parseFloat(e.target.value),
                })
              }
              onFocus={beginDurationDrag}
              onPointerDown={beginDurationDrag}
              onPointerUp={endDurationDrag}
              onMouseUp={endDurationDrag}
              onBlur={endDurationDrag}
            />
          </InspectorField>
        </InspectorDisclosure>
      </InspectorSection>

      {layerType === 'audio' && audioLayer && (
        <AudioControlPanel
          key={layer.id}
          layer={audioLayer}
          sourceUrl={getSourceParam<string>(manifestLayer, 'sourceUrl') ?? null}
          onUpdate={handleCommit}
          onTransient={handleTransient}
          onCommit={handleSliderCommit}
        />
      )}

      {layerType === 'text' && (
        <TextControlPanel layer={buildTextControlValue(manifestLayer)} onUpdate={handleCommit} />
      )}

      {layerType === 'video' && (
        <>
          <VideoControlPanel
            key={layer.id}
            layer={layer}
            sourceUrl={getSourceParam<string>(manifestLayer, 'sourceUrl') ?? null}
            onUpdate={handleCommit}
            onTransient={handleTransient}
            onCommit={handleSliderCommit}
          />
          <InspectorSection title={t('editor.video')}>
            <InspectorField label={t('inspector.addVideo')} hint={t('inspector.videoHint')}>
              <InspectorFileInput
                id="input-video-source"
                accept={VIDEO_IMPORT_ACCEPT}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const sourceUrl = await useProjectAssetsStore.getState().ingestFile(file);
                    handleCommit({
                      sourceUrl,
                      name: file.name,
                    });
                  } catch (err) {
                    console.error('[Inspector] Failed to update video source:', err);
                    toast.error(
                      t(
                        isUnsupportedVideoFileError(err)
                          ? 'assets.unsupportedVideo'
                          : 'assets.videoAddFailed',
                      ),
                      { message: err instanceof Error ? err.message : file.name },
                    );
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </InspectorField>
          </InspectorSection>
        </>
      )}

      {layerType === 'image' && (
        <InspectorSection title={t('editor.image')}>
          <InspectorField label={t('inspector.sourceUrl')}>
            <div
              style={{
                fontFamily: 'mono',
                color: 'rgba(255, 255, 255, 0.6)',
                wordBreak: 'break-all',
                fontSize: '11px',
                marginTop: '4px',
              }}
            >
              {getSourceParam<string>(manifestLayer, 'sourceUrl') || t('inspector.noSourceFile')}
            </div>
          </InspectorField>
          <InspectorField label={t('inspector.addImage')} hint={t('inspector.imageHint')}>
            <InspectorFileInput
              id="input-image-source"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const sourceUrl = await useProjectAssetsStore.getState().ingestFile(file);
                  const bitmap = await createImageBitmap(file).catch(() => null);
                  handleCommit({
                    sourceUrl,
                    sourceWidth: bitmap?.width ?? undefined,
                    sourceHeight: bitmap?.height ?? undefined,
                    imageSource: bitmap ?? undefined,
                    name: file.name,
                  });
                } catch (err) {
                  console.error('[Inspector] Failed to update image source:', err);
                } finally {
                  e.target.value = '';
                }
              }}
            />
          </InspectorField>
        </InspectorSection>
      )}

      {layerType === 'spectrum' && (
        <SpectrumControlPanel
          layer={buildSpectrumControlValue(manifestLayer, renderableLayer ?? {})}
          audioLayers={audioLayerInfos}
          onUpdate={handleCommit}
        />
      )}

      {!isScope && layerType !== 'audio' && renderableLayer && (
        <TransformControlPanel
          layer={renderableLayer}
          onUpdate={handleCommit}
          onTransient={handleTransient}
          onCommit={handleSliderCommit}
        />
      )}
    </InspectorGroup>
  );
}
