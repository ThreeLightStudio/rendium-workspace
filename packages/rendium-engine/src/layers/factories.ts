import type { ILayer, ILayerManifest } from '../_contracts';
import { AudioLayer } from './audio/AudioLayer';
import { ScopeEndLayer } from './scope/ScopeEndLayer';
import { ScopeStartLayer } from './scope/ScopeStartLayer';
import {
  RasterDrawableProvider,
  SpectrumDrawableProvider,
  TextDrawableProvider,
  VideoDrawableProvider,
  VisualLayer,
} from './visual';

/**
 * Capability-based runtime factory. Unsupported combinations fail fast because
 * the pre-release migration intentionally has no legacy compatibility shim.
 */
export const RuntimeLayerFactory = {
  create: (manifest: ILayerManifest): ILayer => {
    if (manifest.kind === 'control') {
      if (manifest.control?.role === 'scopeStart') return new ScopeStartLayer(manifest.id);
      if (manifest.control?.role === 'scopeEnd') {
        return new ScopeEndLayer(manifest.id, manifest.control.targetScopeId ?? '');
      }
      throw new Error(`Unsupported control layer role: ${manifest.control?.role ?? '<missing>'}`);
    }

    if (manifest.kind === 'audio') {
      const provider = manifest.source?.provider;
      const track = manifest.source?.track;
      if (provider === 'audio-file' || provider === 'generated-audio' || provider === 'stream') {
        return new AudioLayer(manifest.id);
      }
      if (provider === 'video' && track === 'audio') return new AudioLayer(manifest.id, true);
      throw new Error(`Unsupported audio source provider: ${provider ?? '<missing>'}`);
    }

    const provider = manifest.source?.provider;
    const track = manifest.source?.track;
    if (provider === 'raster' || provider === 'animated-raster' || provider === 'svg') {
      return new VisualLayer(manifest.id, new RasterDrawableProvider());
    }
    if (provider === 'video' && (track === undefined || track === 'visual')) {
      return new VisualLayer(manifest.id, new VideoDrawableProvider());
    }
    if (provider === 'text') return new VisualLayer(manifest.id, new TextDrawableProvider());
    if (provider === 'generated-visual') {
      return new VisualLayer(manifest.id, new SpectrumDrawableProvider());
    }

    throw new Error(`Unsupported visual source provider: ${provider ?? '<missing>'}`);
  },
};
