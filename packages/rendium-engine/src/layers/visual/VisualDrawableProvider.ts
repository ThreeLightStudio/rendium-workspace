import type { LayerConfig, MediaReadiness, RenderContext } from '../../_contracts';
import type { BoxGeometryDescriptor } from '../../_utils/transform';
import type { VisualLayer } from './VisualLayer';

export interface VisualDrawableProvider {
  readonly providerKind: string;

  initialize?(host: VisualLayer): void;
  setup(host: VisualLayer, device: GPUDevice, format: GPUTextureFormat): Promise<void>;
  update(
    host: VisualLayer,
    time: number,
    deltaTime: number,
    getAudioData?: (id: string) => Float32Array,
  ): void;
  getMediaReadiness?(host: VisualLayer): MediaReadiness;
  prepareFrame?(host: VisualLayer): Promise<void>;
  draw(host: VisualLayer, context: RenderContext): void;
  updateConfig(host: VisualLayer, config: LayerConfig): void;
  getConfig?(host: VisualLayer): Partial<LayerConfig>;
  getIntrinsicSize?(host: VisualLayer): { width: number; height: number };
  isReady?(host: VisualLayer): boolean;
  getTransformDescriptor?(host: VisualLayer): BoxGeometryDescriptor;
  getLocalMatrix?(host: VisualLayer): Float32Array;
  dispose(): void;
}
