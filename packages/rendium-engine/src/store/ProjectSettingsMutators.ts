import type { WritableDraft } from 'immer';
import type {
  ILayerManifest,
  IProjectManifest,
  IProjectSettings,
  ITimeRange,
  IWatermarkConfig,
} from '../_contracts';
import { type CanvasSize, computeCanvasAspectReflowLayerUpdate } from './CanvasAspectReflow';

type ManifestDraft = WritableDraft<IProjectManifest>;
type ProjectSettingsDraft = WritableDraft<IProjectSettings>;

export interface MutateCanvasSizeInput {
  readonly draft: ManifestDraft;
  readonly size: { width?: number | undefined; height?: number | undefined };
}

function cloneVector(
  color: IProjectManifest['projectSettings']['canvas']['backgroundColor'],
): [number, number, number, number] | undefined {
  if (!color) return undefined;
  return [...color] as [number, number, number, number];
}

export function mutateProjectInfo(draft: ManifestDraft, name: string): void {
  draft.projectInfo.name = name;
  draft.projectInfo.updatedAt = Date.now();
}

export function mutateProjectSettings(
  draft: ManifestDraft,
  recipe: (settings: ProjectSettingsDraft) => void,
): void {
  recipe(draft.projectSettings);
  draft.projectInfo.updatedAt = Date.now();
}

export function mutateCanvasSize(input: MutateCanvasSizeInput): void {
  const { draft, size } = input;
  const oldSize = { ...draft.projectSettings.canvas.size };
  const nextSize = resolveNextCanvasSize(oldSize, size);

  if (oldSize.width !== nextSize.width || oldSize.height !== nextSize.height) {
    mutateCanvasAspectReflow({ draft, oldSize, nextSize });
  }

  mutateProjectSettings(draft, (settings) => {
    if (size.width !== undefined) {
      settings.canvas.size.width = size.width;
    }
    if (size.height !== undefined) {
      settings.canvas.size.height = size.height;
    }
  });
}

function resolveNextCanvasSize(
  current: CanvasSize,
  size: { width?: number | undefined; height?: number | undefined },
): CanvasSize {
  return {
    width: size.width ?? current.width,
    height: size.height ?? current.height,
  };
}

interface MutateCanvasAspectReflowInput {
  readonly draft: ManifestDraft;
  readonly oldSize: CanvasSize;
  readonly nextSize: CanvasSize;
}

function mutateCanvasAspectReflow(input: MutateCanvasAspectReflowInput): void {
  const { draft, oldSize, nextSize } = input;

  for (const layerId of draft.layerOrder) {
    const layer = draft.layers[layerId];
    if (!layer) {
      continue;
    }

    const update = computeCanvasAspectReflowLayerUpdate({ layer, oldSize, nextSize });
    if (!update) {
      continue;
    }

    if (update.transform) {
      layer.transform = update.transform;
    }

    if (update.textFontSize !== undefined) {
      mutateTextFontSize(layer, update.textFontSize);
    }
  }
}

function mutateTextFontSize(layer: ILayerManifest, fontSize: number): void {
  const fontSizeParam = 'fontSize';

  if (!layer.source) {
    layer.source = { sourceId: `source:${layer.id}`, provider: 'text', track: 'visual' };
  }

  layer.source.params ??= {};
  layer.source.params[fontSizeParam] = fontSize;
}

export function mutateCanvasBackgroundColor(
  draft: ManifestDraft,
  color: IProjectManifest['projectSettings']['canvas']['backgroundColor'],
): void {
  mutateProjectSettings(draft, (settings) => {
    if (!color) {
      Reflect.deleteProperty(settings.canvas, 'backgroundColor');
      return;
    }

    const clonedColor = cloneVector(color);
    if (clonedColor) {
      settings.canvas.backgroundColor = clonedColor;
    }
  });
}

export function mutateWatermark(
  draft: ManifestDraft,
  watermark: IWatermarkConfig | undefined,
): void {
  mutateProjectSettings(draft, (settings) => {
    if (!watermark) {
      Reflect.deleteProperty(settings, 'watermark');
      return;
    }

    settings.watermark = {
      ...watermark,
      ...(watermark.position ? { position: { ...watermark.position } } : {}),
      ...(watermark.scale ? { scale: { ...watermark.scale } } : {}),
    };
  });
}

export function mutateExportRange(draft: ManifestDraft, range: ITimeRange | undefined): void {
  mutateProjectSettings(draft, (settings) => {
    if (!range) {
      Reflect.deleteProperty(settings, 'exportRange');
      return;
    }

    settings.exportRange = { ...range };
  });
}

export function mutateWorkArea(draft: ManifestDraft, range: ITimeRange | undefined): void {
  mutateProjectSettings(draft, (settings) => {
    if (!range) {
      Reflect.deleteProperty(settings, 'workArea');
      return;
    }

    settings.workArea = { ...range };
  });
}

export function mutateInjectionSegments(
  draft: ManifestDraft,
  segments: import('../_contracts').Segment[],
): void {
  draft.injectionSegments = [...segments];
  draft.projectInfo.updatedAt = Date.now();
}
